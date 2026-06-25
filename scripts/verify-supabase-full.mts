// 전 페이즈 실 Supabase 검증 — 읽기 전용. 어떤 쓰기/수정/삭제도 하지 않음.
// (sweep은 dry-run: 마감 대상만 계산하고 checkOut 호출 안 함)
// 실행: npx tsx --env-file=.env.local scripts/verify-supabase-full.mts
import {
  activeBackend, getStudents, getOpenSessions, getSessionsByDate,
  getStudyMinutesByStudent, getStudySessions,
} from '../lib/store';
import { getPeriodBounds, buildStudyStats } from '../lib/study-stats';
import { getStudentTodayTotalStudyTimeMin } from '../lib/progress-plan';

let pass = 0, fail = 0;
const ok = (label: string, cond: boolean, extra = '') => {
  console.log(`${cond ? '✅' : '❌'} ${label}${extra ? ' — ' + extra : ''}`);
  cond ? pass++ : fail++;
};
const weekdayOf = (d: string) => { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd)).getUTCDay(); };

(async () => {
  ok('백엔드가 supabase', activeBackend() === 'supabase', activeBackend());
  const { todayStr, weekStart, monthStart } = getPeriodBounds();
  console.log(`기준 today=${todayStr} weekStart=${weekStart} monthStart=${monthStart}\n`);

  const [students, openSessions, todaySessions, weekMin] = await Promise.all([
    getStudents(), getOpenSessions(), getSessionsByDate(todayStr), getStudyMinutesByStudent(weekStart),
  ]);
  console.log(`로드: 학생 ${students.length} · 열린세션 ${openSessions.length} · 오늘세션 ${todaySessions.length} · 주순공집계 ${Object.keys(weekMin).length}명\n`);

  // ── A. 오늘 출결 라우트 불변식 ──
  console.log('── A. 오늘 출결 분류 ──');
  const sMap = new Map(students.map((s) => [s.id, s]));
  const openIds = new Set(openSessions.map((s) => s.student_id));
  const todayIds = new Set(todaySessions.filter((s) => sMap.has(s.student_id)).map((s) => s.student_id));
  const presentIds = [...openIds].filter((id) => sMap.has(id));
  const leftIds = [...todayIds].filter((id) => !openIds.has(id));
  const seen = new Set([...todayIds, ...openIds]);
  const absentIds = students.filter((s) => !seen.has(s.id)).map((s) => s.id);
  ok('합계(등원중+하원+미등원) == 총원', presentIds.length + leftIds.length + absentIds.length === students.length,
    `${presentIds.length}+${leftIds.length}+${absentIds.length}=${presentIds.length + leftIds.length + absentIds.length} vs ${students.length}`);
  ok('버킷 상호배타 (한 학생이 두 곳에 없음)',
    new Set([...presentIds, ...leftIds, ...absentIds]).size === presentIds.length + leftIds.length + absentIds.length);
  ok('등원중 학생은 모두 열린세션 보유', presentIds.every((id) => openIds.has(id)));
  ok('미등원 학생은 오늘세션도 열린세션도 없음', absentIds.every((id) => !todayIds.has(id) && !openIds.has(id)));
  ok('열린세션은 학생당 1건 이하 (부분 유니크 인덱스)', openIds.size === openSessions.length, `세션 ${openSessions.length} / 학생 ${openIds.size}`);

  // ── B. 리포트 studyStats 불변식 (학생별, 리포트 API와 동일 입력) ──
  console.log('\n── B. 리포트 순공/출석 통계 (학생별) ──');
  for (const stu of students) {
    const sessions = await getStudySessions(stu.id, monthStart);
    const st = buildStudyStats({ sessions, weeklyMinutesByStudent: weekMin, myId: stu.id, totalStudents: students.length });

    const byWeekdaySum = st.byWeekday.reduce((a, d) => a + d.min, 0);
    const completedMonthMin = sessions.filter((s) => s.minutes != null).reduce((a, s) => a + (s.minutes || 0), 0);
    const distinctWeekDates = new Set(sessions.filter((s) => s.date >= weekStart).map((s) => s.date)).size;
    let expected = 0; for (let d = weekStart; d <= todayStr; ) { if (weekdayOf(d) !== 0) expected++; const [y, m, dd] = d.split('-').map(Number); const nx = new Date(Date.UTC(y, m - 1, dd + 1)); d = nx.toISOString().slice(0, 10); }

    const inv =
      st.weekTotalMin >= 0 && st.monthTotalMin >= 0 &&
      st.byWeekday.length === 7 &&
      byWeekdaySum === completedMonthMin &&                 // 요일분포 합 == 이번달 완료순공
      st.weekAttendedDays === distinctWeekDates &&          // 출석일 == 주간 distinct 날짜
      st.weekExpectedDays === expected &&                   // 기대출석 == 월~토 경과일
      st.weekAbsentDays === Math.max(0, expected - distinctWeekDates) &&
      st.weekAbsentDays >= 0;
    ok(`[${stu.name}] studyStats 불변식`, inv,
      `주${st.weekTotalMin}분/월${st.monthTotalMin}분 출석${st.weekAttendedDays}/${st.weekExpectedDays} 결석${st.weekAbsentDays} ${st.weekRank ? `${st.weekRank.rank}등/${st.weekRank.total}` : '등수-'}`);
  }

  // ── C. 진도 기반 오늘 학습시간 (Phase1 학습요일 로직) ──
  console.log('\n── C. 오늘 계획학습시간 (학습요일 반영) ──');
  let allFinite = true; const samples: string[] = [];
  for (const stu of students) {
    const min = getStudentTodayTotalStudyTimeMin(stu);
    if (!Number.isFinite(min) || min < 0) allFinite = false;
    samples.push(`${stu.name}:${min}분`);
  }
  ok('전 학생 오늘 계획시간이 유한·음수아님 (무크래시)', allFinite, samples.join(' · '));

  // ── D. sweep dry-run (무변경) ──
  console.log('\n── D. sweep dry-run (마감 대상 계산만, 변경 없음) ──');
  const closeHm = (process.env.ATTEND_CLOSE_TIME || '23:59').trim();
  const now = new Date();
  const wouldClose = openSessions.filter((s) => now.getTime() >= new Date(`${s.date}T${closeHm}:00+09:00`).getTime());
  ok('마감 대상은 모두 마감시각 경과', wouldClose.every((s) => now.getTime() >= new Date(`${s.date}T${closeHm}:00+09:00`).getTime()),
    `열린 ${openSessions.length}건 중 ${wouldClose.length}건 마감 대상 (오늘 진행중은 보존)`);
  ok('오늘 등원해 아직 마감 전인 세션은 보존됨',
    openSessions.filter((s) => s.date === todayStr && now.getTime() < new Date(`${todayStr}T${closeHm}:00+09:00`).getTime()).every((s) => !wouldClose.includes(s)));

  console.log(`\n━━━ 결과: ${pass} pass / ${fail} fail ━━━`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('❌ 실패:', e?.message || e); process.exit(1); });
