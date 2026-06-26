import { NextRequest, NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { getStudentById, saveStudent } from '@/lib/store';

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

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
    const student = await getStudentById(studentId);
    if (!student) {
      return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    const excuses = student.saturdayLateExcuses || [];
    const target = excuses.find(e => e.date === date);

    if (!target) {
      return NextResponse.json({ success: false, message: '해당 일자의 지각 증빙 요청이 존재하지 않습니다.' }, { status: 404 });
    }

    if (target.status !== 'pending') {
      return NextResponse.json({ success: false, message: '이미 제출했거나 처리가 완료된 증빙 건입니다.' }, { status: 400 });
    }

    // 증빙 회신 업데이트
    target.status = 'submitted';
    target.reason = reason.trim();
    target.submittedAt = new Date().toISOString();

    student.saturdayLateExcuses = excuses;
    await saveStudent(student);

    return NextResponse.json({ 
      success: true, 
      message: '사유 증빙 회신이 완료되었습니다.',
      saturdayLateExcuses: student.saturdayLateExcuses 
    });
  } catch (error: unknown) {
    console.error('saturday-excuse submit error:', error);
    return NextResponse.json({ success: false, message: getErrorMessage(error, '처리 중 오류가 발생했습니다.') }, { status: 500 });
  }
}
