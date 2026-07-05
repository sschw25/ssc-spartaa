import { NextRequest, NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { updateStudentById } from '@/lib/store';

export async function POST(req: NextRequest) {
  const sessionStudentId = await getStudentSessionId();
  if (!sessionStudentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }

  let body: { studentId?: string; date?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  const { studentId, date, reason } = body;
  if (!studentId || !date || !reason || !reason.trim()) {
    return NextResponse.json({ success: false, message: '필수 값이 누락되었습니다.' }, { status: 400 });
  }

  // 보안 검증: 현재 로그인한 학생이 요청한 studentId와 일치하는지 확인
  if (sessionStudentId !== studentId) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });
  }

  try {
    let errorResponse: NextResponse | null = null;
    const result = await updateStudentById(studentId, (student) => {
      const excuses = student.saturdayLateExcuses || [];
      const target = excuses.find(e => e.date === date);

      if (!target) {
        errorResponse = NextResponse.json({ success: false, message: '해당 일자의 지각 증빙 요청이 존재하지 않습니다.' }, { status: 404 });
        return false;
      }

      if (target.status !== 'pending') {
        errorResponse = NextResponse.json({ success: false, message: '이미 제출했거나 처리가 완료된 증빙 건입니다.' }, { status: 400 });
        return false;
      }

      // 증빙 회신 업데이트
      target.status = 'submitted';
      target.reason = reason.trim();
      target.submittedAt = new Date().toISOString();

      student.saturdayLateExcuses = excuses;
    });
    if (errorResponse) return errorResponse;
    if (result === 'not_found') {
      return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
    }
    if (typeof result === 'string') {
      return NextResponse.json({ success: false, message: '저장이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' }, { status: 409 });
    }

    return NextResponse.json({
      success: true,
      message: '사유 증빙 회신이 완료되었습니다.',
      saturdayLateExcuses: result.saturdayLateExcuses
    });
  } catch (error) {
    // 상세(PG/Supabase 에러 원문)는 서버 로그로만 남기고 클라이언트엔 고정 메시지만 반환
    console.error('saturday-excuse submit error:', error);
    return NextResponse.json({ success: false, message: '처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
