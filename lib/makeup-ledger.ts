// 주말 보강 원장(makeup ledger) — "주중(월~금) 못 지킨 계획분량을 주말에 보강"의 단일 소스.
// Phase 2(2026-07-08): per-event 적립 → **토요일 주간 정산(파생·자기교정)** 으로 전환.
//   owed = Σ(주중 계획 일일량) − Σ(주중 완료분) − (정해진 반차/휴식 면제분).
//   → 개인사정·병가·무단이탈·지각·그냥 못한 것 전부 자연히 미달분에 포함(사유 불문).
//   → 정해진 반차/휴식·쿠폰 교환권만 면제(보강 없이 계획이 밀림). 학생이 평일에 따라잡으면 owed 0(자기교정).
//   done 은 주 단위(makeupWeekKey)로 스코프 — 지난 주 완료분이 이번 주 owed 를 상쇄하지 않는다.
import type { BookProgress, LectureProgress, LeaveRequest, MakeupNotice, Student, SubjectProgress } from '@/lib/types/student';
import { getActiveStudyDays, getMaterialStudyDays } from '@/lib/progress-plan';
import { timeSlotBlocks } from '@/lib/academy-timetable';
import { getPlanDailyCompletion } from '@/lib/student-activity';
import { weekKeyOf, addDaysToDateKey } from '@/lib/makeup-carryover';

export type MaterialType = 'book' | 'lecture';

export interface MakeupLedgerItem {
  id: string;               // `makeup_${subjectId}_${materialId}`
  materialId: string;
  materialType: MaterialType;
  subjectId: string;
  subjectName: string;
  materialTitle: string;
  unit: string;             // 'p' | '강' 등
  owed: number;             // 이번 주 미달분(파생)
  done: number;             // 이번 주 보강 완료분
  remaining: number;        // max(0, owed - done)
}

export interface AccruedItem {
  subjectName: string;
  materialTitle: string;
  amount: number;
  unit: string;
  materialType: MaterialType;
}

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
// 주중 = 월~금(offset 0~4, weekKey=월요일 기준). 주말(토/일)에 이 미달분을 보강한다.
const WEEKDAY_OFFSET = ['mon', 'tue', 'wed', 'thu', 'fri'] as const;

// 날짜 문자열(YYYY-MM-DD, KST 캘린더)의 요일 키. 로컬 자정 Date 로 계산(leave.date 와 동일 기준).
function dayKeyOf(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return DAY_KEYS[dt.getDay()];
}

// 기본 오늘(KST) — 호출부 미지정 시. leave.date/weekKeyOf 와 동일한 KST 캘린더 기준.
function kstTodayKey(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  return parts; // en-CA → YYYY-MM-DD
}

// 휴가 → 면제 슬롯. use-report-state/timetable-tab 의 resolveLeaveSlot·getLeaveExemptions 와 동일 규칙.
function resolveLeaveSlot(leave: LeaveRequest): 'morning' | 'afternoon' | 'night' | 'fullday' {
  const t = leave.type;
  if (t === 'morning' || t === 'afternoon' || t === 'night') return t;
  if (t === 'fullday' || t === 'personal_fullday') return 'fullday';
  const s = leave.slot;
  if (s === 'morning' || s === 'afternoon' || s === 'night' || s === 'fullday') return s;
  return 'fullday'; // 병가·개인반차(슬롯 미지정) → 하루 종일
}

// 면제(defer) 휴가: 정해진 반차(오전/오후/야간)·휴식권(fullday)·쿠폰 교환권 사용.
// 이들은 보강 없이 계획이 밀린다 → 주간 미달분에서 제외.
// 개인사정(personal_*)·병가(sick)는 면제 아님 → 미달분에 남아 주말 보강 대상.
function isDeferLeave(leave: LeaveRequest): boolean {
  if (leave.usedCredit || leave.usedCoupon) return true;
  const t = leave.type;
  return t === 'morning' || t === 'afternoon' || t === 'night' || t === 'fullday';
}

// 특정 날짜에 이 과목 슬롯을 면제하는 정해진 휴가가 있는가(그 날 계획분을 미달분에서 제외).
function isDeferLeaveOnDay(student: Student, dateKey: string, studyTime?: string): boolean {
  for (const req of student.leaveRequests || []) {
    if (req.status !== 'approved' || req.date !== dateKey) continue;
    if (!isDeferLeave(req)) continue;
    const slot = resolveLeaveSlot(req);
    if (slot === 'fullday') return true;
    if (studyTime && slot === studyTime) return true;
  }
  return false;
}

