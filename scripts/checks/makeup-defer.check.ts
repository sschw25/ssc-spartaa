// 주말 보강 owed 의 defer(정해진 휴가) 면제가 자료별 studyTime('t:' 시:분 슬롯 포함) 기준으로
// 판정되는지 검증한다 — notifyMakeupLeave 와 동일 규칙 (2026-07-12 주간 리뷰 P1 수정분).
// 실행: npx tsx scripts/checks/makeup-defer.check.ts
import { getMakeupObligations } from '../../lib/makeup-ledger';
import type { Student } from '../../lib/types/student';

const basePlan = { id: 'pl1', startDate: '2026-07-06', endDate: '2026-07-12', dailyAmount: 10, targetAmount: 50 };

function mkStudent(materialStudyTime: string | undefined, subjectStudyTime: string | undefined, leaveType: string): Student {
  return {
    id: 's1', name: '테스트',
    leaveRequests: [{ id: 'l1', status: 'approved', date: '2026-07-08', type: leaveType }],
    subjects: [{
      id: 'subj1', name: '행정법', studyTime: subjectStudyTime,
      books: [{
        id: 'b1', title: '기본서', unit: 'p', studyTime: materialStudyTime,
        studyDays: ['mon', 'tue', 'wed', 'thu', 'fri'], detailedPlans: [basePlan],
      }],
      lectures: [],
    }],
  } as unknown as Student;
}

const TODAY = '2026-07-10'; // 금요일 (주 시작 = 07-06 월요일) → 주중 5일 × 10 = 50, 면제 1일이면 40
const owedOf = (s: Student) => getMakeupObligations(s, TODAY).reduce((a, o) => a + o.owed, 0);

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { console.error('FAIL:', msg); failures++; } else console.log('ok:', msg);
}

const cases: Array<[string, Student, number]> = [
  ['자료 t:야간 슬롯 + 야간 반차 → 그날 면제 (과목 슬롯이 morning 이어도)', mkStudent('t:19:00-21:50', 'morning', 'night'), 40],
  ['자료 night 블록 + 야간 반차 → 그날 면제', mkStudent('night', undefined, 'night'), 40],
  ['자료 t:야간 + 오전 반차 → 면제 아님', mkStudent('t:19:00-21:50', undefined, 'morning'), 50],
  ['시간 미지정 + 야간 반차 → 면제 아님(블록 매칭 불가)', mkStudent(undefined, undefined, 'night'), 50],
  ['시간 미지정 + 휴식권(fullday) → 그날 면제', mkStudent(undefined, undefined, 'fullday'), 40],
  ['자료 시간 없음 → 과목 night 폴백 + 야간 반차 → 그날 면제', mkStudent(undefined, 'night', 'night'), 40],
];

for (const [desc, s, expect] of cases) {
  const got = owedOf(s);
  assert(got === expect, `${desc} — owed=${got} (기대 ${expect})`);
}

if (failures) { console.error(`\n${failures}건 실패`); process.exit(1); }
console.log('\n전부 통과');
