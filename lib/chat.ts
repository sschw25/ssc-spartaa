// 자유채팅 공용 헬퍼 — 학생당 싱글턴 ConsultationLog(type='chat', id='chat_main') 관리.
// 학생/관리자 채팅 route 양쪽에서 사용(route.ts 는 HTTP 메서드 외 export 금지라 여기로 분리).
import type { ConsultationLog } from './types/student';

export const CHAT_LOG_ID = 'chat_main';
// JSON 비대화 방지 캡 — 메시지 1000자 제한과 함께 최악 ~300KB 상한.
export const CHAT_THREAD_CAP = 300;

// 뮤테이션 내부 find-or-create(낙관적 잠금 하 멱등) — 다른 컬럼은 건드리지 않는다.
export function findOrCreateChatLog(student: { consultationLogs?: ConsultationLog[] }): ConsultationLog {
  let chat = (student.consultationLogs || []).find((l) => l.type === 'chat');
  if (!chat) {
    chat = {
      id: CHAT_LOG_ID,
      date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date()),
      manager: '채팅',
      content: '',
      type: 'chat',
      createdAt: new Date().toISOString(),
      thread: [],
    };
    student.consultationLogs = [...(student.consultationLogs || []), chat];
  }
  return chat;
}

// 캡 초과분 잘라내기 — 서버 write 경로에서만 호출(클라 조작 불가).
export function capChatThread(chat: ConsultationLog): void {
  if (chat.thread && chat.thread.length > CHAT_THREAD_CAP) {
    chat.thread = chat.thread.slice(-CHAT_THREAD_CAP);
  }
}
