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

// ── 계획 시작일(startDateStr) ─────────────────────────────────────────────
const ALL_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// A) weekly, 주중 시작(2026-07-08 수요일). 첫 주 startDate 는 월요일 스냅 대신 고른 날짜.
const startMidweek = generateDetailedPlans(
  'book_start', 20, 'book', 'weeks', 2, 0, 'p', [], ALL_DAYS,
  1.0, undefined, undefined, undefined, '2026-07-08',
);
assert.equal(startMidweek.plans.length, 2);
assert.equal(startMidweek.plans[0].startDate, '2026-07-08'); // 월요일(07-06)로 스냅하지 않음
assert.equal(startMidweek.plans[0].endDate, '2026-07-12');   // 그 주 일요일
assert.equal(startMidweek.plans[1].startDate, '2026-07-13'); // 다음 주 월요일
// 시작 전 날짜에 계획이 없어야 한다(유령 뒤처짐 방지).
assert.ok(startMidweek.plans.every((p) => p.startDate >= '2026-07-08'));
assert.ok(startMidweek.plans.every((p) => p.startDate <= p.endDate));

// B) weekly, 다음 주 월요일 시작(2026-07-13). 첫 주 startDate === 고른 날짜.
const startNextWeek = generateDetailedPlans(
  'book_nextweek', 10, 'book', 'weeks', 1, 0, 'p', [], undefined,
  1.0, undefined, undefined, undefined, '2026-07-13',
);
assert.equal(startNextWeek.plans[0].startDate, '2026-07-13');
assert.equal(startNextWeek.plans[0].endDate, '2026-07-19');

// C) deadlineWeeks, 주중 시작(2026-07-08). 첫 창이 고른 날짜부터, 이후 창이 이어붙음.
const deadlineStart = generateDetailedPlans(
  'lec_start', 30, 'lecture', 'deadlineWeeks', 3, 0, undefined, [], ALL_DAYS,
  1.0, undefined, undefined, undefined, '2026-07-08',
);
assert.equal(deadlineStart.plans.length, 3);
assert.equal(deadlineStart.plans[0].startDate, '2026-07-08');
assert.equal(deadlineStart.plans[1].startDate, '2026-07-15');
assert.ok(deadlineStart.plans.every((p) => p.startDate >= '2026-07-08'));
assert.ok(deadlineStart.plans.every((p) => p.startDate <= p.endDate));

// D) 잘못된/빈 시작일은 무시(오늘 기준). 빈 문자열은 레거시 경로와 동일하게 계획을 만든다.
const badStart = generateDetailedPlans(
  'book_bad', 10, 'book', 'weeks', 1, 0, 'p', [], ALL_DAYS,
  1.0, undefined, undefined, undefined, 'not-a-date',
);
assert.ok(badStart.plans.length >= 1);

console.log('progress-plan checks passed');
