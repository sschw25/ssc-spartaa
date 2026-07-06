// 실행: npx tsx scripts/test-progress-plan.mts
import assert from 'node:assert';
import { generateDetailedPlans } from '../lib/progress-plan';

const deadline = generateDetailedPlans(
  'lecture_1',
  50,
  'lecture',
  'deadlineWeeks',
  5,
  0,
  undefined,
  [],
  ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
);

assert.equal(deadline.plans.length, 5);
assert.deepEqual(deadline.plans.map((plan) => plan.weekNumber), [1, 2, 3, 4, 5]);
assert.deepEqual(deadline.plans.map((plan) => plan.targetAmount), [10, 10, 10, 10, 10]);
assert.deepEqual(deadline.plans.map((plan) => plan.rangeText), [
  '1회독 1강 ~ 10강',
  '1회독 11강 ~ 20강',
  '1회독 21강 ~ 30강',
  '1회독 31강 ~ 40강',
  '1회독 41강 ~ 50강',
]);
assert.ok(deadline.plans.every((plan) => plan.periodType === 'deadline'));
assert.ok(deadline.plans.every((plan) => plan.periodWeeks === 1));
assert.ok(deadline.plans.every((plan) => plan.startDate <= plan.endDate));
assert.equal(deadline.calculatedTargetDate, deadline.plans.at(-1)?.endDate);

const legacyWeeklyAmount = generateDetailedPlans(
  'lecture_2',
  50,
  'lecture',
  'weeklyAmount',
  12,
  0,
);

assert.equal(legacyWeeklyAmount.plans.length, 5);
assert.deepEqual(legacyWeeklyAmount.plans.map((plan) => plan.targetAmount), [12, 12, 12, 12, 2]);
assert.deepEqual(legacyWeeklyAmount.plans.map((plan) => plan.rangeText), [
  '1회독 1강 ~ 12강',
  '1회독 13강 ~ 24강',
  '1회독 25강 ~ 36강',
  '1회독 37강 ~ 48강',
  '1회독 49강 ~ 50강',
]);

// 회귀: "주 1회(공부 요일 1일)인데 총량이 주수로 안 나눠떨어질 때" 나머지가 앞 주로 몰리면 안 된다.
// 과거엔 매주 ceil(남은량/남은주수)라 [2,2,2,1,1,1,1](첫 주들이 2회)로 나왔다 — 이제 뒤로 몰아 [1,1,1,1,2,2,2].
const oncePerWeek = generateDetailedPlans(
  'book_weekly',
  10,
  'book',
  'deadlineWeeks',
  7,
  0,
  '회',
  [],
  ['sat'],
);
assert.equal(oncePerWeek.plans.length, 7);
assert.deepEqual(oncePerWeek.plans.map((p) => p.targetAmount), [1, 1, 1, 1, 2, 2, 2]);
// 첫 주는 반드시 1회(사용자가 "주 1회"로 의도) — 앞 주 과다배정 금지.
assert.equal(oncePerWeek.plans[0].targetAmount, 1);
assert.equal(oncePerWeek.plans[0].dailyAmount, 1);
// 나눠떨어지면 그대로 균등.
const evenSplit = generateDetailedPlans('book_even', 12, 'book', 'deadlineWeeks', 4, 0, 'p', [], ['mon', 'wed', 'fri']);
assert.deepEqual(evenSplit.plans.map((p) => p.targetAmount), [3, 3, 3, 3]);
// 분량 < 주수: 빈 주 없이 분량만큼의 주만 사용(조기 완료).
const shortAmount = generateDetailedPlans('book_short', 3, 'book', 'deadlineWeeks', 8, 0, 'p', [], ['mon']);
assert.equal(shortAmount.plans.length, 3);
assert.deepEqual(shortAmount.plans.map((p) => p.targetAmount), [1, 1, 1]);

console.log('progress-plan checks passed');