const materialUnit = (material: BookProgress | LectureProgress, type: MaterialType): string =>
  type === 'book' ? ((material as BookProgress).unit || 'p') : '강';

const materialTitle = (material: BookProgress | LectureProgress, type: MaterialType): string =>
  type === 'book' ? (material as BookProgress).title : (material as LectureProgress).name;

const subjectMaterials = (subject: SubjectProgress): Array<{ m: BookProgress | LectureProgress; type: MaterialType }> => [
  ...(subject.books || []).map((m) => ({ m, type: 'book' as const })),
  ...(subject.lectures || []).map((m) => ({ m, type: 'lecture' as const })),
];

// 자료 1건의 이번 주(월~오늘, 최대 금요일) 미달분. 정해진 휴가일은 제외, 완료분은 차감.
function weeklyMaterialShortfall(
  student: Student,
  subject: SubjectProgress,
  material: BookProgress | LectureProgress,
  weekKey: string,
  todayKey: string,
): number {
  const studyDays = getActiveStudyDays(getMaterialStudyDays(subject.studyDays, material.studyDays));
  let planned = 0;
  let done = 0;
  for (let i = 0; i < WEEKDAY_OFFSET.length; i++) {
    const dayKey = addDaysToDateKey(weekKey, i);
    if (dayKey > todayKey) break;                       // 아직 안 온 요일은 집계 제외(초과집계 방지)
    if (!studyDays.includes(WEEKDAY_OFFSET[i])) continue;
    const plan = (material.detailedPlans || []).find(
      (p) => !p.periodType && p.startDate <= dayKey && dayKey <= p.endDate,
    );
    if (!plan) continue;                                // 일일 계획 없음(기간목표·자율·미설정) → 미달 판정 제외
    if (isDeferLeaveOnDay(student, dayKey, subject.studyTime)) continue; // 정해진 휴가 면제
    const daily = Math.max(1, Math.round(plan.dailyAmount ?? Math.ceil((plan.targetAmount || 1) / 6)));
    planned += daily;
    const comp = getPlanDailyCompletion(plan, dayKey);
    if (comp.isCompleted) done += typeof comp.actualAmount === 'number' ? comp.actualAmount : daily;
  }
  return Math.max(0, planned - done);
}

// 보강 대상(owed>0) 전체 자료(완료분 포함). 홈 '오늘 할 일' 카운트(총/완료) 판정용.
export function getMakeupObligations(student: Student, todayKey: string = kstTodayKey()): MakeupLedgerItem[] {
  const weekKey = weekKeyOf(todayKey);
  const out: MakeupLedgerItem[] = [];
  for (const subject of student.subjects || []) {
    for (const { m, type } of subjectMaterials(subject)) {
      const owed = weeklyMaterialShortfall(student, subject, m, weekKey, todayKey);
      if (owed <= 0) continue;
      const done = m.makeupWeekKey === weekKey ? m.makeupDone || 0 : 0;
      out.push({
        id: `makeup_${subject.id}_${m.id}`,
        materialId: m.id,
        materialType: type,
        subjectId: subject.id,
        subjectName: subject.name,
        materialTitle: materialTitle(m, type),
        unit: materialUnit(m, type),
        owed,
        done,
        remaining: Math.max(0, owed - done),
      });
    }
  }
  return out;
}

// 남은 보강(remaining>0) 자료 원장. makeup-tab / 홈 주말 보강 박스의 단일 소스.
export function getMakeupLedger(student: Student, todayKey: string = kstTodayKey()): MakeupLedgerItem[] {
  return getMakeupObligations(student, todayKey).filter((it) => it.remaining > 0);
}

