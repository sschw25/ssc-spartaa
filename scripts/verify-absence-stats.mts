import assert from 'node:assert';
import { parseSeatPeriodKey, buildAbsenceRanking, OPERATING_PERIODS } from '../lib/absence-stats';

// parseSeatPeriodKey
assert.deepStrictEqual(parseSeatPeriodKey('stu_1:3'), { studentId: 'stu_1', periodIdx: 3 }, '교시키 파싱');
assert.strictEqual(parseSeatPeriodKey('stu_1:phone_D'), null, '휴대폰키 제외');
assert.strictEqual(parseSeatPeriodKey('stu_1'), null, '콜론없음 null');
assert.strictEqual(parseSeatPeriodKey('stu_1:x'), null, '숫자아님 null');

const students = [
  { id: 'a', name: '가', campus: 'wonju', leaveRequests: [] },
  { id: 'b', name: '나', campus: 'wonju', leaveRequests: [
    { id: 'l', type: 'morning', slot: 'morning', date: '2026-07-06', status: 'approved' } as any,
  ] },
  { id: 'c', name: '다', campus: 'chungju', leaveRequests: [] },
];

const attended = new Set<string>([
  'a|2026-07-06', // a는 그날 등원함 → 부분X면 이탈
  'b|2026-07-06',
]);

const marks = [
  // a: 2026-07-06 부분 X(2,3교시) + 등원 → 이탈일 1
  { date: '2026-07-06', seatKey: 'a:2' },
  { date: '2026-07-06', seatKey: 'a:3' },
  // a: 2026-07-07 등원기록 없음 + X → 결석일 1
  { date: '2026-07-07', seatKey: 'a:4' },
  // b: 2026-07-06 오전(0,1) X지만 오전반차 승인 → 정당사유 제외 → 카운트 0
  { date: '2026-07-06', seatKey: 'b:0' },
  { date: '2026-07-06', seatKey: 'b:1' },
  // c: 2026-07-06 일괄 X(0~6 전부) + 등원기록 없음 → 결석일 1 (일괄)
  ...Array.from({ length: OPERATING_PERIODS }, (_, i) => ({ date: '2026-07-06', seatKey: `c:${i}` })),
  // 휴대폰키·범위밖 → 무시
  { date: '2026-07-06', seatKey: 'a:phone_D' },
  { date: '2026-07-06', seatKey: 'a:7' },
];

const rows = buildAbsenceRanking(marks, attended, students);

const a = rows.find((r) => r.studentId === 'a')!;
assert.ok(a && a.absentDays === 1 && a.leftDays === 1, 'a 결석1·이탈1');
assert.strictEqual(a.totalMarks, 3, 'a 총마크 3(2+1, phone·idx7 제외)');
assert.strictEqual(a.lastDate, '2026-07-07', 'a 최근일');

assert.ok(!rows.find((r) => r.studentId === 'b'), 'b 정당사유로 제외(행 없음)');

const c = rows.find((r) => r.studentId === 'c')!;
assert.ok(c && c.absentDays === 1 && c.leftDays === 0, 'c 일괄→결석1');

// 정렬: 결석 desc 우선 → a(결석1,이탈1) 와 c(결석1,이탈0) 동률 결석 → leftDays desc → a 먼저
assert.strictEqual(rows[0].studentId, 'a', '정렬: 동률 결석시 이탈 많은 a 우선');

console.log('PASS: absence-stats');
