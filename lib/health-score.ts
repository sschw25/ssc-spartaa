// 학생 건강지수(위험도) 순수 계산 모듈. 외부 의존 없음(재사용·검증 용이).
// score 0~100 정수, 높을수록 위험.

export type HealthBand = 'normal' | 'watch' | 'risk';

export interface HealthSignals {
  absentDays: number;                   // 최근 윈도우 결석일 (정당사유 제외)
  leftDays: number;                     // 최근 윈도우 이탈일
  planCompletionRate: number | null;    // 최근 7일 계획 이행률 0~1, 활성 계획 없으면 null
  distractionSpike: number;             // 최근 집중이탈 평균 - 기준선(양수=악화)
  avgSleepHours: number | null;         // 최근 평균 수면시간, 기록 없으면 null
  phoneNonSubmitDays: number;           // 최근 윈도우 휴대폰 미제출 일수
  mockDeclining: boolean;               // 최근 모의고사 하락 추세
  daysSinceConsultation: number | null; // 마지막 상담 경과일, 기록 없으면 null
  penaltyPoints: number;                // 최근 순 벌점(penalty-bonus), 음수는 0 취급
}

export interface HealthWeights {
  absentDay: number;
  leftDay: number;
  planShortfall: number;   // (1-이행률) 당
  distractionSpike: number; // spike 1당
  sleepDeficit: number;    // 부족시간(권장-실제) 1시간당
  phoneNonSubmitDay: number;
  mockDeclining: number;   // 하락 추세면 가산(고정)
  consultationStale: number; // 임계 초과 경과일 1일당
  penaltyPoint: number;    // 벌점 1점당
}

export const DEFAULT_HEALTH_WEIGHTS: HealthWeights = {
  absentDay: 12,
  leftDay: 5,
  planShortfall: 20,
  distractionSpike: 2,
  sleepDeficit: 3,
  phoneNonSubmitDay: 3,
  mockDeclining: 10,
  consultationStale: 0.7,
  penaltyPoint: 4,
};

export const HEALTH_THRESHOLDS = { watch: 30, risk: 60 } as const;
export const CONSULTATION_STALE_AFTER_DAYS = 21; // 이 이상 상담 공백부터 가산
export const RECOMMENDED_SLEEP_HOURS = 6;

export interface HealthFactor { key: string; label: string; contribution: number }
export interface HealthResult { score: number; band: HealthBand; factors: HealthFactor[] }

export function bandForScore(score: number): HealthBand {
  if (score >= HEALTH_THRESHOLDS.risk) return 'risk';
  if (score >= HEALTH_THRESHOLDS.watch) return 'watch';
  return 'normal';
}

function round1(n: number): number { return Math.round(n * 10) / 10; }

export function computeHealthScore(
  signals: HealthSignals,
  weights: HealthWeights = DEFAULT_HEALTH_WEIGHTS,
): HealthResult {
  const factors: HealthFactor[] = [];
  const add = (key: string, label: string, contribution: number) => {
    if (contribution > 0) factors.push({ key, label, contribution: round1(contribution) });
  };

  add('absent', '결석', signals.absentDays * weights.absentDay);
  add('left', '이탈', signals.leftDays * weights.leftDay);

  if (signals.planCompletionRate !== null) {
    const shortfall = Math.max(0, 1 - signals.planCompletionRate);
    add('plan', '계획 미이행', shortfall * weights.planShortfall);
  }

  add('distraction', '집중이탈 급증', Math.max(0, signals.distractionSpike) * weights.distractionSpike);

  if (signals.avgSleepHours !== null) {
    const deficit = Math.max(0, RECOMMENDED_SLEEP_HOURS - signals.avgSleepHours);
    add('sleep', '수면부족', deficit * weights.sleepDeficit);
  }

  add('phone', '휴대폰 미제출', signals.phoneNonSubmitDays * weights.phoneNonSubmitDay);

  if (signals.mockDeclining) add('mock', '성적 하락', weights.mockDeclining);

  if (signals.daysSinceConsultation !== null) {
    const over = Math.max(0, signals.daysSinceConsultation - CONSULTATION_STALE_AFTER_DAYS);
    add('consultation', '상담 공백', over * weights.consultationStale);
  }

  add('penalty', '벌점', Math.max(0, signals.penaltyPoints) * weights.penaltyPoint);

  const raw = factors.reduce((s, f) => s + f.contribution, 0);
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  factors.sort((a, b) => b.contribution - a.contribution);
  return { score, band: bandForScore(score), factors };
}
