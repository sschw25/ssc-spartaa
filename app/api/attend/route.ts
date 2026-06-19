import { NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { verifyAttendToken } from '@/lib/attendance-token';
import { getOpenSession, getStudentById } from '@/lib/store';
import { toggleAttendance, processAttendance, type AttendanceAction } from '@/lib/attendance-service';

// 현재 등원 상태 조회 (로그인한 학생 본인)
export async function GET() {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '학생 로그인이 필요합니다.' }, { status: 401 });
  }

  try {
    const openSession = await getOpenSession(studentId);
    const student = await getStudentById(studentId);
    return NextResponse.json({
      success: true,
      checkedIn: !!openSession,
      since: openSession?.check_in || null,
      studentName: student?.name || '',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '상태 조회 실패';
    return NextResponse.json({ success: false, message }, { status: 500 });
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '등하원 처리 실패';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