// 학생이 보강을 완료 입력 — makeupDone(주 스코프) 누적 + 진도(currentPage/completedLectures) 동반 회복.
// 자료 없으면 null. applied<=0 이면 아무 것도 바꾸지 않고 {applied:0, remaining} 반환.
export function logMakeupDone(
  student: Student,
  materialId: string,
  materialType: MaterialType,
  amount: number,
  todayKey: string = kstTodayKey(),
): { applied: number; remaining: number } | null {
  const weekKey = weekKeyOf(todayKey);
  let foundSubject: SubjectProgress | null = null;
  let found: BookProgress | LectureProgress | null = null;
  for (const subject of student.subjects || []) {
    const list = materialType === 'book' ? subject.books || [] : subject.lectures || [];
    const m = list.find((it) => it.id === materialId);
    if (m) { foundSubject = subject; found = m; break; }
  }
  if (!found || !foundSubject) return null;

  const owed = weeklyMaterialShortfall(student, foundSubject, found, weekKey, todayKey);
  // 주가 바뀌면 지난 주 done 은 0으로 리셋(주 스코프).
  const doneStored = found.makeupWeekKey === weekKey ? found.makeupDone || 0 : 0;
  const remaining = Math.max(0, owed - doneStored);
  const applied = Math.max(0, Math.min(Math.round(Number(amount) || 0), remaining));
  if (applied <= 0) return { applied: 0, remaining };

  found.makeupWeekKey = weekKey;
  found.makeupDone = doneStored + applied;
  // 진도 정합 — 보강 N = 진도 N 회복(총량 상한).
  if (materialType === 'book') {
    const b = found as BookProgress;
    b.currentPage = Math.min(b.totalPages, (b.currentPage || 0) + applied);
  } else {
    const l = found as LectureProgress;
    l.completedLectures = Math.min(l.totalLectures, (l.completedLectures || 0) + applied);
  }
  found.updatedAt = new Date().toISOString();
  return { applied, remaining: Math.max(0, owed - found.makeupDone) };
}

// accrued(자료별) → 알림 1건. 빈 배열이면 null.
export function buildMakeupNotice(accrued: AccruedItem[], nowIso: string): MakeupNotice | null {
  if (accrued.length === 0) return null;
  return {
    id: `mkn_${Date.parse(nowIso) || Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: nowIso,
    items: accrued.map((a) => ({ subjectName: a.subjectName, materialTitle: a.materialTitle, amount: a.amount, unit: a.unit })),
  };
}

// 개인사정/병가 휴가 승인 시 "이번 주말 보강에 반영돼요" heads-up 알림(멱등).
// owed 는 주간 정산으로 파생하므로 여기서 원장을 건드리지 않는다 — 알림(예상 분량)만 남긴다.
// 정해진 반차/휴식(defer)은 보강 없이 계획이 밀리므로 알림도 없다.
export function notifyMakeupLeave(student: Student, leave: LeaveRequest): MakeupNotice | null {
  if (leave.status !== 'approved') return null;
  if (leave.makeupAccruedAt) return null; // 이미 알림 보냄(멱등).
  if (isDeferLeave(leave)) return null;   // 정해진 휴가 → 보강 없음.

  const slot = resolveLeaveSlot(leave);
  const exemptedSlots: Array<'morning' | 'afternoon' | 'night'> =
    slot === 'fullday' ? ['morning', 'afternoon', 'night'] : [slot];
  const leaveDayKey = dayKeyOf(leave.date);

  const items: AccruedItem[] = [];
  for (const subject of student.subjects || []) {
    for (const { m, type } of subjectMaterials(subject)) {
      // 슬롯은 자료별 studyTime(관리자 지정) 우선, 없으면 과목 studyTime.
      // 시:분 슬롯('t:')은 겹치는 블록으로 환산해 판정 — 어느 한 블록이라도 면제 대상이면 포함.
      const studyTime = m.studyTime || subject.studyTime;
      if (!studyTime) continue;
      const materialBlocks: Array<'morning' | 'afternoon' | 'night'> =
        studyTime === 'morning' || studyTime === 'afternoon' || studyTime === 'night'
          ? [studyTime]
          : timeSlotBlocks(studyTime);
      if (!materialBlocks.some((b) => exemptedSlots.includes(b))) continue;
      const days = getActiveStudyDays(getMaterialStudyDays(subject.studyDays, m.studyDays));
      if (!days.includes(leaveDayKey)) continue;
      const plan = (m.detailedPlans || []).find(
        (p) => !p.periodType && p.startDate <= leave.date && leave.date <= p.endDate,
      );
      if (!plan) continue;
      const daily = Math.max(1, Math.round(plan.dailyAmount ?? Math.ceil((plan.targetAmount || 1) / 6)));
      items.push({ subjectName: subject.name, materialTitle: materialTitle(m, type), amount: daily, unit: materialUnit(m, type), materialType: type });
    }
  }
  if (items.length === 0) return null;

  leave.makeupAccruedAt = new Date().toISOString();
  const notice = buildMakeupNotice(items, new Date().toISOString());
  if (notice) student.makeupNotices = [...(student.makeupNotices || []), notice].slice(-30);
  return notice;
}
