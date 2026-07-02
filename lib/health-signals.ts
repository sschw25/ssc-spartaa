import type { HealthSignals } from '@/lib/health-score';
import type { Student, DetailedPlan } from '@/lib/types/student';
import {
  getSeoulDateKey,
  getPomodoroStatsFromStudent,
  getDailyChecklistFromStudent,
  getPlanDailyCompletion,
} from '@/lib/student-activity';

// today부터 과거로 n개 날짜키(YYYY-MM-DD, Seoul) 반환
function recentDateKeys(today: Date, n: number): string[] {
  const keys: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(today.getTime());
    d.setDate(d.getDate() - i);
    keys.push(getSeoulDateKey(d));
  }
  return keys;
}

// subjects[].books/lectures[] + 최상위 books/lectures[]의 모든 detailedPlans 수집
function collectDetailedPlans(student: Student): DetailedPlan[] {
  const plans: DetailedPlan[] = [];
  const pushFrom = (books?: { detailedPlans?: DetailedPlan[] }[], lectures?: { detailedPlans?: DetailedPlan[] }[]) => {
    (books ?? []).forEach((b) => (b.detailedPlans ?? []).forEach((p) => plans.push(p)));
    (lectures ?? []).forEach((l) => (l.detailedPlans ?? []).forEach((p) => plans.push(p)));
  };
  if (student.subjects && student.subjects.length > 0) {
    student.subjects.forEach((s) => pushFrom(s.books, s.lectures));
  } else {
    pushFrom(student.books, student.lectures);
  }
  return plans;
}

function computePlanCompletionRate(student: Student, last7: string[]): number | null {
  const plans = collectDetailedPlans(student);
  let expected = 0;
  let completed = 0;
  for (const dk of last7) {
    // 기간 목표(periodType) plan 은 일일 이행률 집계에서 제외 — dailyCompletions 가 생기지 않아
    // "기대 1건·완료 0건"이 매일 쌓여 이행률 0% 고정(케어지수 폭락)되는 오염을 막는다.
    const inWindow = plans.filter((p) => !p.periodType && p.startDate <= dk && dk <= p.endDate);
    if (inWindow.length === 0) continue; // 그 날 활성 계획 없음 → 분모 제외
    expected++;
    if (inWindow.some((p) => getPlanDailyCompletion(p, dk).isCompleted)) completed++;
  }
  return expected > 0 ? completed / expected : null;
}

// 최근 3 활성일 평균 - 이전 4~10 활성일 평균 (활성 = 뽀모도로 세션 있는 날)
function computeDistractionSpike(student: Student, keys: string[]): number {
  const active = keys
    .map((dk) => ({ dk, ...getPomodoroStatsFromStudent(student, dk) }))
    .filter((s) => s.sessions > 0);
  const recent = active.slice(0, 3);
  const prior = active.slice(3, 10);
  if (recent.length === 0 || prior.length === 0) return 0;
  const avg = (arr: { distractions: number }[]) => arr.reduce((s, x) => s + x.distractions, 0) / arr.length;
  return avg(recent) - avg(prior);
}

function computeSleepAndPhone(student: Student, last7: string[]): { avgSleepHours: number | null; phoneNonSubmitDays: number } {
  let sleepSum = 0;
  let sleepCount = 0;
  let phoneNonSubmit = 0;
  for (const dk of last7) {
    const entry = getDailyChecklistFromStudent(student, dk);
    if (!entry) continue;
    if (typeof entry.sleep_hours === 'number') { sleepSum += entry.sleep_hours; sleepCount++; }
    const status = entry.phone_status ?? (entry.phone_submitted ? 'submitted' : undefined);
    if (status && status !== 'submitted') phoneNonSubmit++;
  }
  return { avgSleepHours: sleepCount > 0 ? sleepSum / sleepCount : null, phoneNonSubmitDays: phoneNonSubmit };
}

function computeMockDeclining(student: Student): boolean {
  const scored = (student.mockExams ?? [])
    .filter((e) => typeof e.score === 'number')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  if (scored.length < 2) return false;
  return (scored[0].score as number) < (scored[1].score as number);
}

function computeDaysSinceConsultation(student: Student, today: Date): number | null {
  const dates = (student.consultationLogs ?? []).map((l) => l.date).filter(Boolean).sort((a, b) => b.localeCompare(a));
  if (dates.length === 0) return null;
  const last = new Date(`${dates[0]}T00:00:00+09:00`);
  const diff = Math.floor((today.getTime() - last.getTime()) / 86400000);
  return diff >= 0 ? diff : 0;
}

function computePenaltyPoints(student: Student, today: Date): number {
  const cutoff = new Date(today.getTime());
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffKey = getSeoulDateKey(cutoff);
  let net = 0;
  for (const p of student.penalties ?? []) {
    if (p.date < cutoffKey) continue;
    net += p.type === 'penalty' ? p.points : -p.points;
  }
  return net;
}

export function buildHealthSignals(
  student: Student,
  absence: { absentDays: number; leftDays: number } | null,
  opts?: { today?: Date; includeTodayInPlan?: boolean },
): HealthSignals {
  const today = opts?.today ?? new Date();
  const last7 = recentDateKeys(today, 7);
  const last14 = recentDateKeys(today, 14);
  // 계획 이행률은 "완결된 최근 7일"(어제~7일 전)로 계산 — 아직 진행 중인 오늘을
  // 분모에 넣으면 아침 접속 시 미완료로 잡혀 이행률이 사실과 다르게 낮아진다.
  // 단, 일일 브리핑처럼 today 자체가 이미 끝난 기준일이면 includeTodayInPlan 으로 포함한다.
  const plan7 = opts?.includeTodayInPlan ? last7 : recentDateKeys(today, 8).slice(1);
  const { avgSleepHours, phoneNonSubmitDays } = computeSleepAndPhone(student, last7);
  return {
    absentDays: absence?.absentDays ?? 0,
    leftDays: absence?.leftDays ?? 0,
    planCompletionRate: computePlanCompletionRate(student, plan7),
    distractionSpike: computeDistractionSpike(student, last14),
    avgSleepHours,
    phoneNonSubmitDays,
    mockDeclining: computeMockDeclining(student),
    daysSinceConsultation: computeDaysSinceConsultation(student, today),
    penaltyPoints: computePenaltyPoints(student, today),
  };
}
