// 실행: npx tsx scripts/test-learning-benchmark.mts
import assert from 'node:assert';
import {
  normalizeMaterialName, materialKey, collectEntries, filterSeriousCohort, buildAggregate,
} from '../lib/learning-benchmark';
import type { Student } from '../lib/types/student';

const TODAY = new Date('2026-09-22'); // 화요일 기준일 고정

function lectureStudent(id: string, opts: {
  name?: string; total?: number; done?: number; speed?: number;
  completions?: Array<[string, number]>; updatedAt?: string; createdAt?: string;
  planStart?: string; planEnd?: string;
} = {}): Student {
  const name = opts.name ?? '행정법 기본강의';
  const total = opts.total ?? 30;
  const dailyCompletions: Record<string, { isCompleted: boolean; actualAmount?: number; completedAt?: string }> = {};
  for (const [date, amt] of opts.completions ?? []) {
    dailyCompletions[date] = { isCompleted: true, actualAmount: amt, completedAt: `${date}T09:00:00.000Z` };
  }
  return {
    id, name: `S${id}`, campus: 'wonju', manager: 'm',
    createdAt: opts.createdAt ?? '2026-07-01', updatedAt: opts.updatedAt ?? '2026-09-20',
    books: [], lectures: [], consultationLogs: [], grades: [],
    subjects: [{
      id: 'sub1', name: '행정법', studyDays: ['mon','tue','wed','thu','fri'],
      books: [], updatedAt: '2026-07-01',
      lectures: [{
        id: `lec_${id}`, name, totalLectures: total, completedLectures: opts.done ?? 0,
        updatedAt: opts.updatedAt ?? '2026-09-20', speedMultiplier: opts.speed,
        detailedPlans: (opts.planStart && opts.planEnd) ? [{
          id: 'p1', materialId: `lec_${id}`, weekNumber: 1,
          startDate: opts.planStart, endDate: opts.planEnd, targetAmount: total,
          rangeText: `1강 ~ ${total}강`, isCompleted: false, dailyCompletions,
        }] : (Object.keys(dailyCompletions).length ? [{
          id: 'p1', materialId: `lec_${id}`, weekNumber: 1,
          startDate: '2026-07-01', endDate: '2026-09-30', targetAmount: total,
          rangeText: `1강 ~ ${total}강`, isCompleted: false, dailyCompletions,
        }] : undefined),
      }],
    }],
  } as Student;
}

// normalize
assert.equal(normalizeMaterialName('  행정법  기본강의 '), '행정법 기본강의');
assert.equal(normalizeMaterialName('EBS 수능특강!!'), 'ebs 수능특강');
assert.equal(materialKey('lecture', '행정법', '행정법 기본강의'),
  'lecture|행정법|행정법 기본강의');

// collectEntries: 같은 강의명 3명 묶임
const students = [
  lectureStudent('1', { done: 30, completions: [['2026-07-05', 30]], updatedAt: '2026-08-01' }),
  lectureStudent('2', { done: 15, completions: [['2026-09-18', 15]], updatedAt: '2026-09-18' }),
  lectureStudent('3', { done: 0, updatedAt: '2026-07-02' }), // 미시작(방치)
];
const collected = collectEntries(students, 'lecture', '행정법', '행정법 기본강의', TODAY);
assert.equal(collected.length, 3);

// filterSeriousCohort: 미시작(done=0)·오래 방치는 제외
const serious = filterSeriousCohort(collected, TODAY, 21);
const ids = serious.map((e) => e.studentId).sort();
assert.deepEqual(ids, ['1', '2']); // 3번(진도0) 제외, 1번(완료), 2번(최근활동) 포함

// 완료 판정
const s1 = serious.find((e) => e.studentId === '1')!;
assert.equal(s1.completed, true);
assert.equal(s1.finishDate, '2026-07-05');
const s2 = serious.find((e) => e.studentId === '2')!;
assert.equal(s2.completed, false);
assert.equal(s2.finishDate, null);

console.log('Task 1 OK');

const cohort2 = filterSeriousCohort(collectEntries([
  lectureStudent('1', { done: 30, speed: 1.5, completions: [['2026-07-05', 30]], updatedAt: '2026-07-05' }),
  lectureStudent('2', { done: 30, speed: 1.5, completions: [['2026-08-10', 30]], updatedAt: '2026-08-10' }),
  lectureStudent('3', { done: 30, speed: 2.0, completions: [['2026-08-12', 30]], updatedAt: '2026-08-12' }),
  lectureStudent('4', { done: 12, speed: 1.5, completions: [['2026-09-18', 12]], updatedAt: '2026-09-18' }),
], 'lecture', '행정법', '행정법 기본강의', TODAY), TODAY, 21);

const agg = buildAggregate(cohort2, 'lecture', '행정법 기본강의', '행정법');
assert.equal(agg.learnerCount, 4);
assert.equal(agg.completerCount, 3);
assert.equal(agg.speedMode, 1.5);          // 최빈 배속
assert.ok(Math.abs(agg.speedAvg! - 1.625) < 1e-6);
assert.ok(agg.avgDurationWeeks !== null);  // 완료자 3명 → 값 존재
assert.ok(agg.monthDistribution.length >= 1);
assert.ok(agg.topMonthsLabel.includes('월'));
const sum = agg.statusDistribution.ahead + agg.statusDistribution.onTrack + agg.statusDistribution.behind;
assert.ok(Math.abs(sum - 1) < 1e-6 || sum === 0);

console.log('Task 2 OK');
