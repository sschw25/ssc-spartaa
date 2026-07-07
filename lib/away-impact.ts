// 정기 외출(AwaySchedule) → 상시 손실 슬롯 감지. 계획 재조정(C)의 단일 소스.
// 외출 시간대를 학원 시간표(교시)와 겹쳐, 어떤 요일·슬롯이 상시로 막히는지 판정한다.
import type { AwaySchedule, Student, SubjectProgress, BookProgress, LectureProgress, DetailedPlan } from '@/lib/types/student';
import { ACADEMY_TIMETABLE, type StudyTimeKey } from '@/lib/academy-timetable';
import { generateDetailedPlans } from '@/lib/progress-plan';

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type WeekdayKey = (typeof WEEKDAYS)[number];

function timeToMin(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm || '').trim());
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

// 슬롯별 study 교시 [start,end](분). 과반 겹침 판정용.
const SLOT_PERIODS: Record<StudyTimeKey, Array<{ start: number; end: number }>> = (() => {
  const acc: Record<StudyTimeKey, Array<{ start: number; end: number }>> = { morning: [], afternoon: [], night: [] };
  for (const p of ACADEMY_TIMETABLE) {
    if (p.type === 'study' && p.studyTime) acc[p.studyTime].push({ start: timeToMin(p.start), end: timeToMin(p.end) });
  }
  return acc;
})();

function overlaps(a1: number, a2: number, b1: number, b2: number): boolean {
  return a1 < b2 && b1 < a2;
}

// AwaySchedule.days(숫자) → 요일 키 집합. dayMode: sun0(기본, 0=일) / mon0(0=월). 빈 배열 = 매일.
function scheduleWeekdays(schedule: AwaySchedule): Set<WeekdayKey> {
  const out = new Set<WeekdayKey>();
  const days = schedule.days || [];
  if (days.length === 0) { WEEKDAYS.forEach((d) => out.add(d)); return out; }
  const mon0 = schedule.dayMode === 'mon0';
  for (const n of days) {
    const idx = mon0 ? (n + 1) % 7 : n % 7; // mon0: 0=월→WEEKDAYS[1]
    const key = WEEKDAYS[((idx % 7) + 7) % 7];
    if (key) out.add(key);
  }
  return out;
}

function isActiveAway(schedule: AwaySchedule, todayKey: string): boolean {
  if (!schedule.until || schedule.until === 'forever') return true;
  return schedule.until >= todayKey; // YYYY-MM-DD 문자열 비교
}

// (요일 → 상시 손실된 슬롯 집합). 외출 시간대가 그 슬롯 study 교시의 과반과 겹치면 손실로 본다.
export function getAwayImpactSlots(awaySchedules: AwaySchedule[] | undefined, todayKey: string): Map<WeekdayKey, Set<StudyTimeKey>> {
  const map = new Map<WeekdayKey, Set<StudyTimeKey>>();
  for (const sch of awaySchedules || []) {
    if (!isActiveAway(sch, todayKey)) continue;
    const start = timeToMin(sch.awayTime);
    if (Number.isNaN(start)) continue;
    const end = sch.returnTime && !Number.isNaN(timeToMin(sch.returnTime)) ? timeToMin(sch.returnTime) : 24 * 60;
    const lostSlots: StudyTimeKey[] = [];
    (Object.keys(SLOT_PERIODS) as StudyTimeKey[]).forEach((slot) => {
      const periods = SLOT_PERIODS[slot];
      if (periods.length === 0) return;
      const hit = periods.filter((p) => overlaps(start, end, p.start, p.end)).length;
      if (hit * 2 > periods.length) lostSlots.push(slot); // 과반 겹침
    });
    if (lostSlots.length === 0) continue;
    for (const wd of scheduleWeekdays(sch)) {
      const set = map.get(wd) || new Set<StudyTimeKey>();
      lostSlots.forEach((s) => set.add(s));
      map.set(wd, set);
    }
  }
  return map;
}

// 특정 요일의 정기 외출 시간대(분 범위) 목록 — 시간표(교시)별 겹침 표시용.
// getAwayImpactSlots 는 '과반 겹침=슬롯 상실'(계획 재조정용)이라 교시 단위 표시엔 부적합해,
// 여기선 외출 시간 원본 범위를 그대로 돌려주고 교시 겹침 판정은 호출부에서 한다.
export function getAwayRangesForDay(
  awaySchedules: AwaySchedule[] | undefined,
  todayKey: string,     // YYYY-MM-DD (until 활성 판정)
  dayKey: WeekdayKey,   // 요일 키
): Array<{ start: number; end: number; label: string }> {
  const out: Array<{ start: number; end: number; label: string }> = [];
  for (const sch of awaySchedules || []) {
    if (!isActiveAway(sch, todayKey)) continue;
    if (!scheduleWeekdays(sch).has(dayKey)) continue;
    const start = timeToMin(sch.awayTime);
    if (Number.isNaN(start)) continue;
    const end = sch.returnTime && !Number.isNaN(timeToMin(sch.returnTime)) ? timeToMin(sch.returnTime) : 24 * 60;
    const label = sch.returnTime ? `외출 ${sch.awayTime}~${sch.returnTime}` : `외출 ${sch.awayTime}~`;
    out.push({ start, end, label });
  }
  return out;
}

