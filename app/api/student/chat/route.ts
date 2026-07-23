import { NextRequest, NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { updateStudentById } from '@/lib/store';
import { appendThreadMessage } from '@/lib/thread';
import { findOrCreateChatLog, capChatThread } from '@/lib/chat';
import type { ThreadMessage } from '@/lib/types/student';

// 학생↔관리자 자유채팅 — 학생당 싱글턴 ConsultationLog(type='chat', id='chat_main')의 thread[]에 누적.
// consultation_logs jsonb 재사용이라 마이그레이션 불필요. 학부모 리포트에는 절대 미노출(report route 필터).
export async function POST(req: NextRequest) {
  // studentId는 반드시 검증된 세션에서만 유도한다(클라이언트 body 폴백 금지 — IDOR 방지)
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }

  let body: { message?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const message = String(body?.message ?? '').trim();
  if (!message) {
    return NextResponse.json({ success: false, message: '메시지를 입력해 주세요.' }, { status: 400 });
  }
  if (message.length > 1000) {
    return NextResponse.json({ success: false, message: '메시지가 너무 길어요. 1000자 이내로 보내 주세요.' }, { status: 400 });
  }

  let sent: ThreadMessage | null = null;
  const result = await updateStudentById(studentId, (student) => {
    const chat = findOrCreateChatLog(student);
    sent = appendThreadMessage(chat, { from: 'student', text: message });
    // 내가 방금 보낸 시점까지는 당연히 읽은 상태 — 미읽음 배지 자기증식 방지.
    chat.studentReadAt = sent.at;
    capChatThread(chat);
  });

  if (result === 'not_found') {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }
  if (typeof result === 'string') {
    return NextResponse.json({ success: false, message: '저장이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' }, { status: 409 });
  }

  return NextResponse.json({ success: true, sent });
}

// 채팅방 열람(읽음) 마커 — 미읽음이 있을 때만 클라가 호출해 쓰기를 아낀다.
export async function PATCH() {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }

  const nowIso = new Date().toISOString();
  const result = await updateStudentById(studentId, (student) => {
    const chat = (student.consultationLogs || []).find((l) => l.type === 'chat');
    if (!chat) return false; // 채팅 자체가 없으면 저장 스킵(abort)
    chat.studentReadAt = nowIso;
  });

  if (result === 'not_found') {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }
  // 'abort'(채팅 없음)는 실패가 아니다 — 읽을 것도 없으니 성공으로 응답.
  if (typeof result === 'string' && result !== 'abort') {
    return NextResponse.json({ success: false, message: '저장이 지연되고 있습니다.' }, { status: 409 });
  }

  return NextResponse.json({ success: true, readAt: nowIso });
}
