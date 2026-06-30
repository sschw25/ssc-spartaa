import { NextResponse } from 'next/server';
import { canAdminAccessStudent } from '@/lib/auth';
import { updateStudentById } from '@/lib/store';
import { appendThreadMessage } from '@/lib/thread';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!(await canAdminAccessStudent(id))) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });
  }

  let body: { suggestionId?: unknown; status?: unknown; reply?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const suggestionId = typeof body?.suggestionId === 'string' ? body.suggestionId : '';
  const status = body?.status === 'pending' ? 'pending' : body?.status === 'resolved' ? 'resolved' : null;
  const reply = typeof body?.reply === 'string' ? body.reply.trim() : null;
  if (!suggestionId) {
    return NextResponse.json({ success: false, message: '처리 대상이 올바르지 않습니다.' }, { status: 400 });
  }
  if (!status && reply === null) {
    return NextResponse.json({ success: false, message: '처리 상태 또는 답변이 필요합니다.' }, { status: 400 });
  }

  let errorResponse: NextResponse | null = null;
  const result = await updateStudentById(id, (student) => {
    const target = (student.consultationLogs || []).find((log) => log.id === suggestionId && log.type === 'suggestion');
    if (!target) {
      errorResponse = NextResponse.json({ success: false, message: '건의사항을 찾을 수 없습니다.' }, { status: 404 });
      return false;
    }

    const nowIso = new Date().toISOString();
    if (reply) {
      appendThreadMessage(target, { from: 'admin', text: reply, author: '코멘터' });
      target.adminReply = reply;
      target.repliedAt = nowIso;
    }
    if (status) {
      target.status = status;
      target.resolvedAt = status === 'resolved' ? nowIso : undefined;
      target.acknowledgedAt = status === 'pending' ? nowIso : undefined;
    }
  });

  if (errorResponse) return errorResponse;
  if (result === 'not_found') {
    return NextResponse.json({ success: false, message: '해당 학생을 찾을 수 없습니다.' }, { status: 404 });
  }
  if (typeof result === 'string') {
    return NextResponse.json({ success: false, message: '저장이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' }, { status: 409 });
  }

  return NextResponse.json({ success: true });
}
