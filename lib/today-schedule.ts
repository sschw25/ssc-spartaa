// 오늘 계획 자동 배치(Phase 1) — "무엇을(과목+분량)"을 척추로, "언제(교시)"를 파생으로.
// 학생이 슬롯을 안 정한 자료도 빈 학습 교시에 자동 배정해 "시간표가 짜인 것처럼" 보이게 한다.
// 타임테이블(실시간 하루 계획표)과 홈 '오늘 할 일'이 이 단일 소스를 공유한다.
import type { Student, LeaveRequest, BookProgress, LectureProgress, SubjectProgress } from '@/lib/types/student';
import { ACADEMY_TIMETABLE, isBlockSlot, isPeriodSlot, type StudyTimeKey } from '@/lib/academy-timetable';
import { getMaterialStudyDays } from '@/lib/progress-plan';
import { getPlanDailyCompletion } from '@/lib/student-activity';
import { getAwayRangesForDay, type WeekdayKey } from '@/lib/away-impact';

export interface TodayScheduleItem {
  id: string;                       // 홈 todayPlanEntries 와 동일 키(`${dateKey}_${subjectId}_${materialId}_${planId}`)
  subjectName: string;
  title: string;
  materialType: 'book' | 'lecture';
  materialId: string;
  planId?: string;
  amount: number;                   // 오늘 목표량(selfPaced=0)
  unit: string;
  range: string;
  speed?: number;
  isCompleted?: boolean;
  actualAmount?: number;
  selfPaced?: boolean;
  current?: number;                 // selfPaced 누적
  weekly?: boolean;                 // 주간목표(deadline) 자료 — 학생이 교시 지정 시 노출
  pinnedSlot: string;               // '' | morning|afternoon|night | p0..p8 (학생 지정)
}

export interface AssignedScheduleItem extends TodayScheduleItem {
  periodKey: string;                // 배정된 교시 p0..p8
  autoPlaced: boolean;              // 학생이 안 정한 걸 자동 배정했는지(표시엔 미사용, 향후용)
}

// 학습 성격 교시(안정 키 보유). 순서 = 시간 순.
const STUDY_PERIODS = ACADEMY_TIMETABLE.filter(
  (p): p is typeof p & { periodKey: string } =>
    !!p.periodKey && (p.type === 'study' || p.type === 'late-study' || p.type === 'supplement'),
);
// 자동 배치 대상은 본 학습 교시(1~7교시)만 — 0교시(영어테스트)·심야 자율은 명시 핀일 때만 사용.
const AUTO_PERIODS = STUDY_PERIODS.filter((p) => p.type === 'study');

const PERIOD_NUM_LABEL: Record<string, string> = {
  p0: '0교시', p1: '1교시', p2: '2교시', p3: '3교시', p4: '4교시',
  p5: '5교시', p6: '6교시', p7: '7교시', p8: '심야',
};

// 교시 키 → 짧은 라벨('3교시'). 홈 '오늘 할 일' 배정 시간 표시용.
export function getPeriodNumLabel(periodKey?: string): string {
  return (periodKey && PERIOD_NUM_LABEL[periodKey]) || '';
}

