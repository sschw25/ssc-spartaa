// 오늘 계획 자동 배치(Phase 1) 검증 — 실제 shipped 헬퍼로 배치 규칙을 확인한다.
// 실행: npx tsx scripts/verify-today-schedule.mts
import { getTodayScheduleItems, getBlockedPeriodKeys, assignItemsToPeriods } from '@/lib/today-schedule';
import type { Student, BookProgress } from '@/lib/types/student';

// 오늘(임의 평일로 고정: 2026-07-08 수요일)
const TODAY = '2026-07-08';
const DAY = 'wed';

function book(id: string, opts: Partial<BookProgress> & { studySlot?: string }): BookProgress {
  return {
    id, title: `교재-${id}`, totalPages: 300, currentPage: 0, unit: 'p',
    goalType: 'dailyAmount', goalValue: 10,
    detailedPlans: [{
      id: `pl_${id}`, startDate: '2026-07-01', endDate: '2026-08-01',
      dailyAmount: 10, targetAmount: 60, rangeText: '1권 1~60p',
    }],
    ...opts,
  } as BookProgress;
}

function makeStudent(overrides?: Partial<Student>): Student {
  return {
    id: 's1', name: '검증학생', attendanceNumber: '0000',
    subjects: [
      // 미지정(슬롯 없음) 자료 3개 — 자동 배치 대상
      { id: 'sub1', name: '국어', studyTime: '', studyDays: ['mon','tue','wed','thu','fri'],
        books: [book('b1', {}), book('b2', {}), book('b3', {})], lectures: [] },
      // 블록 핀(야간) 자료
      { id: 'sub2', name: '영어', studyTime: 'night', studyDays: ['mon','tue','wed','thu','fri'],
        books: [book('b4', {})], lectures: [] },
      // 특정 교시 핀(p3=3교시) 자료
      { id: 'sub3', name: '수학', studyTime: '', studyDays: ['mon','tue','wed','thu','fri'],
        books: [book('b5', { studySlot: 'p3' })], lectures: [] },
    ],
    ...overrides,
  } as Student;
}

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail?: string) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

const periodOf = (map: Map<string, any[]>, materialId: string): string | null => {
  for (const [pk, items] of map) if (items.some((i) => i.materialId === materialId)) return pk;
  return null;
};

console.log('\n[1] 슬롯 없는 자료도 전부 배치되는가');
{
  const s = makeStudent();
  const items = getTodayScheduleItems(s, TODAY, DAY);
  const map = assignItemsToPeriods(items, getBlockedPeriodKeys(s, TODAY, DAY));
  check('오늘 아이템 5건 수집', items.length === 5, `실제 ${items.length}`);
  const placed = [...map.values()].flat().length;
  check('5건 모두 교시에 배치됨', placed === 5, `배치 ${placed}`);
  check('미지정 b1 배치됨(교시 있음)', periodOf(map, 'b1') !== null, `${periodOf(map,'b1')}`);
  check('미지정 b1·b2·b3 서로 다른 교시로 분산',
    new Set(['b1','b2','b3'].map((id) => periodOf(map, id))).size === 3);
}

console.log('\n[2] 핀은 존중되는가');
{
  const s = makeStudent();
  const map = assignItemsToPeriods(getTodayScheduleItems(s, TODAY, DAY), getBlockedPeriodKeys(s, TODAY, DAY));
  check('p3 핀 자료 b5 → 정확히 p3', periodOf(map, 'b5') === 'p3', `${periodOf(map,'b5')}`);
  const b4p = periodOf(map, 'b4');
  check('야간 블록 핀 b4 → 야간 교시(p6/p7)', b4p === 'p6' || b4p === 'p7', `${b4p}`);
}

console.log('\n[3] 휴가로 막힌 교시는 피하는가 (오후 반차)');
{
  const s = makeStudent({
    leaveRequests: [{ id: 'lv1', type: 'afternoon', date: TODAY, status: 'approved', createdAt: '2026-07-07T00:00:00Z' }],
  });
  const blocked = getBlockedPeriodKeys(s, TODAY, DAY);
  check('오후 교시(p3~p5) 차단됨', ['p3','p4','p5'].every((p) => blocked.has(p)), [...blocked].join(','));
  const map = assignItemsToPeriods(getTodayScheduleItems(s, TODAY, DAY), blocked);
  const afternoonUsed = [...map.keys()].some((k) => ['p3','p4','p5'].includes(k));
  check('배치가 오후 교시를 쓰지 않음', !afternoonUsed, [...map.keys()].join(','));
  // p3 핀이던 b5도 오후가 막혔으니 다른 교시로 재배치
  check('p3 핀 b5, 오후 차단 시 다른 교시로 이동', periodOf(map, 'b5') !== 'p3', `${periodOf(map,'b5')}`);
}

console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
