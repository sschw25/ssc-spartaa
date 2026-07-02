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

console.log('progress-plan checks passed');
