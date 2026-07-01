import { Student, BookProgress, LectureProgress, DetailedPlan } from '@/lib/types/student';
import { getExpectedFromPlans } from '@/lib/progress-plan';

export type MaterialType = 'book' | 'lecture';
export const DEFAULT_ABANDON_DAYS = 21;
const DAY_MS = 1000 * 60 * 60 * 24;

export function normalizeMaterialName(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[!?.,~·\-_/\\()[\]{}"'`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function materialKey(type: MaterialType, subject: string, name: string): string {
  return `${type}|${normalizeMaterialName(subject)}|${normalizeMaterialName(name)}`;
}

export interface BenchmarkEntry {
  studentId: string;
  type: MaterialType;
  subject: string;
  name: string;
  total: number;
  current: number;
  percent: number;                 // 0..100
  completed: boolean;
  startDate: string | null;        // YYYY-MM-DD
  finishDate: string | null;       // YYYY-MM-DD (완료자만)
  lastActivity: string | null;     // YYYY-MM-DD
  speedMultiplier?: number;
  targetDate?: string;
  status: 'ahead' | 'on-track' | 'behind' | 'no-plan';
  studyDays?: string[];
  createdAt: string;
  dailyProgress: Array<{ date: string; cumAmount: number }>; // 날짜 오름차순 누적량
}

// dailyCompletions 에서 (날짜, 그날 완료량) 목록을 뽑아 날짜 오름차순 누적으로 변환
function buildDailyProgress(plans: DetailedPlan[] | undefined): Array<{ date: string; cumAmount: number }> {
  if (!plans) return [];
  const perDate = new Map<string, number>();
  for (const plan of plans) {
    const dc = plan.dailyCompletions;
    if (!dc) continue;
    for (const [date, v] of Object.entries(dc)) {
      if (!v?.isCompleted) continue;
      const amt = typeof v.actualAmount === 'number' && v.actualAmount > 0
        ? v.actualAmount
        : (plan.dailyAmount || 1);
      perDate.set(date, (perDate.get(date) || 0) + amt);
    }
  }
  const dates = [...perDate.keys()].sort();
  let cum = 0;
  return dates.map((date) => { cum += perDate.get(date)!; return { date, cumAmount: cum }; });
}

function earliestPlanStart(plans: DetailedPlan[] | undefined): string | null {
  if (!plans || plans.length === 0) return null;
  const starts = plans.map((p) => p.startDate).filter(Boolean).sort();
  return starts[0] ?? null;
}

function computeStatus(
  plans: DetailedPlan[] | undefined, current: number, today: Date,
  studyDays: string[] | undefined, createdAt: string,
): BenchmarkEntry['status'] {
  const expected = getExpectedFromPlans(plans, today, studyDays, createdAt);
  if (expected === null) return 'no-plan';
  const createdToday = !!createdAt && (createdAt.split('T')[0] === toDateStr(today));
  if (createdToday) return current >= expected ? 'ahead' : 'on-track';
  if (current + 1 < expected) return 'behind';
  if (current >= expected) return 'ahead';
  return 'on-track';
}

function toEntry(
  student: Student, type: MaterialType, subject: string,
  material: BookProgress | LectureProgress, today: Date,
): BenchmarkEntry {
  const total = type === 'book' ? (material as BookProgress).totalPages : (material as LectureProgress).totalLectures;
  const current = type === 'book' ? (material as BookProgress).currentPage : (material as LectureProgress).completedLectures;
  const name = type === 'book' ? (material as BookProgress).title : (material as LectureProgress).name;
  const dailyProgress = buildDailyProgress(material.detailedPlans);
  const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  const completed = total > 0 && current >= total;

  const startFromPlan = earliestPlanStart(material.detailedPlans);
  const startFromDaily = dailyProgress[0]?.date ?? null;
  const startCandidates = [startFromPlan, startFromDaily].filter(Boolean).sort() as string[];
  const startDate = startCandidates[0] ?? (material.updatedAt ? material.updatedAt.split('T')[0] : null);

  const lastDaily = dailyProgress[dailyProgress.length - 1]?.date ?? null;
  const updatedStr = material.updatedAt ? material.updatedAt.split('T')[0] : null;
  const lastActivity = [lastDaily, updatedStr].filter(Boolean).sort().reverse()[0] ?? null;

  const finishDate = completed ? (lastDaily ?? updatedStr) : null;

  return {
    studentId: student.id, type, subject, name,
    total, current, percent, completed,
    startDate, finishDate, lastActivity,
    speedMultiplier: type === 'lecture' ? (material as LectureProgress).speedMultiplier : undefined,
    targetDate: material.targetDate,
    status: computeStatus(material.detailedPlans, current, today, undefined, student.createdAt),
    studyDays: undefined,
    createdAt: student.createdAt,
    dailyProgress,
  };
}

// 각 학생의 subjects(폴백: 최상위 books/lectures)에서 key가 일치하는 항목만 추출
export function collectEntries(
  students: Student[], type: MaterialType, subject: string, name: string, today = new Date(),
): BenchmarkEntry[] {
  const t = new Date(today); t.setHours(0, 0, 0, 0);
  const target = materialKey(type, subject, name);
  const out: BenchmarkEntry[] = [];

  for (const student of students) {
    const subjects = (student.subjects && student.subjects.length > 0)
      ? student.subjects
      : [{ id: '_', name: '기본', books: student.books || [], lectures: student.lectures || [], updatedAt: '' } as any];

    for (const sub of subjects) {
      const materials = type === 'book' ? (sub.books || []) : (sub.lectures || []);
      for (const material of materials) {
        const mName = type === 'book' ? (material as BookProgress).title : (material as LectureProgress).name;
        if (materialKey(type, sub.name, mName) !== target) continue;
        const entry = toEntry(student, type, sub.name, material, t);
        entry.studyDays = sub.studyDays;
        entry.status = computeStatus(material.detailedPlans, entry.current, t, sub.studyDays, student.createdAt);
        out.push(entry);
      }
    }
  }
  return out;
}

// 성실 진행자: (1) 실제 시작(진도>0 또는 완료기록 존재) AND (2) 완료했거나 최근 abandonDays 이내 활동
export function filterSeriousCohort(
  entries: BenchmarkEntry[], today = new Date(), abandonDays = DEFAULT_ABANDON_DAYS,
): BenchmarkEntry[] {
  const t = new Date(today); t.setHours(0, 0, 0, 0);
  return entries.filter((e) => {
    const started = e.current > 0 || e.dailyProgress.length > 0;
    if (!started) return false;
    if (e.completed) return true;
    if (!e.lastActivity) return false;
    const last = new Date(e.lastActivity); last.setHours(0, 0, 0, 0);
    const days = Math.floor((t.getTime() - last.getTime()) / DAY_MS);
    return days <= abandonDays;
  });
}

export interface BenchmarkAggregate {
  key: string;
  type: MaterialType;
  displayName: string;
  subject: string;
  learnerCount: number;
  completerCount: number;
  speedMode: number | null;       // 강의만
  speedAvg: number | null;
  avgDurationWeeks: number | null;  // 완료자
  targetDeltaDaysAvg: number | null;// 완료자, 음수=목표보다 빨리
  statusDistribution: { ahead: number; onTrack: number; behind: number };
  monthDistribution: Array<{ month: number; count: number; ratio: number }>;
  topMonthsLabel: string;
}

function mode(values: number[]): number | null {
  if (values.length === 0) return null;
  const count = new Map<number, number>();
  for (const v of values) count.set(v, (count.get(v) || 0) + 1);
  let best = values[0]; let bestN = 0;
  for (const [v, n] of count) if (n > bestN || (n === bestN && v < best)) { best = v; bestN = n; }
  return best;
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / DAY_MS);
}

