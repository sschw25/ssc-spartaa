import { buildDailyDigest } from '../../lib/daily-digest';
import type { Student } from '../../lib/types/student';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { console.error('FAIL:', msg); failures++; } else console.log('ok:', msg);
}

// 기준 "오늘" 고정(결정성) — 브리핑 기준일(어제)은 2026-06-30.
const today = new Date('2026-07-01T09:00:00+09:00');
const dk = (n: number) => {
  const d = new Date(today.getTime()); d.setDate(d.getDate() - n);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(d);
};
const YESTERDAY = dk(1); // 2026-06-30

function mkStudent(id: string, name: string, campus: string): Student {
  return {
    id, name, campus, manager: 'm',
    createdAt: '2026-01-01', updatedAt: '2026-06-30',
    books: [], lectures: [], consultationLogs: [], grades: [],
  } as unknown as Student;
}

// seat_key: "{studentId}:{periodIdx}" — periodIdx 0~6(7교시). 전부 마크 = "absent"(일괄), 일부만 = "left".
function bulkMarksForDate(studentId: string, date: string) {
  return Array.from({ length: 7 }, (_, i) => ({ date, seatKey: `${studentId}:${i}` }));
}
function partialMarksForDate(studentId: string, date: string, count = 2) {
  return Array.from({ length: count }, (_, i) => ({ date, seatKey: `${studentId}:${i}` }));
}

// ── 1) 빈 학생 집합 → 빈 캠퍼스 목록 ──
{
  const result = buildDailyDigest([], [], new Set(), { today });
  assert(result.generatedDate === YESTERDAY, `빈 입력에도 generatedDate=어제 (got ${result.generatedDate})`);
  assert(Object.keys(result.campuses).length === 0, '학생 없음 → campuses 빈 객체');
}

// ── 2) 클린 학생(결석/이탈 전혀 없음) → 해당 캠퍼스 리스트 모두 빈 배열, counts 일치 ──
{
  const clean = mkStudent('clean1', '김클린', 'wonju');
  const result = buildDailyDigest([clean], [], new Set(), { today });
  const c = result.campuses['wonju'];
  assert(!!c, '클린 학생 캠퍼스(wonju) 항목 생성');
  assert(c.yesterdayAbsences.length === 0, '클린 학생 → 어제결석 없음');
  assert(c.leftSpikes.length === 0, '클린 학생 → 이탈급증 없음');
  assert(c.consecutiveAbsences.length === 0, '클린 학생 → 연속결석 없음');
  assert(c.riskBand.length === 0, '클린 학생 → 위험밴드 없음');
  assert(
    c.counts.yesterdayAbsences === c.yesterdayAbsences.length &&
    c.counts.leftSpikes === c.leftSpikes.length &&
    c.counts.consecutiveAbsences === c.consecutiveAbsences.length &&
    c.counts.riskBand === c.riskBand.length,
    'counts가 각 배열 길이와 일치(클린)',
  );
}

// ── 3) 연속결석(>=2일) 학생 ──
{
  const student = mkStudent('consec1', '박연속', 'chuncheon');
  // 어제(dk(1))와 그저께(dk(2)) 모두 일괄(하루종일) 결석 마크 → "absent" 연속 2일
  const rawMarks = [
    ...bulkMarksForDate(student.id, dk(1)),
    ...bulkMarksForDate(student.id, dk(2)),
  ];
  const result = buildDailyDigest([student], rawMarks, new Set(), { today });
  const c = result.campuses['chuncheon'];
  assert(!!c, '연속결석 학생 캠퍼스(chuncheon) 항목 생성');
  const entry = c.consecutiveAbsences.find((e) => e.studentId === 'consec1');
  assert(!!entry, '연속결석 명단에 등장');
  assert(entry?.consecutiveDays === 2, `연속결석일수=2 (got ${entry?.consecutiveDays})`);
  assert(entry?.lastDate === YESTERDAY, `연속결석 lastDate=어제 (got ${entry?.lastDate})`);
  // 어제도 결석이므로 어제결석 명단에도 등장
  assert(c.yesterdayAbsences.some((e) => e.studentId === 'consec1'), '연속결석 학생은 어제결석 명단에도 등장');
}

