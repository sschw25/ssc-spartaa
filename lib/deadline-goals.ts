import type { Student, DetailedPlan, SubjectProgress, BookProgress, LectureProgress } from '@/lib/types/student';
import { getPlanUnitMinutes, getDeadlinePace, getActiveStudyDays } from '@/lib/progress-plan';

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
        const pace = getDeadlinePace(plan, unitMinutes, today, studyDays);
        const targetAmount = Math.max(0, Number(plan.targetAmount || 0));
        const actualRatio = targetAmount > 0 ? Math.min(1, pace.actualAmount / targetAmount) : 0;
        const riskLevel = computeRiskLevel(actualRatio, pace.expectedRatio);
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
  const metToday = actual >= expected;
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