export interface AffectedSubject {
  subject: SubjectProgress;
  lostStudyDays: WeekdayKey[]; // 외출로 잃은(그 과목 슬롯이 막힌) 학습 요일
}

// 외출로 학습일을 잃은 과목들. 과목 studyTime 슬롯이 막힌 요일 중 과목 studyDays 에 있는 요일을 잃은 것으로.
export function getAffectedSubjects(student: Student, todayKey: string): AffectedSubject[] {
  const impact = getAwayImpactSlots(student.awaySchedules, todayKey);
  if (impact.size === 0) return [];
  const out: AffectedSubject[] = [];
  for (const subject of student.subjects || []) {
    const slot = subject.studyTime;
    if (slot !== 'morning' && slot !== 'afternoon' && slot !== 'night') continue;
    const days = (subject.studyDays || []) as WeekdayKey[];
    const lost = days.filter((d) => impact.get(d)?.has(slot));
    if (lost.length > 0) out.push({ subject, lostStudyDays: lost });
  }
  return out;
}

// ── C-2. 외출 반영 계획 재생성 preview ──────────────────────────────────────
export interface AwayReplanItem {
  subjectId: string;
  subjectName: string;
  materialId: string;
  materialType: 'book' | 'lecture';
  title: string;
  lostStudyDays: WeekdayKey[];
  beforeStudyDays: WeekdayKey[];
  afterStudyDays: WeekdayKey[];
  beforeTargetDate: string;
  afterTargetDate: string;
  newPlans: DetailedPlan[];
  diff: string;       // 사람이 읽는 요약
  blocked: boolean;   // 남은 학습일이 없어 자동적용 불가(외출 재검토 권고)
}

function mdOf(dateKey: string): string {
  const p = (dateKey || '').split('-');
  return p.length === 3 ? `${Number(p[1])}-${Number(p[2])}` : dateKey;
}

function lastPlanEnd(plans: DetailedPlan[] | undefined, fallback: string): string {
  const list = plans || [];
  if (list.length === 0) return fallback;
  return list.reduce((max, p) => (p.endDate > max ? p.endDate : max), list[0].endDate);
}

function replanMaterial(
  subject: SubjectProgress,
  material: BookProgress | LectureProgress,
  materialType: 'book' | 'lecture',
  lost: WeekdayKey[],
): AwayReplanItem | null {
  if (!material.goalType || material.goalValue == null) return null; // 목표 미설정 자료는 재생성 불가
  const beforeStudyDays = (subject.studyDays || []) as WeekdayKey[];
  const afterStudyDays = beforeStudyDays.filter((d) => !lost.includes(d));
  const beforeTargetDate = material.targetDate || lastPlanEnd(material.detailedPlans, '');
  const title = materialType === 'book' ? (material as BookProgress).title : (material as LectureProgress).name;

  if (afterStudyDays.length === 0) {
    return {
      subjectId: subject.id, subjectName: subject.name, materialId: material.id, materialType, title,
      lostStudyDays: lost, beforeStudyDays, afterStudyDays, beforeTargetDate, afterTargetDate: beforeTargetDate,
      newPlans: [], diff: '외출로 이 과목의 학습일이 모두 사라져요 — 외출/시간표를 재검토해 주세요.', blocked: true,
    };
  }

  const total = materialType === 'book' ? (material as BookProgress).totalPages : (material as LectureProgress).totalLectures;
  const current = materialType === 'book' ? (material as BookProgress).currentPage : (material as LectureProgress).completedLectures;
  const unit = materialType === 'book' ? (material as BookProgress).unit : '강';
  const speed = materialType === 'lecture' ? ((material as LectureProgress).speedMultiplier ?? 1) : 1;
  const { plans, calculatedTargetDate } = generateDetailedPlans(
    material.id, total, materialType, material.goalType, material.goalValue, current,
    unit, material.reviewPasses || [], afterStudyDays, speed, material.estimatedMinutesPerUnit,
    subject.studyTime || '', material.category,
  );
  const diff = `주 ${beforeStudyDays.length}일→${afterStudyDays.length}일 · 마감 ${mdOf(beforeTargetDate)}→${mdOf(calculatedTargetDate)}`;
  return {
    subjectId: subject.id, subjectName: subject.name, materialId: material.id, materialType, title,
    lostStudyDays: lost, beforeStudyDays, afterStudyDays, beforeTargetDate, afterTargetDate: calculatedTargetDate,
    newPlans: plans, diff, blocked: false,
  };
}

// 외출로 영향받는 모든 과목·자료의 재생성 preview. UI(미리보기)·적용(API) 공용.
export function buildAwayReplan(student: Student, todayKey: string): AwayReplanItem[] {
  const affected = getAffectedSubjects(student, todayKey);
  const out: AwayReplanItem[] = [];
  for (const { subject, lostStudyDays } of affected) {
    for (const book of subject.books || []) {
      const item = replanMaterial(subject, book, 'book', lostStudyDays);
      if (item) out.push(item);
    }
    for (const lecture of subject.lectures || []) {
      const item = replanMaterial(subject, lecture, 'lecture', lostStudyDays);
      if (item) out.push(item);
    }
  }
  return out;
}
