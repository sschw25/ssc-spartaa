import type { Student, DetailedPlan, SubjectProgress, BookProgress, LectureProgress } from '@/lib/types/student';
import { getPlanUnitMinutes, getDeadlinePace, getActiveStudyDays, getLeaveFractionByDate } from '@/lib/progress-plan';
import { getCarryoverNet, weekKeyOf } from '@/lib/makeup-carryover';

// ── 기간 목표(모드 B) 미션 파생 — 서버(missions-hub)와 클라이언트(use-report-state)가 공유하는 단일 소스 ──
// 자료별 deadline plan(periodType==='deadline')을 모아 분(min) 정규화로 집계하고,
// 편식 조기경보(riskLevel)와 오늘 집계 요약(deadlineSummary)을 낸다.

export type DeadlineRiskLevel = 'ok' | 'warn' | 'danger';

export interface DeadlineGoal {
  id: string;
  subject: string;
  title: string;
  type: '강의' | '교재';
  materialType: 'book' | 'lecture';
  materialId: string;
  planId: string;
  periodWeeks: number;
  targetAmount: number;
  actualAmount: number;
  unit: string;
  rangeText: string;
  dateKey: string;
  endDate: string;
  expectedAmount: number;
  expectedRatio: number;   // 오늘까지 기대 진행 비율 (0~1)
  actualRatio: number;     // 실제 진행 비율 (actual/target, 0~1)
  behind: boolean;
  todayRecommend: number;
  aheadUnits: number;
  riskLevel: DeadlineRiskLevel;
  carriedOut: number;   // 이번 주 → 다음 주로 이월해 나간 양(이번 주 목표에서 감산됨)
  carriedIn: number;    // 지난 주에서 이번 주로 들어온 이월 양(이번 주 목표에 가산됨)
}

export interface DeadlineSummary {
  expectedMinutes: number;  // 오늘까지 누적 기대 분 = Σ(자료 targetAmount분 × expectedRatio)
  actualMinutes: number;    // 실제 진행 분 = Σ(actualAmount분)
  metToday: boolean;        // 실제분 ≥ 기대분
  aheadDays: number;        // (실제-기대) ÷ 하루 평균분 (앞선 일수)
  riskCount: number;        // riskLevel !== 'ok' 자료 수
  goalCount: number;
}

export interface DeadlineDerivation {
  deadlineGoals: DeadlineGoal[];
  deadlineSummary: DeadlineSummary | null;
}

function isPlanActiveOnDate(plan: DetailedPlan, dateKey: string) {
  return plan.startDate <= dateKey && dateKey <= plan.endDate;
}

// 진행률(actual/target)이 기대비율 대비 60% 미만이면 danger, 80% 미만이면 warn, else ok.
function computeRiskLevel(actualRatio: number, expectedRatio: number): DeadlineRiskLevel {
  if (expectedRatio <= 0) return 'ok'; // 아직 기대가 없으면(시작 직후) 경보 없음
  const relative = actualRatio / expectedRatio;
  if (relative < 0.6) return 'danger';
  if (relative < 0.8) return 'warn';
  return 'ok';
}

// 자료(book/lecture) 단위 unit 분 환산 파라미터 추출.
function unitMinutesFor(
  material: BookProgress | LectureProgress,
  materialType: 'book' | 'lecture',
): number {
  if (materialType === 'book') {
    const b = material as BookProgress;
    return getPlanUnitMinutes('book', b.unit, b.estimatedMinutesPerUnit, 1, b.category);
  }
  const l = material as LectureProgress;
  return getPlanUnitMinutes('lecture', '강', l.estimatedMinutesPerUnit, l.speedMultiplier ?? 1, l.category);
}

function unitLabelFor(material: BookProgress | LectureProgress, materialType: 'book' | 'lecture'): string {
  if (materialType === 'book') return (material as BookProgress).unit || 'p';
  return '강';
}

