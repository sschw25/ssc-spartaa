import { NextRequest, NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { updateStudentById } from '@/lib/store';
import { appendThreadMessage } from '@/lib/thread';

// 학생이 관리자 답변에 재답변(스레드 추가). kind=request|suggestion|leave + id 로 대상 식별.
// 상태(status)는 변경하지 않는다 — 인박스는 thread 마지막 발신자가 학생이면 '재답변 대기'로 재노출.
export async function POST(req: NextRequest) {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }

  let body: { kind?: unknown; id?: unknown; message?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const kind = body?.kind === 'request' || body?.kind === 'suggestion' || body?.kind === 'leave' ? body.kind : null;
  const id = typeof body?.id === 'string' ? body.id : '';
  const message = String(body?.message ?? '').trim().slice(0, 1000);
  if (!kind || !id) {
    return NextResponse.json({ success: false, message: '대상이 올바르지 않습니다.' }, { status: 400 });
  }
  if (!message) {
    return NextResponse.json({ success: false, message: '답변 내용을 입력해 주세요.' }, { status: 400 });
  }

  let errorResponse: NextResponse | null = null;
  const result = await updateStudentById(studentId, (student) => {
    if (kind === 'leave') {
      const target = (student.leaveRequests || []).find((r) => r.id === id);
      if (!target) {
        errorResponse = NextResponse.json({ success: false, message: '신청을 찾을 수 없습니다.' }, { status: 404 });
        return false;
      }
      appendThreadMessage(target, { from: 'student', text: message });
    } else {
      const targetType = kind === 'request' ? 'request' : 'suggestion';
      const target = (student.consultationLogs || []).find((l) => l.id === id && l.type === targetType);
      if (!target) {
        errorResponse = NextResponse.json({ success: false, message: '신청을 찾을 수 없습니다.' }, { status: 404 });
        return false;
      }
      appendThreadMessage(target, { from: 'student', text: message });
    }
  });
  if (errorResponse) return errorResponse;
  if (result === 'not_found') {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }
  if (typeof result === 'string') {
    return NextResponse.json({ success: false, message: '저장이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' }, { status: 409 });
  }

  return NextResponse.json({ success: true });
}
