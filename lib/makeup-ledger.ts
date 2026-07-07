// 주말 보강 원장(makeup ledger) — 휴가로 빠진 학습분을 추적·누적·완료입력 가능한 원장의 단일 소스.
// 순수 함수만 둔다. 승인 훅(3경로)이 accrueMakeupForLeave 로 발생량을 스냅샷 가산하고,
// 학생이 /api/student/makeup 으로 logMakeupDone 을 눌러 완료분을 누적(진도 동반 회복)한다.
//
// 파생형(getWeekendMakeupItems/getMakeupAmount 창 스코프 + 쿠폰 이월)을 대체 — 이월은 자동 누적으로 흡수.
import type { BookProgress, LectureProgress, LeaveRequest, MakeupNotice, Student } from '@/lib/types/student';
import { getActiveStudyDays, getMaterialStudyDays } from '@/lib/progress-plan';

export type MaterialType = 'book' | 'lecture';

export interface MakeupLedgerItem {
  id: string;               // `makeup_${subjectId}_${materialId}`
  materialId: string;
  materialType: MaterialType;
  subjectId: string;
  subjectName: string;
  materialTitle: string;
  unit: string;             // 'p' | '강' 등
  owed: number;
  done: number;
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

// 날짜 문자열(YYYY-MM-DD, KST 캘린더)의 요일 키. 로컬 자정 Date 로 계산(leave.date 와 동일 기준).
function dayKeyOf(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return DAY_KEYS[dt.getDay()];
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

const materialUnit = (material: BookProgress | LectureProgress, type: MaterialType): string =>
  type === 'book' ? ((material as BookProgress).unit || 'p') : '강';

const materialTitle = (material: BookProgress | LectureProgress, type: MaterialType): string =>
  type === 'book' ? (material as BookProgress).title : (material as LectureProgress).name;

// leave.date 에 활성인 일일 계획의 일일량. 없으면 null.
function activeDailyAmount(material: BookProgress | LectureProgress, dateKey: string): number | null {
  const active = (material.detailedPlans || []).find(
    (p) => !p.periodType && p.startDate <= dateKey && dateKey <= p.endDate,
  );
  if (!active) return null;
  return Math.max(1, Math.round(active.dailyAmount ?? Math.ceil((active.targetAmount || 1) / 6)));
}

// 1) 승인 휴가 1건 → 자료별 보강 발생량을 material.makeupOwed 에 스냅샷 가산(멱등).
//    이미 leave.makeupAccruedAt 있으면 재가산하지 않는다. 반환된 accrued 로 알림을 만든다.
export function accrueMakeupForLeave(
  student: Student,
  leave: LeaveRequest,
): { accrued: AccruedItem[] } {
  const accrued: AccruedItem[] = [];
  if (leave.makeupAccruedAt) return { accrued }; // 이미 가산됨(멱등).
  if (leave.status !== 'approved') return { accrued };

  const slot = resolveLeaveSlot(leave);
  const exemptedSlots: Array<'morning' | 'afternoon' | 'night'> =
    slot === 'fullday' ? ['morning', 'afternoon', 'night'] : [slot];
  const leaveDayKey = dayKeyOf(leave.date);

  for (const subject of student.subjects || []) {
    const studyTime = subject.studyTime;
    // 슬롯 매칭: 과목 studyTime 이 면제 슬롯에 포함돼야(fullday 면 오전/오후/야간 배정 자료 전부).
    if (!studyTime || !exemptedSlots.includes(studyTime as 'morning' | 'afternoon' | 'night')) continue;

    const materials: Array<{ m: BookProgress | LectureProgress; type: MaterialType }> = [
      ...(subject.books || []).map((m) => ({ m, type: 'book' as const })),
      ...(subject.lectures || []).map((m) => ({ m, type: 'lecture' as const })),
    ];

    for (const { m, type } of materials) {
      // 자료 학습요일이 휴가일 요일을 포함해야(미설정이면 기본 월~토).
      const days = getActiveStudyDays(getMaterialStudyDays(subject.studyDays, m.studyDays));
      if (!days.includes(leaveDayKey)) continue;

      const dailyAmt = activeDailyAmount(m, leave.date);
      if (dailyAmt === null || dailyAmt <= 0) continue;

      const unit = materialUnit(m, type);
      m.makeupOwed = (m.makeupOwed || 0) + dailyAmt;
      m.makeupHistory = [...(m.makeupHistory || []), { leaveDate: leave.date, leaveType: leave.type, amount: dailyAmt }];
      accrued.push({ subjectName: subject.name, materialTitle: materialTitle(m, type), amount: dailyAmt, unit, materialType: type });
    }
  }

  if (accrued.length > 0) {
    leave.makeupAccruedAt = new Date().toISOString();
  }
  return { accrued };
}

// 2) 남은 보강(remaining>0) 자료 원장. makeup-tab / 홈 주말 보강 박스의 단일 소스.
export function getMakeupLedger(student: Student): MakeupLedgerItem[] {
  return getMakeupObligations(student).filter((it) => it.remaining > 0);
}

// 보강이 발생한(owed>0) 전체 자료(완료분 포함). 홈 '오늘 할 일' 카운트(총/완료) 판정용.
export function getMakeupObligations(student: Student): MakeupLedgerItem[] {
  const out: MakeupLedgerItem[] = [];
  for (const subject of student.subjects || []) {
    const materials: Array<{ m: BookProgress | LectureProgress; type: MaterialType }> = [
      ...(subject.books || []).map((m) => ({ m, type: 'book' as const })),
      ...(subject.lectures || []).map((m) => ({ m, type: 'lecture' as const })),
    ];
    for (const { m, type } of materials) {
      const owed = m.makeupOwed || 0;
      if (owed <= 0) continue;
      const done = m.makeupDone || 0;
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

// 3) 학생이 보강을 완료 입력 — makeupDone 누적 + 진도(currentPage/completedLectures) 동반 회복.
//    자료 없으면 null. applied<=0 이면 아무 것도 바꾸지 않고 {applied:0, remaining} 반환.
export function logMakeupDone(
  student: Student,
  materialId: string,
  materialType: MaterialType,
  amount: number,
): { applied: number; remaining: number } | null {
  let found: BookProgress | LectureProgress | null = null;
  for (const subject of student.subjects || []) {
    const list = materialType === 'book' ? subject.books || [] : subject.lectures || [];
    const m = list.find((it) => it.id === materialId);
    if (m) { found = m; break; }
  }
  if (!found) return null;

  const owed = found.makeupOwed || 0;
  const done = found.makeupDone || 0;
  const remaining = Math.max(0, owed - done);
  const applied = Math.max(0, Math.min(Math.round(Number(amount) || 0), remaining));
  if (applied <= 0) return { applied: 0, remaining };

  found.makeupDone = done + applied;
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

// 4) accrued(자료별) → 알림 1건. 빈 배열이면 null.
export function buildMakeupNotice(accrued: AccruedItem[], nowIso: string): MakeupNotice | null {
  if (accrued.length === 0) return null;
  return {
    id: `mkn_${Date.parse(nowIso) || Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: nowIso,
    items: accrued.map((a) => ({ subjectName: a.subjectName, materialTitle: a.materialTitle, amount: a.amount, unit: a.unit })),
  };
}

// 승인 훅 공용 — accrue 실행 후 발생분이 있으면 makeupNotices 에 append(최근 30건 유지).
// 반환된 알림(없으면 null)은 호출부가 추가 처리(로그 등)에 쓸 수 있다.
export function accrueMakeupAndNotify(student: Student, leave: LeaveRequest): MakeupNotice | null {
  const { accrued } = accrueMakeupForLeave(student, leave);
  const notice = buildMakeupNotice(accrued, new Date().toISOString());
  if (notice) {
    student.makeupNotices = [...(student.makeupNotices || []), notice].slice(-30);
  }
  return notice;
}
