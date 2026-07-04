// 휴가(반차/휴식)–진도계획 상호작용 검증 하네스 — 실제 shipped 함수로 10개 시나리오를 돌린다.
// 실행: npx tsx scripts/verify-leave-plan-scenarios.mts
import {
  getManagedProgressItems,
  getDeadlinePace,
  getMakeupAmount,
  getLeaveDates,
  getLeaveExemptions,
  getExpectedFromPlans,
} from '@/lib/progress-plan';
import { deriveDeadlineGoals } from '@/lib/deadline-goals';

const TODAY = new Date('2026-07-08T00:00:00'); // 수요일
const TODAY_KEY = '2026-07-08';
const STUDY = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat']; // 일요일 휴무
const WIN_START = '2026-07-01'; // 수
const WIN_END = '2026-07-14';   // 화

type AnyPlan = any;

function dailyPlan(materialId: string, targetAmount: number, dailyAmount: number): AnyPlan {
  return {
    id: 'dp_' + materialId, materialId, weekNumber: 1, startDate: WIN_START, endDate: WIN_END,
    targetAmount, dailyAmount, rangeText: `1p ~ ${targetAmount}p`, isCompleted: false,
    // periodType 없음 = 일일(daily)
  };
}
function deadlinePlan(materialId: string, targetAmount: number, actualAmount: number): AnyPlan {
  return {
    id: 'kp_' + materialId, materialId, weekNumber: 1, passNumber: 1, startDate: WIN_START, endDate: WIN_END,
    targetAmount, dailyAmount: Math.ceil(targetAmount / 12), rangeText: `1회독 1p ~ ${targetAmount}p`,
    periodType: 'deadline', periodWeeks: 2, isCompleted: false, actualAmount,
  };
}
function leave(type: string, date: string, slot?: string): AnyPlan {
  return { id: 'lv_' + date + '_' + type, type, date, status: 'approved', ...(slot ? { slot } : {}) };
}

// 교재 하나 + 계획을 가진 학생 fixture
function makeStudent(opts: {
  createdAt?: string;
  plan: AnyPlan;
  total?: number;
  current?: number;         // 교재 currentPage (일일 status용)
  updatedAt?: string;
  leaves?: AnyPlan[];
}): any {
  const { createdAt = '2026-06-01T00:00:00Z', plan, total = 60, current = 0, updatedAt = '2026-07-01T00:00:00Z', leaves = [] } = opts;
  return {
    id: 'stu_test', name: '테스트', campus: 'wonju', manager: '원장',
    createdAt,
    leaveRequests: leaves,
    subjects: [{
      id: 'subj_kor', name: '국어', studyDays: STUDY,
      books: [{
        id: plan.materialId, title: '봉투모의고사', unit: 'p',
        totalPages: total, currentPage: current, updatedAt,
        estimatedMinutesPerUnit: 1.5,
        detailedPlans: [plan],
      }],
      lectures: [],
    }],
  };
}

// 일일 계획 status 요약 (getManagedProgressItems)
function dailyStatus(student: any) {
  const item = getManagedProgressItems([student], new Date(TODAY))[0];
  const leaveDates = getLeaveDates(student);
  const exemptions = getLeaveExemptions(student);
  const book = student.subjects[0].books[0];
  const st = student.subjects[0].studyTime;
  const makeup = getMakeupAmount(book, new Date(TODAY), STUDY, leaveDates, exemptions, st);
  return {
    planKind: item.planKind,
    expectedToday: item.expectedToday,
    current: item.current,
    shortage: item.shortage,
    status: item.status,
    leaveDatesCount: leaveDates.size,
    makeupTotal: makeup.makeupTotal,
    makeupPerDay: makeup.perDay,
    planEndDate: book.detailedPlans[0].endDate,
    targetDate: book.targetDate ?? '(없음)',
  };
}

// 기간 목표(deadline) 요약 (deriveDeadlineGoals + getDeadlinePace)
function deadlineStatus(student: any) {
  const d = deriveDeadlineGoals(student, new Date(TODAY), TODAY_KEY);
  const g = d.deadlineGoals[0];
  const plan = student.subjects[0].books[0].detailedPlans[0];
  return {
    goalCount: d.deadlineGoals.length,
    targetAmount: g?.targetAmount,
    actualAmount: g?.actualAmount,
    expectedAmount: g?.expectedAmount,
    behind: g?.behind,
    riskLevel: g?.riskLevel,
    todayRecommend: g?.todayRecommend,
    planEndDate: plan.endDate,
    leaveDatesCount: getLeaveDates(student).size,
  };
}

