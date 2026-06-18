import { NextResponse } from 'next/server';
import { getStudentSessionId, isAdmin } from '@/lib/auth';
import { activeBackend, getStudents, getStudyMinutesByStudent, getOpenSessions } from '@/lib/store';
import { getPeriodBounds, buildLeaderboard } from '@/lib/study-stats';

// 주간 순공 랭킹 (열품타식 동기부여). 로그인 학생 본인 또는 관리자만.
// 이름은 마스킹(김O연)되어 프라이버시 보호. 'liveCount'는 지금 등원 중 인원.
export async function GET() {
  const sid = await getStudentSessionId();
  const admin = await isAdmin();
  if (!sid && !admin) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }

  if (activeBackend() !== 'supabase') {
    return NextResponse.json({ success: true, configured: false });
  }

  try {
    const { weekStart } = getPeriodBounds();
    const [students, weekMin, openSessions] = await Promise.all([
      getStudents(),
      getStudyMinutesByStudent(weekStart),
      getOpenSessions(),
    ]);

    const leaderboard = buildLeaderboard(
      weekMin,
      students.map((s) => ({ id: s.id, name: s.name, campus: s.campus })),
      sid || '',
      20
    );

    return NextResponse.json({
      success: true,
      configured: true,
      weekStart,
      leaderboard,
      liveCount: openSessions.length,
    });
  } catch (e: any) {
    console.error('leaderboard error:', e);
    return NextResponse.json({ success: false, message: e?.message || '랭킹 조회 실패' }, { status: 500 });
  }
}
