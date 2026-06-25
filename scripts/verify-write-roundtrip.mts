// 실 Supabase 왕복 쓰기 검증 — 격리 테스트 학생(__verify_*)으로
// 등원중 버킷 / 순공 등수 / sweep 실마감을 실제 라우트로 확인 후 cascade 삭제로 완전 정리.
// 실행: npx tsx --env-file=.env.local scripts/verify-write-roundtrip.mts
// 전제: localhost:3000 dev 서버 가동 중(동일 Supabase 연결).
import { saveStudent, deleteStudent, getStudentById, getOpenSessions, getStudySessions } from '../lib/store';
import { checkInSupabase, checkOutSupabase } from '../lib/supabase';

let pass = 0, fail = 0;
const ok = (l: string, c: boolean, x = '') => { console.log(`${c ? '✅' : '❌'} ${l}${x ? ' — ' + x : ''}`); c ? pass++ : fail++; };

const COOKIE = 'admin-session=ssc-admin-authorized-token-2026';
const api = (p: string, opt: any = {}) =>
  fetch(`http://localhost:3000${p}`, { ...opt, headers: { Cookie: COOKIE, 'Content-Type': 'application/json', ...(opt.headers || {}) } })
    .then((r) => r.json());

const TID = `__verify_${Date.now()}`;

(async () => {
  let created = false;
  try {
    const before = await api('/api/admin/attendance/today');
    console.log(`baseline → 등원중 ${before.summary.present} / 하원 ${before.summary.leftToday} / 미등원 ${before.summary.absent} / 총 ${before.summary.total}\n`);

    // ── 0) 테스트 학생 생성 ──
    const iso = new Date().toISOString();
    await saveStudent({ id: TID, name: '__검증용학생', campus: 'wonju', manager: 'verify', contact: '', books: [], lectures: [], consultationLogs: [], grades: [], subjects: [], createdAt: iso, updatedAt: iso } as any);
    created = true;
    ok('0. 테스트 학생 생성', (await getStudentById(TID)) !== null);

    // ── 1) 등원 → present 버킷 (실제 라우트) ──
    const open1 = await checkInSupabase(TID, 'qr');
    const t1 = await api('/api/admin/attendance/today');
    ok('1a. 등원중 버킷에 노출', t1.present.some((r: any) => r.id === TID));
    ok('1b. summary present +1', t1.summary.present === before.summary.present + 1, `${before.summary.present}→${t1.summary.present}`);
    ok('1c. summary total +1', t1.summary.total === before.summary.total + 1);
    ok('1d. getOpenSessions 포함', (await getOpenSessions()).some((s) => s.student_id === TID));
    const me = t1.present.find((r: any) => r.id === TID);
    ok('1e. present 필드(등원시각·경과분)', !!me?.checkInAt && typeof me?.minutesSoFar === 'number');
    await checkOutSupabase(open1); // 닫기(≈0분)

    // ── 2) 비0 순공 → 등수 산출 (실제 리포트 라우트) ──
    const now = new Date();
    const back = await checkInSupabase(TID, 'qr', new Date(now.getTime() - 120 * 60000)); // 2시간 전 등원
    await checkOutSupabase(back, now); // 순공 ≈120분
    const rep = await api(`/api/report/${TID}`);
    ok('2a. report weekTotalMin≈120', rep.studyStats?.weekTotalMin >= 100, `${rep.studyStats?.weekTotalMin}분`);
    ok('2b. report 순공 등수 산출', !!rep.studyStats?.weekRank && rep.studyStats.weekRank.rank >= 1, JSON.stringify(rep.studyStats?.weekRank));
    ok('2c. report weekAttendedDays≥1', rep.studyStats?.weekAttendedDays >= 1, `출석 ${rep.studyStats?.weekAttendedDays}/${rep.studyStats?.weekExpectedDays}`);

    // ── 3) sweep 실마감 (어제자 열린세션) ──
    const stale = await checkInSupabase(TID, 'qr', new Date(now.getTime() - 24 * 60 * 60000)); // 어제 등원, 미퇴실
    ok('3a. 어제자 유휴 세션 생성', (await getOpenSessions()).some((s) => s.id === stale.id), `date=${stale.date}`);
    const sw = await api('/api/admin/attendance/sweep', { method: 'POST' });
    ok('3b. sweep 실제 마감 closed≥1', sw.closed >= 1, JSON.stringify(sw));
    ok('3c. sweep 후 유휴세션 사라짐', !(await getOpenSessions()).some((s) => s.id === stale.id));
    const swept = (await getStudySessions(TID)).find((s) => s.id === stale.id);
    ok('3d. 자동 마감은 순공 미반영(minutes=null)', swept?.source === 'auto-sweep' && swept.minutes === null, JSON.stringify(swept));
  } catch (e: any) {
    ok('예외 없이 진행', false, e?.message || String(e));
  } finally {
    // ── 정리: cascade 삭제(세션 동반 삭제) ──
    if (created) {
      await deleteStudent(TID);
      ok('9a. 정리: 테스트 학생 삭제', (await getStudentById(TID)) === null);
      ok('9b. 정리: 잔여 세션 없음', !(await getOpenSessions()).some((s) => s.student_id === TID));
      const after = await api('/api/admin/attendance/today');
      ok('9c. 정리: 총원 원복', after.success === true && !after.present.some((r: any) => r.id === TID) && !after.absent.some((r: any) => r.id === TID));
    }
    console.log(`\n━━━ 왕복 쓰기 검증: ${pass} pass / ${fail} fail ━━━`);
    process.exit(fail > 0 ? 1 : 0);
  }
})();
