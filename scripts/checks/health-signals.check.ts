import { buildHealthSignals } from '../../lib/health-signals';
import type { Student } from '../../lib/types/student';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { console.error('FAIL:', msg); failures++; } else console.log('ok:', msg);
}

const today = new Date('2026-07-01T09:00:00+09:00');
const dk = (n: number) => {
  const d = new Date(today.getTime()); d.setDate(d.getDate() - n);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(d);
};

// 최소 Student(관계형 필드 대부분 생략) — 어셈블러가 방어적으로 읽는지 확인
const base = {
  id: 's1', name: '홍길동', campus: 'wonju', manager: 'm',
  createdAt: '2026-01-01', updatedAt: '2026-06-30',
  books: [], lectures: [], consultationLogs: [], grades: [],
} as unknown as Student;

const empty = buildHealthSignals(base, null, { today });
assert(empty.absentDays === 0 && empty.leftDays === 0, '결석집계 null → 0');
assert(empty.planCompletionRate === null, '활성 계획 없음 → null');
assert(empty.avgSleepHours === null, '수면 기록 없음 → null');
assert(empty.daysSinceConsultation === null, '상담 없음 → null');
assert(empty.penaltyPoints === 0, '벌점 없음 → 0');
assert(empty.mockDeclining === false, '모고 없음 → false');

// 계획 이행률: 최근 7일 중 어제만 활성+미완료 → 0/1 = 0
const withPlan = {
  ...base,
  subjects: [{
    books: [{ detailedPlans: [{
      id: 'p1', materialId: 'm1', weekNumber: 1, startDate: dk(6), endDate: dk(0),
      targetAmount: 10, rangeText: '', isCompleted: false, dailyCompletions: {},
    }] }],
    lectures: [],
  }],
} as unknown as Student;
const pr = buildHealthSignals(withPlan, { absentDays: 2, leftDays: 1 }, { today });
assert(pr.absentDays === 2 && pr.leftDays === 1, '결석/이탈 전달');
assert(pr.planCompletionRate === 0, `활성계획 미완료 → 0 (got ${pr.planCompletionRate})`);

// 계획 이행률 날짜창: 기본은 진행 중인 오늘 제외, 브리핑 옵션은 기준일 포함
const todayOnlyPlan = {
  ...base,
  subjects: [{
    books: [{ detailedPlans: [{
      id: 'today-only', materialId: 'm1', weekNumber: 1, startDate: dk(0), endDate: dk(0),
      targetAmount: 10, rangeText: '', isCompleted: false, dailyCompletions: {},
    }] }],
    lectures: [],
  }],
} as unknown as Student;
assert(buildHealthSignals(todayOnlyPlan, null, { today }).planCompletionRate === null, '기본 계획 이행률은 오늘 제외');
assert(buildHealthSignals(todayOnlyPlan, null, { today, includeTodayInPlan: true }).planCompletionRate === 0, '브리핑 옵션은 기준일 포함');

// 상담 경과일: 10일 전 상담 → 10
const withConsult = { ...base, consultationLogs: [{ id: 'c', date: dk(10), manager: 'm', content: '' }] } as unknown as Student;
assert(buildHealthSignals(withConsult, null, { today }).daysSinceConsultation === 10, '상담 경과일 10');

// 모의고사 하락: 최신(70) < 직전(80) → true
const withMock = { ...base, mockExams: [
  { examId: 'e2', status: 'attending', score: 70, updatedAt: '2026-06-20T00:00:00Z' },
  { examId: 'e1', status: 'attending', score: 80, updatedAt: '2026-05-20T00:00:00Z' },
] } as unknown as Student;
assert(buildHealthSignals(withMock, null, { today }).mockDeclining === true, '모의고사 하락 감지');

// 벌점: 30일 내 penalty 3, bonus 1 → net 2
const withPenalty = { ...base, penalties: [
  { id: 'x', date: dk(5), points: 3, reason: '', type: 'penalty', awardedBy: 'a', createdAt: '' },
  { id: 'y', date: dk(5), points: 1, reason: '', type: 'bonus', awardedBy: 'a', createdAt: '' },
] } as unknown as Student;
assert(buildHealthSignals(withPenalty, null, { today }).penaltyPoints === 2, '순 벌점 2');

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
if (failures) process.exit(1);
