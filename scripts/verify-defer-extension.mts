// Phase 3: defer(정해진 반차/휴식) 창 연장 검증 — 창-끝 절벽 제거 + 마감 밀기.
// 실행: npx tsx scripts/verify-defer-extension.mts
import { getExpectedFromPlans, getDeferLeaveExemptions, getLeaveExemptions, getEffectiveTargetDate } from '@/lib/progress-plan';
import type { Student, DetailedPlan, LeaveRequest } from '@/lib/types/student';

// 계획 창: 2026-07-06(월) ~ 2026-07-10(금), 5 학습일(월~금), 일 10p, 총 50p.
const PLAN: DetailedPlan = {
  id: 'pl', startDate: '2026-07-06', endDate: '2026-07-10',
  dailyAmount: 10, targetAmount: 50, rangeText: '1~50p',
};
const STUDY_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
const CREATED = '2026-07-01T00:00:00Z';
const d = (s: string) => { const x = new Date(s); x.setHours(0, 0, 0, 0); return x; };

function studentWith(leaves: LeaveRequest[]): Student {
  return { id: 's', name: 't', attendanceNumber: '0',
    subjects: [{ id: 'sub', name: '국어', studyTime: 'afternoon', studyDays: STUDY_DAYS,
      books: [{ id: 'b', title: 'B', totalPages: 50, currentPage: 0, unit: 'p', goalType: 'dailyAmount', goalValue: 10, targetDate: '2026-07-10', detailedPlans: [PLAN] }], lectures: [] }],
    leaveRequests: leaves } as Student;
}
const lv = (type: string, date: string): LeaveRequest =>
  ({ id: `l_${date}`, type, date, status: 'approved', createdAt: '2026-07-05T00:00:00Z' } as LeaveRequest);

let pass = 0, fail = 0;
const check = (n: string, c: boolean, det?: string) => { c ? (pass++, console.log(`  ✅ ${n}`)) : (fail++, console.log(`  ❌ ${n}${det ? ` — ${det}` : ''}`)); };

// 정해진 오후반차 2일(wed·thu) → 창 2 학습일 연장 → 원래 마감(금) 지나도 절벽 없음.
const sDefer = studentWith([lv('afternoon', '2026-07-08'), lv('afternoon', '2026-07-09')]);
const defer = getDeferLeaveExemptions(sDefer);
const allEx = getLeaveExemptions(sDefer);

console.log('\n[1] 창-끝 절벽: 원래 마감(금) 다음 학습일(월 7/13)에 기대치');
{
  // deferExemptions 없이(레거시) → 창 지나 총량 50으로 점프(절벽)
  const cliff = getExpectedFromPlans([PLAN], d('2026-07-13'), STUDY_DAYS, CREATED, true, undefined, allEx, 'afternoon');
  check('레거시(연장 없음) → 50 총량 점프(절벽 존재)', cliff === 50, `${cliff}`);
  // deferExemptions 있으면 → 창 2일 연장, 아직 총량 미만
  const ext = getExpectedFromPlans([PLAN], d('2026-07-13'), STUDY_DAYS, CREATED, true, undefined, allEx, 'afternoon', defer);
  check('연장 적용 → 50 미만(절벽 제거)', ext !== null && ext < 50, `${ext}`);
}

console.log('\n[2] 연장 소진 후엔 총량 도달(2 학습일 뒤 = 화 7/14)');
{
  // 원래 금(7/10) + 2 학습일 = 화(7/14)에 총량 도달
  const atExtEnd = getExpectedFromPlans([PLAN], d('2026-07-15'), STUDY_DAYS, CREATED, true, undefined, allEx, 'afternoon', defer);
  check('연장 끝(7/14) 지나면 총량 50 도달', atExtEnd === 50, `${atExtEnd}`);
}

console.log('\n[3] 표시 마감(effectiveTargetDate) 밀림');
{
  const eff = getEffectiveTargetDate('2026-07-10', [PLAN], STUDY_DAYS, defer, 'afternoon');
  check('마감 7/10 → 2 학습일 뒤 7/14', eff === '2026-07-14', `${eff}`);
}

console.log('\n[4] 개인사정/병가는 창 연장 안 함(주말 보강 대상)');
{
  const sPersonal = studentWith([lv('personal_fullday', '2026-07-08'), lv('personal_fullday', '2026-07-09')]);
  const deferP = getDeferLeaveExemptions(sPersonal); // 개인사정 → defer 아님 → 빈 맵
  const effP = getEffectiveTargetDate('2026-07-10', [PLAN], STUDY_DAYS, deferP, 'afternoon');
  check('개인사정 → 마감 그대로 7/10', effP === '2026-07-10', `${effP}`);
  const cliffP = getExpectedFromPlans([PLAN], d('2026-07-13'), STUDY_DAYS, CREATED, true, undefined, getLeaveExemptions(sPersonal), 'afternoon', deferP);
  check('개인사정 → 창 연장 없음(총량 50 점프 유지)', cliffP === 50, `${cliffP}`);
}

console.log('\n[5] 다른 슬롯 자료엔 영향 없음(오전 반차 → 오후 자료 무관)');
{
  const sMorning = studentWith([lv('morning', '2026-07-08')]);
  const deferM = getDeferLeaveExemptions(sMorning);
  const effM = getEffectiveTargetDate('2026-07-10', [PLAN], STUDY_DAYS, deferM, 'afternoon'); // 자료=오후
  check('오전 반차 → 오후 자료 마감 불변 7/10', effM === '2026-07-10', `${effM}`);
}

console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
