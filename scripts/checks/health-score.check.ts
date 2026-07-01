import {
  computeHealthScore, bandForScore, DEFAULT_HEALTH_WEIGHTS, type HealthSignals,
} from '../../lib/health-score';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { console.error('FAIL:', msg); failures++; } else console.log('ok:', msg);
}

const perfect: HealthSignals = {
  absentDays: 0, leftDays: 0, planCompletionRate: 1, distractionSpike: 0,
  avgSleepHours: 7, phoneNonSubmitDays: 0, mockDeclining: false,
  daysSinceConsultation: 5, penaltyPoints: 0,
};
assert(computeHealthScore(perfect).score === 0, '완벽한 신호 → 0점');
assert(computeHealthScore(perfect).band === 'normal', '0점은 normal');
assert(computeHealthScore(perfect).factors.length === 0, '기여 요인 없음');

const risky: HealthSignals = {
  absentDays: 3, leftDays: 2, planCompletionRate: 0.2, distractionSpike: 4,
  avgSleepHours: 3, phoneNonSubmitDays: 2, mockDeclining: true,
  daysSinceConsultation: 41, penaltyPoints: 5,
};
const r = computeHealthScore(risky);
assert(r.score === 100, `다중 위험신호 → 100 상한 (got ${r.score})`);
assert(r.band === 'risk', '높은 점수는 risk');
assert(r.factors[0].contribution >= r.factors[1].contribution, 'factors 내림차순');
assert(r.factors.every((f) => f.contribution > 0), '기여 0 요인 제외');

const nulls: HealthSignals = {
  absentDays: 1, leftDays: 0, planCompletionRate: null, distractionSpike: 0,
  avgSleepHours: null, phoneNonSubmitDays: 0, mockDeclining: false,
  daysSinceConsultation: null, penaltyPoints: 0,
};
const n = computeHealthScore(nulls);
assert(n.score === DEFAULT_HEALTH_WEIGHTS.absentDay, `null 신호 스킵, 결석1일=${DEFAULT_HEALTH_WEIGHTS.absentDay} (got ${n.score})`);
assert(!n.factors.some((f) => ['plan', 'sleep', 'consultation'].includes(f.key)), 'null 요인 미포함');

assert(bandForScore(29) === 'normal', '29 normal');
assert(bandForScore(30) === 'watch' && bandForScore(59) === 'watch', '30~59 watch');
assert(bandForScore(60) === 'risk', '60+ risk');

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
if (failures) process.exit(1);
