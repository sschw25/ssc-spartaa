import { NextResponse } from 'next/server';
import { getStudentSessionId, isAdmin, canViewStudent } from '@/lib/auth';
import { activeBackend, getStudents, getStudyMinutesByStudent, getOpenSessions } from '@/lib/store';
import { getPeriodBounds, buildMyStanding } from '@/lib/study-stats';

// 내 순공 위치(동기부여) — 타인 명단 없이 본인 중심, 총원/절대등수(10위 밖) 비노출.
// studentId(리포트 주인공) 지정 시 canViewStudent 로 본인/관리자만 허용.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const studentId = url.searchParams.get('studentId') || '';

  let meId = '';
  if (studentId) {
    if (!(await canViewStudent(studentId))) {
      return NextResponse.json({ success: false, message: '열람 권한이 없습니다.' }, { status: 401 });
    }
    meId = studentId;
  } else {
    const sid = await getStudentSessionId();
    if (!sid && !(await isAdmin())) {
      return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
    }
    meId = sid || '';
  }

  if (activeBackend() !== 'supabase') {
    return NextResponse.json({ success: true, configured: false });
  }

  try {
    const { weekStart, todayStr } = getPeriodBounds();
    const [students, weekMin, dayMin, openSessions] = await Promise.all([
      getStudents(),
      getStudyMinutesByStudent(weekStart),
      getStudyMinutesByStudent(todayStr),
      getOpenSessions(),
    ]);
    const roster = students.map((s) => ({ id: s.id }));

    return NextResponse.json({
      success: true,
      configured: true,
      weekStart,
      today: todayStr,
      week: buildMyStanding(weekMin, roster, meId),
      day: buildMyStanding(dayMin, roster, meId),
      liveCount: openSessions.length,
    });
  } catch (e: any) {
    console.error('leaderboard error:', e);
    return NextResponse.json({ success: false, message: e?.message || '랭킹 조회 실패' }, { status: 500 });
  }
}
