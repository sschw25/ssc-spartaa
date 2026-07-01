import { NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { getStudentById, getAppSetting } from '@/lib/store';
import { getSeoulDateKey, getDailyChecklistFromStudent, getPlanDailyCompletion } from '@/lib/student-activity';
import { computeAttendanceStreak, findRepairableGap } from '@/lib/streak';
import { loadStreakInputs, STREAK_REPAIR_COST, STREAK_REPAIR_WINDOW_DAYS } from '@/lib/streak-data';
import { buildHealthSignals } from '@/lib/health-signals';
import { computeHealthScore, DEFAULT_HEALTH_WEIGHTS, type HealthWeights } from '@/lib/health-score';
import { buildMissionRecommendations } from '@/lib/mission-recommendations';
import type { DetailedPlan } from '@/lib/types/student';

const HEALTH_WEIGHTS_KEY = 'health_score_weights';

const WEEK_DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function isPlanActiveOnDate(plan: DetailedPlan, dateKey: string) {
  return plan.startDate <= dateKey && dateKey <= plan.endDate;
}

function getDailyAmountLabel(plan: DetailedPlan) {
  const amount = plan.dailyAmount || Math.ceil((plan.targetAmount || 1) / 6);
  const range = plan.rangeText || '';
  const rangeWithoutPass = range.replace(/\d+회독/g, '');
  const unit =
    range.includes('문제') ? '문제' :
    range.includes('강') ? '강' :
    range.toLowerCase().includes('p') ? 'p' :
    rangeWithoutPass.includes('회') ? '회' :
    '';
  return `하루 ${amount}${unit}`;
}

// 학생 미션 허브(/student/missions) 전용 데이터 어드민터 — 오늘 계획/체크리스트/스트릭을 한 번에 집계.
// GET: 학생 세션 검증 후 오늘 계획 항목, 오늘 체크리스트, 출결 스트릭, 쿠폰 잔액을 반환.
export async function GET() {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }
  const student = await getStudentById(studentId);
  if (!student) {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }

  const now = new Date();
  const todayKey = getSeoulDateKey(now);
  const todayDow = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', weekday: 'short' }).format(now).toLowerCase();
  const dayKey = WEEK_DAY_KEYS.find((k) => todayDow.startsWith(k)) || 'mon';

  // 1) 오늘 계획(진도) 항목 — student.subjects 의 오늘 요일 배정 + 오늘 활성 구간(startDate~endDate)인 세부계획
  const todayPlanEntries = (student.subjects || [])
    .filter((subject) => {
      const days = subject.studyDays || [];
      return days.length === 0 || days.includes(dayKey as typeof WEEK_DAY_KEYS[number]);
    })
    .flatMap((subject) => {
      const lectures = (subject.lectures || []).flatMap((lecture) =>
        (lecture.detailedPlans || [])
          .filter((plan) => isPlanActiveOnDate(plan, todayKey))
          .map((plan) => {
            const completion = getPlanDailyCompletion(plan, todayKey);
            return {
              id: `${todayKey}_${subject.id}_${lecture.id}_${plan.id}`,
              subject: subject.name,
              title: lecture.name,
              type: '강의' as const,
              materialType: 'lecture' as const,
              materialId: lecture.id,
              planId: plan.id,
              dateKey: todayKey,
              isCompleted: completion.isCompleted,
              actualAmount: completion.actualAmount,
              dailyAmount: plan.dailyAmount ?? Math.ceil((plan.targetAmount || 1) / 6),
              dailyLabel: getDailyAmountLabel(plan),
              rangeText: plan.rangeText,
            };
          }),
      );
      const books = (subject.books || []).flatMap((book) =>
        (book.detailedPlans || [])
          .filter((plan) => isPlanActiveOnDate(plan, todayKey))
          .map((plan) => {
            const completion = getPlanDailyCompletion(plan, todayKey);
            return {
              id: `${todayKey}_${subject.id}_${book.id}_${plan.id}`,
              subject: subject.name,
              title: book.title,
              type: '교재' as const,
              materialType: 'book' as const,
              materialId: book.id,
              planId: plan.id,
              dateKey: todayKey,
              isCompleted: completion.isCompleted,
              actualAmount: completion.actualAmount,
              dailyAmount: plan.dailyAmount ?? Math.ceil((plan.targetAmount || 1) / 6),
              dailyLabel: getDailyAmountLabel(plan),
              rangeText: plan.rangeText,
            };
          }),
      );
      return [...lectures, ...books];
    });

  // 2) 오늘 체크리스트(휴대폰 제출/수면)
  const checklist = getDailyChecklistFromStudent(student, todayKey);

  // 3) 출결 스트릭 — 최근 STREAK_WINDOW_DAYS(1년+)의 등원일 + 승인휴가/쿠폰잇기(정당사유) + 일괄결석 스킵일.
  const streakInputs = await loadStreakInputs(student, now);
  const streakOpts = {
    today: now,
    justifiedDateKeys: streakInputs.justifiedDateKeys,
    skipDateKeys: streakInputs.skipDateKeys,
  };
  const streak = computeAttendanceStreak(streakInputs.attendedDateKeys, streakOpts);
  const leaveCoupons = student.leaveCoupons ?? 0;

  // 3.5) 쿠폰 "스트릭 잇기" 가능 여부 — 최근 결손 1일을 이으면 이전 스트릭과 연결되는 경우만 제안.
  const gap = findRepairableGap(streakInputs.attendedDateKeys, {
    ...streakOpts,
    repairWindowDays: STREAK_REPAIR_WINDOW_DAYS,
  });
  const streakRepair = gap
    ? { date: gap.date, restoredStreak: gap.restoredStreak, cost: STREAK_REPAIR_COST }
    : null;

  // 4) 약점 기반 개인화 추천 — 건강지수 factors를 학생 코칭 문구로 변환.
  // 출결(결석/이탈)은 학생 화면에 노출하지 않으므로 absence=null 로 계산(추천 큐레이션에서도 제외 대상).
  // 가중치는 관리자 대시보드/일일 브리핑과 동일하게 app_settings(health_score_weights) 튜닝값을 반영.
  const rawWeights = await getAppSetting(HEALTH_WEIGHTS_KEY).catch(() => null);
  const weights: HealthWeights = { ...DEFAULT_HEALTH_WEIGHTS, ...(rawWeights || {}) };
  const signals = buildHealthSignals(student, null, { today: now });
  const { factors } = computeHealthScore(signals, weights);
  const recommendations = buildMissionRecommendations(factors, signals);

  return NextResponse.json({
    success: true,
    todayPlanEntries,
    checklist,
    streak,
    streakRepair,
    recommendations,
    leaveCoupons,
  });
}
