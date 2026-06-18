// Supabase 실연결 + 새 출결 함수 읽기전용 검증.
// 실행: npx tsx --env-file=.env.local scripts/probe-supabase.mts
// 주의: SELECT만 수행 — 어떤 쓰기/수정/삭제도 하지 않음.
import { activeBackend, getStudents, getOpenSessions, getSessionsByDate, getStudyMinutesByStudent } from '../lib/store';
import { getPeriodBounds } from '../lib/study-stats';

(async () => {
  console.log('activeBackend:', activeBackend());
  const { todayStr, weekStart } = getPeriodBounds();
  console.log('todayStr:', todayStr, '| weekStart:', weekStart);

  const students = await getStudents();
  console.log(`✅ getStudents: ${students.length}명 (연결 정상)`);

  const open = await getOpenSessions();
  console.log(`✅ getOpenSessions(신규): ${open.length}건 현재 등원중`);

  const today = await getSessionsByDate(todayStr);
  console.log(`✅ getSessionsByDate(신규, ${todayStr}): ${today.length}건`);
  const closedToday = today.filter((s) => s.check_out).length;
  console.log(`   - 오늘 하원완료: ${closedToday} / 진행중: ${today.length - closedToday}`);

  const wk = await getStudyMinutesByStudent(weekStart);
  const ids = Object.keys(wk);
  const totalWeekMin = ids.reduce((a, k) => a + wk[k], 0);
  console.log(`✅ getStudyMinutesByStudent(${weekStart}): ${ids.length}명, 합계 ${totalWeekMin}분`);

  // 위젯 분류 미리보기 (라우트와 동일: 학생 단위) — 합계는 총원과 일치해야 함
  const studentMap = new Map(students.map((s) => [s.id, s]));
  const openIds = new Set(open.map((s) => s.student_id));
  const present = open.filter((s) => studentMap.has(s.student_id)).length;
  const todayStudents = new Set(today.filter((s) => studentMap.has(s.student_id)).map((s) => s.student_id));
  const left = [...todayStudents].filter((sid) => !openIds.has(sid)).length;
  const seen = new Set(todayStudents);
  open.forEach((s) => seen.add(s.student_id));
  const absent = students.filter((s) => !seen.has(s.id)).length;
  const sum = present + left + absent;
  console.log(`\n📊 오늘 출결 위젯 미리보기 → 등원중 ${present} / 하원 ${left} / 미등원 ${absent} (합계 ${sum} / 총 ${students.length}) ${sum === students.length ? '✅ 일치' : '❌ 불일치'}`);

  process.exit(0);
})().catch((e) => {
  console.error('❌ 실패:', e?.message || e);
  process.exit(1);
});