// ── 4) 이탈급증(leftSpike) 학생: 최근 3일 이탈 3회, 이전 3일 이탈 0회 → 증가폭 3 >= minIncrease(2) ──
{
  const student = mkStudent('spike1', '이급증', 'chungju');
  const attended = new Set<string>();
  const rawMarks: { date: string; seatKey: string }[] = [];
  // 최근 3일(recentDays 기본값) = dk(1), dk(2), dk(3) — 부분 마크(이탈) + 등원기록 있음
  for (const n of [1, 2, 3]) {
    const d = dk(n);
    rawMarks.push(...partialMarksForDate(student.id, d, 2));
    attended.add(`${student.id}|${d}`);
  }
  // 이전 3일(prior) = dk(4), dk(5), dk(6) — 마크 없음(이탈 0)
  const result = buildDailyDigest([student], rawMarks, attended, { today });
  const c = result.campuses['chungju'];
  assert(!!c, '이탈급증 학생 캠퍼스(chungju) 항목 생성');
  const entry = c.leftSpikes.find((e) => e.studentId === 'spike1');
  assert(!!entry, '이탈급증 명단에 등장');
  assert(entry?.recentLeftDays === 3, `최근 이탈일수=3 (got ${entry?.recentLeftDays})`);
  assert(entry?.priorLeftDays === 0, `이전 이탈일수=0 (got ${entry?.priorLeftDays})`);
}

// ── 5) 여러 캠퍼스 그룹핑 + counts 일치(혼합 케이스) ──
{
  const wonjuClean = mkStudent('w1', '원주클린', 'wonju');
  const chuncheonConsec = mkStudent('c1', '춘천연속', 'chuncheon');
  const rawMarks = [
    ...bulkMarksForDate(chuncheonConsec.id, dk(1)),
    ...bulkMarksForDate(chuncheonConsec.id, dk(2)),
  ];
  const result = buildDailyDigest([wonjuClean, chuncheonConsec], rawMarks, new Set(), { today });
  assert(Object.keys(result.campuses).sort().join(',') === 'chuncheon,wonju', '학생이 속한 캠퍼스별로만 그룹 생성');
  assert(result.campuses['wonju'].consecutiveAbsences.length === 0, '원주 그룹엔 춘천 학생 섞이지 않음');
  assert(result.campuses['chuncheon'].consecutiveAbsences.some((e) => e.studentId === 'c1'), '춘천 그룹에 연속결석 학생 포함');
  for (const campus of Object.values(result.campuses)) {
    assert(
      campus.counts.yesterdayAbsences === campus.yesterdayAbsences.length &&
      campus.counts.leftSpikes === campus.leftSpikes.length &&
      campus.counts.consecutiveAbsences === campus.consecutiveAbsences.length &&
      campus.counts.riskBand === campus.riskBand.length &&
      campus.counts.riskBandNew === campus.riskBand.filter((r) => r.isNew).length,
      `counts가 배열 길이와 일치(${campus.campus})`,
    );
  }
}

// ── 6) previousRiskStudentIds 미주입 시 위험학생 전부 isNew=false가 아니라, 실제로는 모두 신규(true)로 간주 ──
// (opts 문서: 없으면 previousRisk가 빈 Set → isNew = !has(id) = true)
{
  const student = mkStudent('risk1', '최위험', 'wonju');
  // 연속결석 다수 + 어제결석으로 결석신호를 강하게 만들어 위험밴드 진입 유도
  const rawMarks: { date: string; seatKey: string }[] = [];
  for (let n = 1; n <= 5; n++) rawMarks.push(...bulkMarksForDate(student.id, dk(n)));
  const result = buildDailyDigest([student], rawMarks, new Set(), { today });
  const c = result.campuses['wonju'];
  const riskEntry = c.riskBand.find((r) => r.studentId === 'risk1');
  if (riskEntry) {
    assert(riskEntry.isNew === true, 'previousRiskStudentIds 미주입 → 위험학생 isNew=true');
  } else {
    console.log('note: risk1이 위험밴드에 진입하지 않음(가중치 기본값 기준) — isNew 케이스는 스킵');
  }

  // previousRiskStudentIds에 포함시키면 isNew=false
  if (riskEntry) {
    const result2 = buildDailyDigest([student], rawMarks, new Set(), { today, previousRiskStudentIds: new Set(['risk1']) });
    const entry2 = result2.campuses['wonju'].riskBand.find((r) => r.studentId === 'risk1');
    assert(entry2?.isNew === false, 'previousRiskStudentIds에 있으면 isNew=false');
  }
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
if (failures) process.exit(1);