function monthsLabel(dist: Array<{ month: number; count: number; ratio: number }>): string {
  if (dist.length === 0) return '';
  const sorted = [...dist].sort((a, b) => b.count - a.count);
  const picked: number[] = [];
  let cum = 0;
  for (const d of sorted) { picked.push(d.month); cum += d.ratio; if (cum >= 0.6) break; }
  picked.sort((a, b) => a - b);
  const consecutive = picked.length > 1 && picked[picked.length - 1] - picked[0] === picked.length - 1;
  return consecutive ? `${picked[0]}~${picked[picked.length - 1]}월` : picked.map((m) => `${m}월`).join('·');
}

export function buildAggregate(
  cohort: BenchmarkEntry[], type: MaterialType, displayName: string, subject: string,
): BenchmarkAggregate {
  const completers = cohort.filter((e) => e.completed && e.startDate && e.finishDate);
  const speeds = cohort.map((e) => e.speedMultiplier).filter((v): v is number => typeof v === 'number' && v > 0);

  const durationsWeeks = completers.map((e) => Math.max(0, daysBetween(e.startDate!, e.finishDate!)) / 7);
  const targetDeltas = completers
    .filter((e) => e.targetDate)
    .map((e) => daysBetween(e.targetDate!, e.finishDate!)); // 완료일 - 목표일, 음수=빨리

  const statusable = cohort.filter((e) => e.status !== 'no-plan');
  const statusDistribution = statusable.length === 0
    ? { ahead: 0, onTrack: 0, behind: 0 }
    : {
        ahead: statusable.filter((e) => e.status === 'ahead').length / statusable.length,
        onTrack: statusable.filter((e) => e.status === 'on-track').length / statusable.length,
        behind: statusable.filter((e) => e.status === 'behind').length / statusable.length,
      };

  const monthCount = new Map<number, number>();
  for (const e of cohort) {
    if (!e.startDate) continue;
    const m = new Date(e.startDate).getMonth() + 1;
    monthCount.set(m, (monthCount.get(m) || 0) + 1);
  }
  const totalMonths = [...monthCount.values()].reduce((a, b) => a + b, 0);
  const monthDistribution = [...monthCount.entries()]
    .map(([month, count]) => ({ month, count, ratio: totalMonths ? count / totalMonths : 0 }))
    .sort((a, b) => a.month - b.month);

  return {
    key: materialKey(type, subject, displayName),
    type, displayName, subject,
    learnerCount: cohort.length,
    completerCount: completers.length,
    speedMode: type === 'lecture' ? mode(speeds) : null,
    speedAvg: type === 'lecture' ? avg(speeds) : null,
    avgDurationWeeks: durationsWeeks.length ? Math.round((avg(durationsWeeks) ?? 0) * 10) / 10 : null,
    targetDeltaDaysAvg: targetDeltas.length ? Math.round(avg(targetDeltas) ?? 0) : null,
    statusDistribution,
    monthDistribution,
    topMonthsLabel: monthsLabel(monthDistribution),
  };
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

export interface PersonalComparison {
  startMonthLabel: string;           // "9월"
  weeksSinceStart: number;           // 1-base
  myPercent: number;
  cohortPercentAtSameWeek: number | null;
  percentileTopLabel: string | null; // "상위 40%"
  etaWeeks: number | null;
  summary: string;
  sparse: boolean;                   // 같은 주차 표본 부족 여부
}

// entry가 "시작 후 w주"까지 도달했던 진도% (dailyProgress 누적 기준, 없으면 최종 진도로 선형 근사)
export function percentAtWeek(entry: BenchmarkEntry, w: number): number {
  if (entry.total <= 0 || !entry.startDate) return 0;
  const cutoff = new Date(entry.startDate);
  cutoff.setDate(cutoff.getDate() + w * 7);
  const cutoffStr = toDateStr(cutoff);

  if (entry.dailyProgress.length > 0) {
    let cum = 0;
    // cutoff은 "시작 후 w주"의 경계(시작일 + w*7). weeksSinceStart와 동일하게 그 경계일(w주차의 끝)은 w주차에 포함되므로 <=
    for (const p of entry.dailyProgress) { if (p.date <= cutoffStr) cum = p.cumAmount; else break; }
    return Math.min(100, Math.round((cum / entry.total) * 100));
  }
  // 폴백: 마지막 활동까지 걸린 주수로 선형 근사
  const spanWeeks = entry.lastActivity
    ? Math.max(1, daysBetween(entry.startDate, entry.lastActivity) / 7)
    : 1;
  const frac = Math.min(1, w / spanWeeks);
  return Math.min(100, Math.round(entry.percent * frac));
}

export function buildPersonalComparison(
  cohort: BenchmarkEntry[], me: BenchmarkEntry, agg: BenchmarkAggregate, today = new Date(),
): PersonalComparison | null {
  if (!me.startDate) return null;
  const t = new Date(today); t.setHours(0, 0, 0, 0);
  const start = new Date(me.startDate); start.setHours(0, 0, 0, 0);
  // 경과일 기준 1-base 주차. 시작 당일=1주차, 8~14일차=2주차 … (7의 배수 경계일은 그 주차에 포함)
  const daysSinceStart = Math.floor((t.getTime() - start.getTime()) / DAY_MS);
  const weeksSinceStart = Math.max(1, Math.floor((daysSinceStart - 1) / 7) + 1);
  const startMonthLabel = `${start.getMonth() + 1}월`;

  // 같은 "시작 후 주차"에 그 주차만큼 데이터가 있는 동료들
  const others = cohort.filter((e) => e.studentId !== me.studentId && e.startDate);
  const reached = others.filter((e) => {
    const span = e.lastActivity ? daysBetween(e.startDate!, e.lastActivity) / 7 : 0;
    return e.completed || span >= weeksSinceStart;
  });
  const sparse = reached.length < 4;
  const peers = reached.length > 0 ? reached : others;

  const peerPercents = peers.map((e) => percentAtWeek(e, weeksSinceStart));
  const cohortPercentAtSameWeek = peerPercents.length
    ? Math.round(peerPercents.reduce((a, b) => a + b, 0) / peerPercents.length)
    : null;

  let percentileTopLabel: string | null = null;
  if (!sparse && peerPercents.length >= 1) {
    const atOrBelow = peerPercents.filter((p) => p <= me.percent).length;
    const topFrac = 1 - atOrBelow / peerPercents.length; // 나보다 높은 비율
    percentileTopLabel = `상위 ${Math.max(1, Math.round(topFrac * 100))}%`;
  }

  const etaWeeks = agg.avgDurationWeeks !== null
    ? Math.max(0, Math.round((agg.avgDurationWeeks - weeksSinceStart) * 10) / 10)
    : null;

  // 존댓말 요약 — 시즌·상대속도 상황별 분기
  const seasonLate = agg.topMonthsLabel && !agg.topMonthsLabel.includes(startMonthLabel);
  const ahead = cohortPercentAtSameWeek !== null && me.percent >= cohortPercentAtSameWeek;
  let summary: string;
  if (seasonLate && ahead) {
    summary = `${startMonthLabel}에 시작해 달력상 다소 늦지만, 시작 후 같은 시점(${weeksSinceStart}주차) 기준으로는 평균보다 앞서 있습니다.`;
  } else if (ahead) {
    summary = `시작 후 ${weeksSinceStart}주차 기준으로 평균보다 앞서 있습니다.`;
  } else if (cohortPercentAtSameWeek !== null) {
    summary = `시작 후 ${weeksSinceStart}주차 기준 평균은 ${cohortPercentAtSameWeek}%입니다. 조금만 더 속도를 내면 따라잡을 수 있습니다.`;
  } else {
    summary = `아직 같은 시점의 비교 표본이 충분하지 않습니다.`;
  }
  if (sparse && cohortPercentAtSameWeek !== null) summary += ' (같은 주차 표본이 적어 참고용입니다.)';

  return {
    startMonthLabel, weeksSinceStart, myPercent: me.percent,
    cohortPercentAtSameWeek, percentileTopLabel, etaWeeks, summary, sparse,
  };
}