const toMin = (hhmm: string): number => {
  const [h, m] = (hhmm || '').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

const materialTitle = (m: BookProgress | LectureProgress, type: 'book' | 'lecture'): string =>
  type === 'book' ? (m as BookProgress).title : (m as LectureProgress).name;

const materialUnit = (m: BookProgress | LectureProgress, type: 'book' | 'lecture'): string =>
  type === 'book' ? ((m as BookProgress).unit || 'p') : '강';

// 휴가 종류 → 면제 슬롯. getLeaveExemptions/타임테이블 resolveLeaveSlot 과 동일 규칙.
function resolveLeaveSlot(req: LeaveRequest): 'morning' | 'afternoon' | 'night' | 'fullday' {
  const t = req.type;
  if (t === 'morning' || t === 'afternoon' || t === 'night') return t;
  if (t === 'fullday' || t === 'personal_fullday') return 'fullday';
  const s = req.slot;
  if (s === 'morning' || s === 'afternoon' || s === 'night' || s === 'fullday') return s;
  return 'fullday'; // 병가·개인반차(슬롯 미지정) → 하루 종일
}

// 오늘 휴가(슬롯/전일)·정기 외출(시간 겹침)로 막힌 교시 키 집합.
export function getBlockedPeriodKeys(student: Student, todayKey: string, todayDayKey: string): Set<string> {
  const blocked = new Set<string>();
  const leaves = (student.leaveRequests || []).filter((r) => r.status === 'approved' && r.date === todayKey);
  for (const req of leaves) {
    const slot = resolveLeaveSlot(req);
    for (const p of STUDY_PERIODS) {
      if (slot === 'fullday' || p.studyTime === slot) blocked.add(p.periodKey);
    }
  }
  const awayRanges = getAwayRangesForDay(student.awaySchedules, todayKey, todayDayKey as WeekdayKey);
  if (awayRanges.length > 0) {
    for (const p of STUDY_PERIODS) {
      const ps = toMin(p.start);
      const pe = toMin(p.end);
      if (awayRanges.some((r) => ps < r.end && r.start < pe)) blocked.add(p.periodKey);
    }
  }
  return blocked;
}

// 오늘 학습해야 하는 모든 자료(교재·인강·자율) → 스케줄 아이템. 등록순(과목→자료).
export function getTodayScheduleItems(student: Student, todayKey: string, todayDayKey: string): TodayScheduleItem[] {
  const items: TodayScheduleItem[] = [];
  const onToday = (subjectDays?: string[], materialDays?: string[]) => {
    const ds = getMaterialStudyDays(subjectDays, materialDays) || [];
    return ds.length === 0 || ds.includes(todayDayKey);
  };

  const pushMaterial = (
    subject: SubjectProgress,
    m: BookProgress | LectureProgress,
    type: 'book' | 'lecture',
  ) => {
    if (!onToday(subject.studyDays, m.studyDays)) return;
    // 슬롯은 학생 studySlot(자율) 우선, 없으면 관리자 자료별 studyTime, 그것도 없으면 과목 studyTime(레거시 폴백).
    const pinnedSlot = m.studySlot || m.studyTime || subject.studyTime || '';
    const unit = materialUnit(m, type);

    if (m.goalType === 'selfPaced') {
      const current = type === 'book'
        ? ((m as BookProgress).currentPage || 0)
        : ((m as LectureProgress).completedLectures || 0);
      items.push({
        id: `sp_${subject.id}_${m.id}`,
        subjectName: subject.name, title: materialTitle(m, type),
        materialType: type, materialId: m.id,
        amount: 0, unit, range: '', selfPaced: true, current, pinnedSlot,
      });
      return;
    }

    const active = (m.detailedPlans || []).find(
      (p) => !p.periodType && p.startDate <= todayKey && todayKey <= p.endDate,
    );
    if (!active) {
      // 주간목표(deadline) 자료: 학생이 교시를 직접 지정한 경우에만 하루 계획표에 노출(주간 목표로).
      const dl = (m.detailedPlans || []).find(
        (p) => p.periodType === 'deadline' && p.startDate <= todayKey && todayKey <= p.endDate,
      );
      if (dl && pinnedSlot) {
        items.push({
          id: `dl_${subject.id}_${m.id}_${dl.id}`,
          subjectName: subject.name, title: materialTitle(m, type),
          materialType: type, materialId: m.id, planId: dl.id,
          amount: Math.max(0, Math.round(dl.targetAmount || 0)), unit, range: dl.rangeText,
          weekly: true, pinnedSlot,
        });
      }
      return;
    }
    const amount = active.dailyAmount || Math.ceil((active.targetAmount || 1) / 6);
    const comp = getPlanDailyCompletion(active, todayKey);
    items.push({
      id: `${todayKey}_${subject.id}_${m.id}_${active.id}`,
      subjectName: subject.name, title: materialTitle(m, type),
      materialType: type, materialId: m.id, planId: active.id,
      amount, unit, range: active.rangeText,
      speed: type === 'lecture' ? (m as LectureProgress).speedMultiplier : undefined,
      isCompleted: comp.isCompleted, actualAmount: comp.actualAmount, pinnedSlot,
    });
  };

  for (const subject of student.subjects || []) {
    (subject.books || []).forEach((b) => pushMaterial(subject, b, 'book'));
    (subject.lectures || []).forEach((l) => pushMaterial(subject, l, 'lecture'));
  }
  return items;
}

// 아이템들을 교시에 배정. 교시 핀 → 그 칸, 블록 핀/미지정 → 빈 본학습 교시에 최소부하 균등 배치.
export function assignItemsToPeriods(
  items: TodayScheduleItem[],
  blocked: Set<string>,
): Map<string, AssignedScheduleItem[]> {
  const byPeriod = new Map<string, AssignedScheduleItem[]>();
  const count = (pk: string) => byPeriod.get(pk)?.length || 0;
  const place = (pk: string, item: TodayScheduleItem, autoPlaced: boolean) => {
    const arr = byPeriod.get(pk) || [];
    arr.push({ ...item, periodKey: pk, autoPlaced });
    byPeriod.set(pk, arr);
  };
  // 후보 중 가장 덜 찬 교시(동률이면 시간 순 앞). 하루 전체에 한 개씩 균등 분산.
  const leastFilled = (cands: typeof STUDY_PERIODS) =>
    cands.reduce((best, p) => (count(p.periodKey) < count(best.periodKey) ? p : best), cands[0]);

  const openAuto = AUTO_PERIODS.filter((p) => !blocked.has(p.periodKey));
  const deferred: TodayScheduleItem[] = [];   // 블록 핀 — 교시 핀 배치 후 그 블록 안에서 채움
  const unpinned: TodayScheduleItem[] = [];   // 미지정/막힌 교시핀 — 전체 빈 교시에 자동 배치

  for (const item of items) {
    const slot = item.pinnedSlot || '';
    if (isPeriodSlot(slot)) {
      if (!blocked.has(slot)) place(slot, item, false);
      else unpinned.push(item); // 핀한 교시가 막힘 → 자동 재배치
      continue;
    }
    if (isBlockSlot(slot)) { deferred.push(item); continue; }
    unpinned.push(item);
  }

  for (const item of deferred) {
    const cands = openAuto.filter((p) => p.studyTime === (item.pinnedSlot as StudyTimeKey));
    if (cands.length === 0) { unpinned.push(item); continue; } // 그 블록이 통째로 막힘
    place(leastFilled(cands).periodKey, item, false);
  }

  for (const item of unpinned) {
    if (openAuto.length === 0) continue; // 하루 전체가 막힘 → 배치 불가(홈 리스트엔 그대로 노출)
    place(leastFilled(openAuto).periodKey, item, true);
  }

  return byPeriod;
}
