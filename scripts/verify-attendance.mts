// 새 출결/순공 로직 검증 — 실제 모듈을 직접 import 해 결정론적으로 실행.
// 실행: npx tsx scripts/verify-attendance.mts
process.env.ATTEND_KIOSK_KEY = 'kiosk-secret-xyz';
process.env.ATTEND_TOKEN_SECRET = 'test-secret';

import { buildStudyStats, getPeriodBounds } from '../lib/study-stats';
import { createAttendToken, verifyAttendToken, verifyKioskKey, ATTEND_WINDOW_MS } from '../lib/attendance-token';
import type { StudySession } from '../lib/supabase';

let pass = 0, fail = 0;
function eq(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? '✅' : '❌'} ${label} → got=${JSON.stringify(got)}${ok ? '' : ` want=${JSON.stringify(want)}`}`);
  ok ? pass++ : fail++;
}

// now = 2026-06-17(수) 14:00 KST  (= 05:00 UTC). weekStart=06-15(월), monthStart=06-01
const now = new Date('2026-06-17T05:00:00Z');

// ── getPeriodBounds ──
const pb = getPeriodBounds(now);
eq('getPeriodBounds.todayStr', pb.todayStr, '2026-06-17');
eq('getPeriodBounds.weekStart(월요일)', pb.weekStart, '2026-06-15');
eq('getPeriodBounds.monthStart', pb.monthStart, '2026-06-01');

const mk = (date: string, minutes: number | null): StudySession => ({
  id: `s_${date}_${minutes}`, student_id: 'stu1', date,
  check_in: `${date}T01:00:00Z`,
  check_out: minutes == null ? null : `${date}T03:00:00Z`,
  minutes, source: 'qr',
});

// ── 출석 시나리오: 월120, 화200(완료), 수 진행중(미퇴실), 전주 06-10 90분 ──
const sessions = [mk('2026-06-15', 120), mk('2026-06-16', 200), mk('2026-06-17', null), mk('2026-06-10', 90)];
const st = buildStudyStats({ sessions, weeklyMinutesByStudent: { stu1: 320, stuX: 500 }, myId: 'stu1', totalStudents: 5, now });
eq('weekTotalMin(완료분만 120+200)', st.weekTotalMin, 320);
eq('monthTotalMin(120+200+90, 진행중 제외)', st.monthTotalMin, 410);
eq('weekAttendedDays(월·화·수=3, 진행중 포함)', st.weekAttendedDays, 3);
eq('weekExpectedDays(월·화·수 경과=3)', st.weekExpectedDays, 3);
eq('weekAbsentDays', st.weekAbsentDays, 0);
eq('peakWeekday(화 200)', st.peakWeekday?.label, '화');
eq('weekRank(나320, 위에 500 1명 → 2등/5명)', st.weekRank, { rank: 2, total: 5 });

// ── 결석 시나리오: 화 빠짐 → 출석 {월,수}=2, 기대 3 → 결석 1 ──
const st2 = buildStudyStats({ sessions: [mk('2026-06-15', 120), mk('2026-06-17', null)], weeklyMinutesByStudent: {}, myId: 'stu1', totalStudents: 5, now });
eq('결석 시나리오 weekAttendedDays', st2.weekAttendedDays, 2);
eq('결석 시나리오 weekAbsentDays', st2.weekAbsentDays, 1);

// ── 기록 전무 → 개근/결석 안전값 ──
const st3 = buildStudyStats({ sessions: [], weeklyMinutesByStudent: {}, myId: 'stu1', totalStudents: 5, now });
eq('빈 데이터 weekAttendedDays', st3.weekAttendedDays, 0);
eq('빈 데이터 weekAbsentDays(=기대3)', st3.weekAbsentDays, 3);
eq('빈 데이터 weekRank(순공0이면 null)', st3.weekRank, null);

// ── QR 토큰 ──
const t = createAttendToken(now.getTime());
eq('verifyAttendToken 현재 윈도우', verifyAttendToken(t, now.getTime()), true);
eq('verifyAttendToken 직전 윈도우 허용', verifyAttendToken(t, now.getTime() + ATTEND_WINDOW_MS), true);
eq('verifyAttendToken 2윈도우 후 만료', verifyAttendToken(t, now.getTime() + ATTEND_WINDOW_MS * 2 + 1000), false);
eq('verifyAttendToken 위조', verifyAttendToken('999.deadbeef', now.getTime()), false);

// ── 키오스크 키 ──
eq('verifyKioskKey 일치', verifyKioskKey('kiosk-secret-xyz'), true);
eq('verifyKioskKey 불일치', verifyKioskKey('wrong'), false);
eq('verifyKioskKey 빈값', verifyKioskKey(''), false);

// ── sweep 마감시각 계산 (KST 23:30 → UTC 14:30 같은 날) ──
const closeAt = new Date(`2026-06-17T23:30:00+09:00`);
eq('sweep closeAt UTC', closeAt.toISOString(), '2026-06-17T14:30:00.000Z');
// 오늘 14:00 KST(now)는 아직 마감 전 → 정리 대상 아님
eq('sweep: 오늘 진행중은 마감 전', now.getTime() >= closeAt.getTime(), false);
// 전날 세션의 마감시각은 이미 지남 → 정리 대상
const closeAtPrev = new Date(`2026-06-16T23:30:00+09:00`);
eq('sweep: 전날 세션은 마감 대상', now.getTime() >= closeAtPrev.getTime(), true);

console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
