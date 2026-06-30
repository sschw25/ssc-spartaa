import assert from 'node:assert';
import { shouldShowMockStep, buildWelcomeStepIds } from '../lib/onboarding';

// shouldShowMockStep
assert.strictEqual(shouldShowMockStep('9급 공무원'), true, '공무원 포함');
assert.strictEqual(shouldShowMockStep('경찰'), true, '경찰');
assert.strictEqual(shouldShowMockStep('소방 준비'), true, '소방');
assert.strictEqual(shouldShowMockStep('수능'), true, '수능');
assert.strictEqual(shouldShowMockStep('임용'), false, '임용 제외');
assert.strictEqual(shouldShowMockStep(''), false, '빈문자열');
assert.strictEqual(shouldShowMockStep(undefined), false, 'undefined');

// buildWelcomeStepIds
const withMock = buildWelcomeStepIds(true);
const noMock = buildWelcomeStepIds(false);
assert.deepStrictEqual(withMock, ['welcome','attendance','report','requests','meal','coupon','mock','finish'], 'mock 포함 순서');
assert.deepStrictEqual(noMock, ['welcome','attendance','report','requests','meal','coupon','finish'], 'mock 제외');
assert.ok(!noMock.includes('mock'), 'noMock에 mock 없음');
assert.strictEqual(withMock[0], 'welcome', '첫 단계 welcome');
assert.strictEqual(withMock[withMock.length - 1], 'finish', '마지막 finish');

console.log('PASS: onboarding');
