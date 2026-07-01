// 약점 기반 개인화 미션 추천 — 학생 건강지수 factors/signals를 학생에게 보여줄
// "이번 주 집중 포인트" 코칭 문구로 변환한다. 외부 의존 없는 순수 모듈(재사용·검증 용이).
//
// 설계 원칙:
// - 학생 화면은 "위험도"가 아니라 "성장 코칭" 톤. 결석/이탈/벌점/상담공백 같은
//   징벌·관리자 성격 요인은 학생 카드에 노출하지 않는다(allowlist 큐레이션).
// - 학생이 스스로 통제 가능한 성장 요인(계획·수면·휴대폰·집중·모의고사)만 추천으로 변환.
// - 약점이 없으면(또는 노출 대상 요인이 없으면) 긍정 확언 1개를 반환한다.
import type { HealthFactor, HealthSignals } from './health-score';

export type RecommendationTone = 'suggest' | 'celebrate';

export interface MissionRecommendation {
  key: string;
  icon: 'plan' | 'sleep' | 'phone' | 'distraction' | 'mock' | 'onfire';
  title: string;
  detail: string;
  tone: RecommendationTone;
}

export const MAX_RECOMMENDATIONS = 3;

// 이 미만의 미세 기여(예: 수면 0.1시간 부족=0.3점)는 코칭거리가 아니므로 추천으로 변환하지 않는다.
// 이 임계 덕에 사소한 요인만 있는 성실한 학생에게는 긍정 확언(celebrate)이 노출된다.
export const MIN_FACTOR_CONTRIBUTION = 3;

// 학생에게 코칭으로 노출할 요인 화이트리스트(health-score factor key 기준).
// 결석('absent')·이탈('left')·벌점('penalty')·상담공백('consultation')은 제외 —
// 관리자 개입 영역이고 학생 동기부여에 역효과.
const COACHABLE_KEYS = new Set(['plan', 'sleep', 'phone', 'distraction', 'mock']);

function buildForFactor(key: string, signals: HealthSignals): MissionRecommendation | null {
  switch (key) {
    case 'plan': {
      const pct = signals.planCompletionRate === null
        ? null
        : Math.round(signals.planCompletionRate * 100);
      return {
        key: 'plan',
        icon: 'plan',
        title: '오늘 계획부터 하나씩',
        detail: pct === null
          ? '위 «오늘 계획»에서 하나씩 체크하며 실행률을 채워볼까요?'
          : `최근 계획 실행률이 ${pct}%였어요. 위 «오늘 계획»부터 하나씩 체크해봐요.`,
        tone: 'suggest',
      };
    }
    case 'sleep': {
      const h = signals.avgSleepHours;
      return {
        key: 'sleep',
        icon: 'sleep',
        title: '조금 더 일찍 잠들기',
        detail: h === null
          ? '충분한 수면이 집중의 시작이에요. 오늘은 조금 일찍 자볼까요?'
          : `최근 평균 수면이 ${round1(h)}시간이었어요. 오늘은 30분만 더 일찍 자볼까요?`,
        tone: 'suggest',
      };
    }
    case 'phone': {
      const n = signals.phoneNonSubmitDays;
      return {
        key: 'phone',
        icon: 'phone',
        title: '휴대폰 제출 습관 만들기',
        detail: n > 0
          ? `최근 ${n}일 휴대폰을 제출하지 않았어요. 등원하면 바로 제출해봐요.`
          : '등원하면 휴대폰을 먼저 제출하고 몰입 모드로 시작해봐요.',
        tone: 'suggest',
      };
    }
    case 'distraction':
      return {
        key: 'distraction',
        icon: 'distraction',
        title: '한 세션 몰입에 도전',
        detail: '요즘 집중이 자주 끊겼어요. 뽀모도로 한 세션만 끝까지 몰입해봐요.',
        tone: 'suggest',
      };
    case 'mock':
      return {
        key: 'mock',
        icon: 'mock',
        title: '약한 과목 복습에 집중',
        detail: '최근 모의고사가 조금 아쉬웠어요. 이번 주는 약한 과목 복습에 무게를 실어봐요.',
        tone: 'suggest',
      };
    default:
      return null;
  }
}

function round1(n: number): number { return Math.round(n * 10) / 10; }

// factors 는 computeHealthScore 가 기여도 내림차순으로 정렬해 반환한 배열을 그대로 받는다.
// 노출 가능한 약점 상위 MAX_RECOMMENDATIONS개를 코칭 문구로 변환한다.
// 노출 대상이 하나도 없으면 긍정 확언 1개를 반환한다.
export function buildMissionRecommendations(
  factors: HealthFactor[],
  signals: HealthSignals,
): MissionRecommendation[] {
  const recs: MissionRecommendation[] = [];
  for (const f of factors) {
    if (!COACHABLE_KEYS.has(f.key)) continue;
    if (f.contribution < MIN_FACTOR_CONTRIBUTION) continue;
    const rec = buildForFactor(f.key, signals);
    if (rec) recs.push(rec);
    if (recs.length >= MAX_RECOMMENDATIONS) break;
  }

  if (recs.length === 0) {
    return [{
      key: 'onfire',
      icon: 'onfire',
      title: '페이스 아주 좋아요',
      detail: '지금처럼 꾸준히 이어가면 충분해요. 이대로 쭉 달려봐요!',
      tone: 'celebrate',
    }];
  }
  return recs;
}
