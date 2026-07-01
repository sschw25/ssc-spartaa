import {
  buildMissionRecommendations, MAX_RECOMMENDATIONS, MIN_FACTOR_CONTRIBUTION,
} from '../../lib/mission-recommendations';
import type { HealthFactor, HealthSignals } from '../../lib/health-score';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { console.error('FAIL:', msg); failures++; } else console.log('ok:', msg);
}

const baseSignals: HealthSignals = {
  absentDays: 0, leftDays: 0, planCompletionRate: 0.4, distractionSpike: 3,
  avgSleepHours: 4.5, phoneNonSubmitDays: 2, mockDeclining: true,
  daysSinceConsultation: 30, penaltyPoints: 3,
};

// 1) 건강한 학생(요인 없음) → 긍정 확언 1개
const celebrate = buildMissionRecommendations([], baseSignals);
assert(celebrate.length === 1, '요인 없음 → 추천 1개');
assert(celebrate[0].tone === 'celebrate', '요인 없음 → celebrate 톤');
assert(celebrate[0].icon === 'onfire', '요인 없음 → onfire 아이콘');

// 2) 관리자 성격 요인만(결석/이탈/벌점/상담) → 학생에겐 노출 안 함 → 긍정 확언
const adminOnly: HealthFactor[] = [
  { key: 'absent', label: '결석', contribution: 24 },
  { key: 'left', label: '이탈', contribution: 10 },
  { key: 'penalty', label: '벌점', contribution: 12 },
  { key: 'consultation', label: '상담 공백', contribution: 6 },
];
const adminRecs = buildMissionRecommendations(adminOnly, baseSignals);
assert(adminRecs.length === 1 && adminRecs[0].tone === 'celebrate', '관리자 성격 요인만 → 학생 노출 없음(celebrate)');

// 3) 코칭 요인 다수(내림차순) → 상위 MAX개, 순서 보존
const many: HealthFactor[] = [
  { key: 'plan', label: '계획 미이행', contribution: 12 },
  { key: 'sleep', label: '수면부족', contribution: 4.5 },
  { key: 'phone', label: '휴대폰 미제출', contribution: 6 },
  { key: 'mock', label: '성적 하락', contribution: 10 },
  { key: 'distraction', label: '집중이탈 급증', contribution: 6 },
];
const manyRecs = buildMissionRecommendations(many, baseSignals);
assert(manyRecs.length === MAX_RECOMMENDATIONS, `코칭 요인 다수 → 상위 ${MAX_RECOMMENDATIONS}개`);
assert(manyRecs[0].key === 'plan' && manyRecs[1].key === 'sleep' && manyRecs[2].key === 'phone', '입력 순서(내림차순) 보존');
assert(manyRecs.every((r) => r.tone === 'suggest'), '약점 추천은 suggest 톤');

// 4) 관리자/코칭 혼합 → 코칭 요인만 큐레이션되어 순서 유지
const mixed: HealthFactor[] = [
  { key: 'absent', label: '결석', contribution: 24 }, // 제외
  { key: 'plan', label: '계획 미이행', contribution: 12 },
  { key: 'penalty', label: '벌점', contribution: 8 }, // 제외
  { key: 'sleep', label: '수면부족', contribution: 4.5 },
];
const mixedRecs = buildMissionRecommendations(mixed, baseSignals);
assert(mixedRecs.length === 2, '혼합 → 코칭 요인 2개만');
assert(mixedRecs[0].key === 'plan' && mixedRecs[1].key === 'sleep', '혼합 → 코칭 요인 순서 유지');

// 5) detail에 실제 수치 반영
const planPct = manyRecs.find((r) => r.key === 'plan');
assert(!!planPct && planPct.detail.includes('40%'), 'plan detail에 실행률 40% 반영');
const sleepRec = manyRecs.find((r) => r.key === 'sleep');
assert(!!sleepRec && sleepRec.detail.includes('4.5시간'), 'sleep detail에 평균수면 4.5시간 반영');

// 6) null 신호 방어(계획률/수면 null)
const nullSignals: HealthSignals = { ...baseSignals, planCompletionRate: null, avgSleepHours: null };
const nullRecs = buildMissionRecommendations(
  [{ key: 'plan', label: '계획 미이행', contribution: 12 }, { key: 'sleep', label: '수면부족', contribution: 4 }],
  nullSignals,
);
assert(nullRecs.length === 2 && !nullRecs[0].detail.includes('null'), 'null 신호에도 안전한 문구');

// 7) 미세 기여(임계 미만)는 코칭으로 변환하지 않음 → 성실한 학생에게 celebrate 노출
const tiny: HealthFactor[] = [
  { key: 'sleep', label: '수면부족', contribution: 0.3 },   // 5.9시간 수면 같은 미세 부족
  { key: 'distraction', label: '집중이탈 급증', contribution: 0.2 },
];
const tinyRecs = buildMissionRecommendations(tiny, baseSignals);
assert(tinyRecs.length === 1 && tinyRecs[0].tone === 'celebrate', `임계(${MIN_FACTOR_CONTRIBUTION}) 미만 미세 요인만 → celebrate`);

// 8) 임계 이상/미만 혼합 → 임계 이상만 추천
const mixedTiny: HealthFactor[] = [
  { key: 'plan', label: '계획 미이행', contribution: 12 },
  { key: 'sleep', label: '수면부족', contribution: 0.3 },
];
const mixedTinyRecs = buildMissionRecommendations(mixedTiny, baseSignals);
assert(mixedTinyRecs.length === 1 && mixedTinyRecs[0].key === 'plan', '임계 미만 요인은 걸러지고 유의미 요인만 추천');

if (failures > 0) { console.error(`\n${failures} FAILED`); process.exit(1); }
console.log('\nAll mission-recommendations checks passed');