// 학생의 오늘 활성 기간 목표를 파생. today 는 실제 Date(로컬/서울 자정 정규화 전제), todayKey 는 'YYYY-MM-DD'.
export function deriveDeadlineGoals(student: Student, today: Date, todayKey: string): DeadlineDerivation {
  const goals: DeadlineGoal[] = [];
  let expectedMinutes = 0;
  let actualMinutes = 0;
  let sumTotalMinutes = 0;
  let riskCount = 0;

  const subjects: SubjectProgress[] = student.subjects || [];
  // 주간목표는 휴가를 슬롯 비율(%)로 반영 — 날짜별 총 면제비율 맵을 한 번 만들어 pace 에 넘긴다.
  const leaveByDate = getLeaveFractionByDate(student);

  const handleMaterial = (
    subject: SubjectProgress,
    material: BookProgress | LectureProgress,
    materialType: 'book' | 'lecture',
  ) => {
    const title = materialType === 'book' ? (material as BookProgress).title : (material as LectureProgress).name;
    const studyDays = getActiveStudyDays(subject.studyDays);
    const unitMinutes = unitMinutesFor(material, materialType);
    const unit = unitLabelFor(material, materialType);

    (material.detailedPlans || [])
      .filter((plan) => plan.periodType === 'deadline' && isPlanActiveOnDate(plan, todayKey))
      .forEach((plan) => {
        // 보강 이월 오버레이 — 이번 주 window 로 나간/들어온 이월을 유효 목표에 반영(원본 plan 불변).
        const net = getCarryoverNet(student.makeupCarryovers, material.id, weekKeyOf(plan.startDate));
        const baseTarget = Math.max(0, Number(plan.targetAmount || 0));
        const targetAmount = Math.max(0, baseTarget - net.out + net.in);
        const planForPace = net.out || net.in ? { ...plan, targetAmount } : plan;
        const pace = getDeadlinePace(planForPace, unitMinutes, today, studyDays, leaveByDate);
        const actualRatio = targetAmount > 0 ? Math.min(1, pace.actualAmount / targetAmount) : 0;
        // 위험 판정은 "어제까지 했어야 할" 기준(expectedRatioPrior) — 오늘 몫을 아직 안 했다고
        // 위험으로 표시하지 않는다(당일등록·당일수정 학생이 곧바로 danger 로 뜨는 문제 방지).
        const riskLevel = computeRiskLevel(actualRatio, pace.expectedRatioPrior);
        if (riskLevel !== 'ok') riskCount++;

        // 분 정규화 집계
        expectedMinutes += targetAmount * pace.expectedRatio * unitMinutes;
        actualMinutes += pace.actualAmount * unitMinutes;
        sumTotalMinutes += targetAmount * unitMinutes;

        goals.push({
          id: `${todayKey}_${subject.id}_${material.id}_${plan.id}`,
          subject: subject.name,
          title,
          type: materialType === 'book' ? '교재' : '강의',
          materialType,
          materialId: material.id,
          planId: plan.id,
          periodWeeks: plan.periodWeeks || 1,
          targetAmount,
          actualAmount: pace.actualAmount,
          unit,
          rangeText: plan.rangeText,
          dateKey: todayKey,
          endDate: plan.endDate,
          expectedAmount: pace.expectedAmount,
          expectedRatio: pace.expectedRatio,
          actualRatio,
          behind: pace.behind,
          todayRecommend: pace.todayRecommend,
          aheadUnits: pace.aheadUnits,
          riskLevel,
          carriedOut: net.out,
          carriedIn: net.in,
        });
      });
  };

  subjects.forEach((subject) => {
    (subject.books || []).forEach((book) => handleMaterial(subject, book, 'book'));
    (subject.lectures || []).forEach((lecture) => handleMaterial(subject, lecture, 'lecture'));
  });

  if (goals.length === 0) {
    return { deadlineGoals: [], deadlineSummary: null };
  }

  const expected = Math.round(expectedMinutes);
  const actual = Math.round(actualMinutes);
  // '오늘치 완료' 배지는 per-goal '오늘 완료'(예상목표치 90% 이상 채움)와 같은 기준으로 판정한다 —
  // 분 정규화 100% 기준으로 하면 개별 목표 행은 "오늘 완료"인데 집계는 "오늘치 미달"로 모순될 수 있다.
  const metToday = goals.every((g) => g.expectedAmount <= 0 || g.actualAmount >= g.expectedAmount * 0.9);
  // 하루 평균 분 = 전체 목표분 ÷ 전체 예상 학습일(근사: 자료별 주수×6). 앞선/뒤처진 분을 일수로 환산.
  const totalStudyDaysApprox = goals.reduce((acc, g) => acc + Math.max(1, g.periodWeeks * 6), 0);
  const avgDailyMinutes = totalStudyDaysApprox > 0 ? sumTotalMinutes / totalStudyDaysApprox : 0;
  const aheadDays = Math.floor((actual - expected) / Math.max(1, avgDailyMinutes));

  return {
    deadlineGoals: goals,
    deadlineSummary: {
      expectedMinutes: expected,
      actualMinutes: actual,
      metToday,
      aheadDays,
      riskCount,
      goalCount: goals.length,
    },
  };
}
