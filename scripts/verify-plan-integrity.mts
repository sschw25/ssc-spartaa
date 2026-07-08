// 계획 정합성 점검(plan-integrity) 검증 하네스.
// npx tsx scripts/verify-plan-integrity.mts
import {
  detectStalePlansForStudent,
  fixStalePlansForStudentMaterial,
  scanStalePlans,
} from '../lib/plan-integrity';
import type { Student, DetailedPlan } from '../lib/types/student';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}`); }
}

function plan(weekNumber: number, targetAmount: number, dailyAmount: number): DetailedPlan {
  return {
    weekNumber,
    targetAmount,
    dailyAmount,
    rangeText: `주${weekNumber}`,
    startDate: '2026-07-06',
    endDate: '2026-07-12',
  } as DetailedPlan;
}

function studentWithBook(plans: DetailedPlan[], goalType = 'dailyAmount'): Student {
  return {
    id: 'stu1',
    name: '홍길동',
    campus: 'wonju',
    manager: '김담당',
    subjects: [
      {
        id: 'sub1',
        name: '국어',
        books: [
          { id: 'mat1', title: '기본서', unit: 'p', goalType, detailedPlans: plans } as never,
        ],
        lectures: [],
      } as never,
    ],
  } as never as Student;
}

// 1) 희석 케이스: 하루 3강 목표인데 마지막 주가 2로 희석 (targetAmount는 충분히 큼)
{
  const s = studentWithBook([plan(1, 15, 3), plan(2, 15, 3), plan(3, 12, 2)]);
  const res = detectStalePlansForStudent(s);
  check('희석: 1개 자료 검출', res.length === 1);
  check('희석: goalDaily=3', res[0]?.goalDaily === 3);
  check('희석: 주3만 검출', res[0]?.weeks.length === 1 && res[0].weeks[0].weekNumber === 3);
  check('희석: stored=2 → expected=3', res[0]?.weeks[0].stored === 2 && res[0]?.weeks[0].expected === 3);
}

// 2) 시간예산 캡: 모든 주 동일하게 2 → 오탐 없음
{
  const s = studentWithBook([plan(1, 10, 2), plan(2, 10, 2), plan(3, 8, 2)]);
  const res = detectStalePlansForStudent(s);
  check('시간캡: 오탐 없음(모든 주 동일)', res.length === 0);
}

// 3) 마지막 부분 주 목표가 원래 작음(targetAmount=2 < goalDaily=3) → 정상, 오탐 없음
{
  const s = studentWithBook([plan(1, 15, 3), plan(2, 15, 3), plan(3, 2, 2)]);
  const res = detectStalePlansForStudent(s);
  check('부분주: expected=min(3,2)=2, stored=2 → 정상', res.length === 0);
}

// 4) 단일 주 → 희석 불가, 검출 안 함
{
  const s = studentWithBook([plan(1, 15, 3)]);
  const res = detectStalePlansForStudent(s);
  check('단일주: 검출 안 함', res.length === 0);
}

// 5) goalType이 dailyAmount 아님(기간형) → 검출 안 함
{
  const s = studentWithBook([plan(1, 15, 3), plan(2, 15, 2)], 'deadline');
  const res = detectStalePlansForStudent(s);
  check('기간형: 검출 안 함', res.length === 0);
}

// 6) 교정: dailyAmount만 올라가고 targetAmount·완료·날짜 보존
{
  const s = studentWithBook([plan(1, 15, 3), plan(2, 15, 3), plan(3, 12, 2)]);
  const before = s.subjects![0].books![0].detailedPlans![2];
  const beforeTarget = before.targetAmount;
  const beforeRange = before.rangeText;
  const changed = fixStalePlansForStudentMaterial(s, 'mat1');
  const after = s.subjects![0].books![0].detailedPlans![2];
  check('교정: changed=true', changed === true);
  check('교정: 주3 dailyAmount 2→3', after.dailyAmount === 3);
  check('교정: targetAmount 보존', after.targetAmount === beforeTarget);
  check('교정: rangeText 보존', after.rangeText === beforeRange);
  const res2 = detectStalePlansForStudent(s);
  check('교정 후: 재스캔 깨끗', res2.length === 0);
}

// 7) 교정 대상 없음 → changed=false
{
  const s = studentWithBook([plan(1, 10, 2), plan(2, 10, 2)]);
  const changed = fixStalePlansForStudentMaterial(s, 'mat1');
  check('정상 자료: changed=false', changed === false);
}

// 8) 잘못된 materialId → changed=false
{
  const s = studentWithBook([plan(1, 15, 3), plan(2, 15, 3), plan(3, 12, 2)]);
  const changed = fixStalePlansForStudentMaterial(s, 'nope');
  check('없는 materialId: changed=false', changed === false);
}

// 9) scanStalePlans: 여러 학생 중 문제 있는 학생만
{
  const good = studentWithBook([plan(1, 10, 2), plan(2, 10, 2)]);
  good.id = 'good';
  const bad = studentWithBook([plan(1, 15, 3), plan(2, 15, 3), plan(3, 12, 2)]);
  bad.id = 'bad';
  const scanned = scanStalePlans([good, bad]);
  check('scan: 문제 학생 1명만', scanned.length === 1 && scanned[0].studentId === 'bad');
}

console.log(`\n결과: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
