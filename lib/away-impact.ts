// 정기 외출(AwaySchedule) → 상시 손실 슬롯 감지. 계획 재조정(C)의 단일 소스.
// 외출 시간대를 학원 시간표(교시)와 겹쳐, 어떤 요일·슬롯이 상시로 막히는지 판정한다.
import type { AwaySchedule, Student, SubjectProgress } from '@/lib/types/student';
import { ACADEMY_TIMETABLE, type StudyTimeKey } from '@/lib/academy-timetable';

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
