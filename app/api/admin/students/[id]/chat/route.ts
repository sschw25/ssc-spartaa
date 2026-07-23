import { NextResponse } from 'next/server';
import { canAdminAccessStudent } from '@/lib/auth';
import { updateStudentById } from '@/lib/store';
import { appendThreadMessage } from '@/lib/thread';
import { findOrCreateChatLog, capChatThread } from '@/lib/chat';
import type { ThreadMessage } from '@/lib/types/student';

// 관리자 → 학생 자유채팅 전송. 학생 쪽 /api/student/chat 과 같은 싱글턴 chat 로그에 append.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!(await canAdminAccessStudent(id))) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });
  }

  let body: { message?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const message = String(body?.message ?? '').trim();
  if (!message) {
    return NextResponse.json({ success: false, message: '메시지 내용이 필요합니다.' }, { status: 400 });
  }
  if (message.length > 1000) {
    return NextResponse.json({ success: false, message: '메시지는 1000자 이내로 입력하세요.' }, { status: 400 });
  }

  let sent: ThreadMessage | null = null;
  const result = await updateStudentById(id, (student) => {
    const chat = findOrCreateChatLog(student);
    sent = appendThreadMessage(chat, { from: 'admin', text: message, author: '코멘터' });
    // 내가 방금 보낸 시점까지는 읽은 상태 — 관리자 미읽음 dot 자기증식 방지.
    chat.adminReadAt = sent.at;
    capChatThread(chat);
  });

  if (result === 'not_found') {
    return NextResponse.json({ success: false, message: '해당 학생을 찾을 수 없습니다.' }, { status: 404 });
  }
  if (typeof result === 'string') {
    return NextResponse.json({ success: false, message: '저장이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' }, { status: 409 });
  }

  return NextResponse.json({ success: true, sent });
}

// 채팅방 열람(읽음) 마커 — 미읽음 dot 계산용. 채팅 로그가 없으면 저장 스킵.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!(await canAdminAccessStudent(id))) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });
  }

  const nowIso = new Date().toISOString();
  const result = await updateStudentById(id, (student) => {
    const chat = (student.consultationLogs || []).find((l) => l.type === 'chat');
    if (!chat) return false; // 채팅 없음 — 저장 스킵(abort)
    chat.adminReadAt = nowIso;
  });

  if (result === 'not_found') {
    return NextResponse.json({ success: false, message: '해당 학생을 찾을 수 없습니다.' }, { status: 404 });
  }
  if (typeof result === 'string' && result !== 'abort') {
    return NextResponse.json({ success: false, message: '저장이 지연되고 있습니다.' }, { status: 409 });
  }

  return NextResponse.json({ success: true, readAt: nowIso });
}
