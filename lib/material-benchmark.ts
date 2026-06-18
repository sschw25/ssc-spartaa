import { BookProgress, DetailedPlan, LectureProgress, Student } from '@/lib/types/student';

export type BenchmarkMaterialType = 'book' | 'lecture';

export interface MaterialBenchmark {
  key: string;
  type: BenchmarkMaterialType;
  title: string;
  sampleCount: number;
  averageWeeks: number;
  averageDailyAmount: number;
  unit: string;
}

export type MaterialBenchmarkMap = Record<string, MaterialBenchmark>;

const DAY_MS = 1000 * 60 * 60 * 24;

export function normalizeBenchmarkTitle(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\-_()[\]{}.,:;|/\\]+/g, '');
}

export function getMaterialBenchmarkKey(type: BenchmarkMaterialType, title: string) {
  return `${type}|${normalizeBenchmarkTitle(title)}`;
}

function parseDate(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getPlanDurationWeeks(plans: DetailedPlan[]) {
  const starts = plans.map((plan) => parseDate(plan.startDate)).filter(Boolean) as Date[];
  const ends = plans.map((plan) => parseDate(plan.endDate)).filter(Boolean) as Date[];
  if (starts.length === 0 || ends.length === 0) return null;

  const startMs = Math.min(...starts.map((date) => date.getTime()));
  const endMs = Math.max(...ends.map((date) => date.getTime()));
  const days = Math.max(1, Math.ceil((endMs - startMs) / DAY_MS) + 1);
  return days / 7;
}

export function getMaterialDailyPace(plans?: DetailedPlan[]) {
  if (!plans || plans.length === 0) return null;
  const amounts = plans
    .map((plan) => plan.dailyAmount || Math.ceil((Number(plan.targetAmount) || 0) / 6))
    .filter((amount) => Number.isFinite(amount) && amount > 0);
  if (amounts.length === 0) return null;
  return amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
}

export function buildMaterialBenchmarks(students: Student[]): MaterialBenchmarkMap {
  const groups = new Map<string, {
    type: BenchmarkMaterialType;
    title: string;
    unit: string;
    weeks: number[];
    dailyAmounts: number[];
  }>();

  const addMaterial = (
    type: BenchmarkMaterialType,
    title: string,
    unit: string,
    plans?: DetailedPlan[]
  ) => {
    if (!title || !plans || plans.length === 0) return;
    const weeks = getPlanDurationWeeks(plans);
    const dailyAmount = getMaterialDailyPace(plans);
    if (!weeks || !dailyAmount) return;

    const key = getMaterialBenchmarkKey(type, title);
    const group = groups.get(key) || {
      type,
      title,
      unit,
      weeks: [],
      dailyAmounts: [],
    };
    group.weeks.push(weeks);
    group.dailyAmounts.push(dailyAmount);
    groups.set(key, group);
  };

  students.forEach((student) => {
    const subjects = student.subjects && student.subjects.length > 0
      ? student.subjects
      : [{ books: student.books || [], lectures: student.lectures || [] }];

    subjects.forEach((subject) => {
      (subject.books || []).forEach((book: BookProgress) => {
        addMaterial('book', book.title, book.unit || 'p', book.detailedPlans);
      });
      (subject.lectures || []).forEach((lecture: LectureProgress) => {
        addMaterial('lecture', lecture.name, '강', lecture.detailedPlans);
      });
    });
  });

  return Array.from(groups.entries()).reduce<MaterialBenchmarkMap>((acc, [key, group]) => {
    const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    acc[key] = {
      key,
      type: group.type,
      title: group.title,
      unit: group.unit,
      sampleCount: group.dailyAmounts.length,
      averageWeeks: average(group.weeks),
      averageDailyAmount: average(group.dailyAmounts),
    };
    return acc;
  }, {});
}

export function getMaterialBenchmark(
  benchmarks: MaterialBenchmarkMap | undefined,
  type: BenchmarkMaterialType,
  title: string
) {
  return benchmarks?.[getMaterialBenchmarkKey(type, title)] || null;
}

export function formatMaterialBenchmarkSummary(benchmark: MaterialBenchmark | null) {
  if (!benchmark) return null;
  const noun = benchmark.type === 'book' ? '교재' : '강의';
  return `원생들은 이 ${noun}를 평균 ${formatNumber(benchmark.averageWeeks)}주 동안 하루에 ${formatNumber(benchmark.averageDailyAmount)}${benchmark.unit}씩 학습했습니다.`;
}

export function formatPaceComparison(currentDailyPace: number | null, benchmark: MaterialBenchmark | null) {
  if (!currentDailyPace || !benchmark || benchmark.averageDailyAmount <= 0) return null;
  const diffPercent = Math.round(((currentDailyPace - benchmark.averageDailyAmount) / benchmark.averageDailyAmount) * 100);
  if (Math.abs(diffPercent) < 5) {
    return '현재 페이스는 보통 원생 평균과 거의 같습니다.';
  }
  return diffPercent > 0
    ? `현재 페이스는 보통보다 ${diffPercent}% 빠릅니다.`
    : `현재 페이스는 보통보다 ${Math.abs(diffPercent)}% 느립니다.`;
}
