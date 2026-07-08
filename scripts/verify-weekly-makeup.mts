// 주간 보강 정산(Phase 2) 검증 — 실제 shipped 헬퍼로 규칙을 확인한다.
// 실행: npx tsx scripts/verify-weekly-makeup.mts
import { getMakeupObligations, getMakeupLedger, logMakeupDone } from '@/lib/makeup-ledger';
import type { Student, BookProgress, LeaveRequest } from '@/lib/types/student';

// 이번 주: 월 2026-07-06 ~ 금 2026-07-10, 오늘=토 2026-07-11(주중 전체 집계됨)
const TODAY = '2026-07-11';
const MON = '2026-07-06', TUE = '2026-07-07', WED = '2026-07-08', THU = '2026-07-09', FRI = '2026-07-10';
const done = (amt: number) => ({ isCompleted: true, actualAmount: amt });

// mon~fri 일일 10, 완료일 지정
function bk(id: string, completedDays: Record<string, number>): BookProgress {
  return {
    id, title: `교재-${id}`, totalPages: 300, currentPage: 40, unit: 'p',
    goalType: 'dailyAmount', goalValue: 10,
    detailedPlans: [{
      id: `pl_${id}`, startDate: '2026-07-01', endDate: '2026-08-01',
      dailyAmount: 10, targetAmount: 60, rangeText: '1~60p',
      dailyCompletions: Object.fromEntries(Object.entries(completedDays).map(([d, a]) => [d, done(a)])),
    }],
  } as BookProgress;
}
const lv = (type: string, date: string, extra?: Partial<LeaveRequest>): LeaveRequest =>
  ({ id: `lv_${type}_${date}`, type, date, status: 'approved', createdAt: '2026-07-05T00:00:00Z', ...extra } as LeaveRequest);

const student: Student = {
  id: 's1', name: '검증', attendanceNumber: '0',
  subjects: [
    // A(오전): mon/tue/wed 완료(30), thu/fri 미완 → 미달 20 (느림/무단 자동포함)
    { id: 'A', name: '국어', studyTime: 'morning', studyDays: ['mon','tue','wed','thu','fri'],
      books: [bk('b1', { [MON]:10, [TUE]:10, [WED]:10 })], lectures: [] },
    // B(오후): 전부 완료(50) → 미달 0 (자기교정)
    { id: 'B', name: '영어', studyTime: 'afternoon', studyDays: ['mon','tue','wed','thu','fri'],
      books: [bk('b2', { [MON]:10, [TUE]:10, [WED]:10, [THU]:10, [FRI]:10 })], lectures: [] },
    // C(오후): mon/tue 완료(20), wed 정해진 오후반차(면제), thu/fri 미완 → planned 40 - done20 = 20
    { id: 'C', name: '수학', studyTime: 'afternoon', studyDays: ['mon','tue','wed','thu','fri'],
      books: [bk('b3', { [MON]:10, [TUE]:10 })], lectures: [] },
    // D(오전): mon/tue 완료(20), wed 개인사정 종일(면제 아님), thu/fri 미완 → planned 50 - done20 = 30
    { id: 'D', name: '과학', studyTime: 'morning', studyDays: ['mon','tue','wed','thu','fri'],
      books: [bk('b4', { [MON]:10, [TUE]:10 })], lectures: [] },
  ],
  leaveRequests: [
    lv('afternoon', WED),                       // 정해진 오후반차 → C의 wed 면제(defer)
    lv('personal_fullday', WED),                // 개인사정 종일 → D는 면제 아님(makeup)
  ],
} as Student;

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail?: string) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const owedOf = (mid: string) => getMakeupObligations(student, TODAY).find((i) => i.materialId === mid)?.owed ?? 0;

console.log('\n[1] 주간 미달분(owed) 파생');
check('A 느림/미완 → owed 20', owedOf('b1') === 20, `${owedOf('b1')}`);
check('B 전부 완료 → owed 0 (자기교정)', owedOf('b2') === 0, `${owedOf('b2')}`);
check('C 정해진 오후반차(wed 면제) → owed 20', owedOf('b3') === 20, `${owedOf('b3')}`);
check('D 개인사정 종일(wed 면제 아님) → owed 30', owedOf('b4') === 30, `${owedOf('b4')}`);
check('정해진 휴가가 개인사정보다 owed 10 낮음(면제 효과)', owedOf('b3') === owedOf('b4') - 10);

console.log('\n[2] done 주 스코프(지난 주 완료분이 이번 주 상쇄 안 함)');
{
  const s2: Student = JSON.parse(JSON.stringify(student));
  const b1 = s2.subjects![0].books![0] as any;
  b1.makeupWeekKey = '2026-06-29'; b1.makeupDone = 5; // 지난 주 done
  const item = getMakeupObligations(s2, TODAY).find((i) => i.materialId === 'b1')!;
  check('지난 주 done 무시 → done 0', item.done === 0, `${item.done}`);
  check('remaining = owed(20) 그대로', item.remaining === 20, `${item.remaining}`);
}

console.log('\n[3] logMakeupDone — remaining 상한·진도 회복·주 세팅');
{
  const s3: Student = JSON.parse(JSON.stringify(student));
  const before = (s3.subjects![0].books![0] as BookProgress).currentPage;
  const r = logMakeupDone(s3, 'b1', 'book', 100, TODAY); // owed 20, done 0 → 20으로 상한
  check('applied = remaining 20 상한', r?.applied === 20, `${r?.applied}`);
  const b1 = s3.subjects![0].books![0] as any;
  check('진도 currentPage +20 회복', b1.currentPage === (before || 0) + 20, `${b1.currentPage}`);
  check('makeupWeekKey 이번 주로 세팅', b1.makeupWeekKey === '2026-07-06', `${b1.makeupWeekKey}`);
  check('완료 후 ledger에서 b1 사라짐(remaining 0)', !getMakeupLedger(s3, TODAY).some((i) => i.materialId === 'b1'));
}

console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
