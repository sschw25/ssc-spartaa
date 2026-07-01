import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { getSessionsByDate, getStudentsSummary } from '@/lib/store';

// GET /api/admin/seat-board?date=YYYY-MM-DD
// 출결판용: 해당 날짜의 전체 학생 세션 반환
export async function GET(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ success: false, message: '날짜 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  try {
    const sessions = await getSessionsByDate(date);
    if (session.campus === 'all') {
      return NextResponse.json({ success: true, sessions });
    }

    const students = await getStudentsSummary();
    const visibleStudentIds = new Set(
      students.filter((student) => student.campus === session.campus).map((student) => student.id),
    );
    return NextResponse.json({
      success: true,
      sessions: sessions.filter((studySession) => visibleStudentIds.has(studySession.student_id)),
    });
  } catch (e: unknown) {
    console.error('[seat-board GET]', e);
    const msg = e instanceof Error ? e.message : '조회 실패';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
