import { NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { verifyAttendToken } from '@/lib/attendance-token';
import { getOpenSession, getStudentById, getStudySessions } from '@/lib/store';
import { toggleAttendance, processAttendance, type AttendanceAction } from '@/lib/attendance-service';

// 현재 등원 상태 조회 (로그인한 학생 본인)
export async function GET() {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '학생 로그인이 필요합니다.' }, { status: 401 });
  }

  try {
    const todayKey = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
    const openSession = await getOpenSession(studentId);
    const student = await getStudentById(studentId);
    const sessions = await getStudySessions(studentId, todayKey);
    const todays = sessions
      .filter((s) => s.date === todayKey)
      .sort((a, b) => a.check_in.localeCompare(b.check_in));
    const completedMin = todays.reduce((sum, s) => sum + (s.minutes || 0), 0);
    // 자정을 넘긴 미종료(stale) 세션이 '오늘 순공'/경과 시간을 부풀리지 않도록, 오늘 시작한 열린 세션만 인정
    const sinceToday = !!openSession && openSession.date === todayKey;
    const openMin = sinceToday
      ? Math.max(0, Math.floor((Date.now() - new Date(openSession!.check_in).getTime()) / 60000))
      : 0;
    return NextResponse.json({
      success: true,
      checkedIn: !!openSession,
      since: openSession?.check_in || null,
      sinceToday,
      studentName: student?.name || '',
      todayMinutes: completedMin + openMin,
      todaySessions: todays.map((s) => ({ checkIn: s.check_in, checkOut: s.check_out })),
    });
  } catch (error) {
    // 상세(PG/Supabase 에러 원문)는 서버 로그로만 남기고 클라이언트엔 고정 메시지만 반환
    console.error('attend GET error:', error);
    return NextResponse.json({ success: false, message: '상태 조회에 실패했어요.' }, { status: 500 });
  }
}

// QR 스캔 후 등원/하원/외출/복귀 처리 (로그인한 학생 본인 + 유효한 키오스크 토큰)
export async function POST(request: Request) {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '학생 로그인이 필요합니다.' }, { status: 401 });
  }

  try {
    const { token, action } = await request.json();
    if (!verifyAttendToken(token || '')) {
      return NextResponse.json(
        { success: false, message: 'QR이 만료되었거나 올바르지 않습니다. 키오스크 화면에서 다시 스캔해 주세요.' },
        { status: 400 }
      );
    }

    const targetAction = action as AttendanceAction;
    const result = targetAction
      ? await processAttendance(studentId, targetAction, 'qr')
      : await toggleAttendance(studentId, 'qr');
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    // 상세(PG/Supabase 에러 원문)는 서버 로그로만 남기고 클라이언트엔 고정 메시지만 반환
    console.error('attend POST error:', error);
    return NextResponse.json({ success: false, message: '등하원 처리에 실패했어요.' }, { status: 500 });
  }
}