function line(n: string, obj: any) {
  console.log(`\n[${n}]`);
  for (const [k, v] of Object.entries(obj)) console.log(`   ${k.padEnd(16)} = ${v}`);
}

console.log('==================================================================');
console.log('휴가–진도계획 상호작용 검증 | today=2026-07-08(수) | 창 07-01~07-14 | 학습일 월~토');
console.log('07-05=일(휴무), 07-07=화(학습일), 07-08=수(오늘)');
console.log('==================================================================');

// ── 일일(daily) 계획 ──
// S1: 일일계획, 휴가없음, current=15 (기대보다 뒤?)
line('S1 일일·휴가없음 (60p/2주 dailyAmount5, current=15)',
  dailyStatus(makeStudent({ plan: dailyPlan('b1', 60, 5), current: 15 })));

// S2: 일일계획, 어제(07-07) 휴식권(fullday) 휴가, current=15
line('S2 일일·어제 휴식권(fullday) 07-07',
  dailyStatus(makeStudent({ plan: dailyPlan('b2', 60, 5), current: 15, leaves: [leave('fullday', '2026-07-07')] })));

// S3: 일일계획, 어제(07-07) 오전반차(morning), current=15  → 슬롯만? 아니면 하루통째?
line('S3 일일·어제 오전반차(morning) 07-07  ★반차=하루통째인가?',
  dailyStatus(makeStudent({ plan: dailyPlan('b3', 60, 5), current: 15, leaves: [leave('morning', '2026-07-07')] })));

// S4: 일일계획, 오늘(07-08) 휴가 — 오늘치엔 영향?
line('S4 일일·오늘(07-08) 휴가',
  dailyStatus(makeStudent({ plan: dailyPlan('b4', 60, 5), current: 15, leaves: [leave('fullday', '2026-07-08')] })));

// S9: 일일계획, 일요일(07-05, 비학습일) 휴가 — 무효여야
line('S9 일일·일요일(07-05 비학습일) 휴가  → 무효여야',
  dailyStatus(makeStudent({ plan: dailyPlan('b9', 60, 5), current: 15, leaves: [leave('fullday', '2026-07-05')] })));

// S8b: 일일계획, 여러 휴가 (07-03,07-04,07-07 학습일 3일) — 보강 누적
line('S8 일일·복수휴가(07-03,04,07 학습일3) → 보강 누적',
  dailyStatus(makeStudent({ plan: dailyPlan('b8', 60, 5), current: 15,
    leaves: [leave('fullday','2026-07-03'), leave('fullday','2026-07-04'), leave('morning','2026-07-07')] })));

// ── 기간 목표(deadline, 모드 B) 계획 ──
// S5: deadline, 휴가없음, actual=15
line('S5 deadline·휴가없음 (60p/2주, actual=15)',
  deadlineStatus(makeStudent({ plan: deadlinePlan('d5', 60, 15) })));

// S6: deadline, 휴식권(fullday) 07-07 → 휴가 반영되나?
line('S6 deadline·휴식권(fullday) 07-07  ★deadline은 휴가 보나?',
  deadlineStatus(makeStudent({ plan: deadlinePlan('d6', 60, 15), leaves: [leave('fullday','2026-07-07')] })));

// S7: deadline, 오전반차 07-07
line('S7 deadline·오전반차(morning) 07-07',
  deadlineStatus(makeStudent({ plan: deadlinePlan('d7', 60, 15), leaves: [leave('morning','2026-07-07')] })));

// S10: 당일등록 + deadline (오늘 시작) — 즉시 뒤처짐 보호되나?
line('S10 당일등록 deadline(오늘 07-08 시작, actual=0) → 즉시 danger 아니어야',
  deadlineStatus({
    id:'s', name:'신규', campus:'wonju', manager:'원장', createdAt: '2026-07-08T00:00:00Z', leaveRequests: [],
    subjects:[{ id:'s1', name:'국어', studyDays: STUDY, books:[{ id:'d10', title:'봉모', unit:'p', totalPages:60, currentPage:0, updatedAt:'2026-07-08T00:00:00Z', estimatedMinutesPerUnit:1.5,
      detailedPlans:[{ id:'kp10', materialId:'d10', startDate:'2026-07-08', endDate:'2026-07-21', targetAmount:60, dailyAmount:5, rangeText:'1회독 1p~60p', periodType:'deadline', periodWeeks:2, isCompleted:false, actualAmount:0 }] }], lectures:[] }],
  }));

console.log('\n==================================================================');
console.log('끝. 위 출력이 "현재 로직이 실제로 내는 값"이다.');
console.log('==================================================================');
