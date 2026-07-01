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
