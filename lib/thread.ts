import type { ThreadMessage } from './types/student';

// 양방향 대화(스레드) 유틸. 요청/건의(ConsultationLog)·휴가(LeaveRequest)에 공통 적용.
// - thread[]는 최초 신청(content/reason) "이후"의 추가 메시지만 담는다(head는 신청 본문).
// - 레거시 데이터는 adminReply 단일 필드만 있고 thread가 없으므로, 첫 추가 메시지 작성 직전
//   seedLegacyThread()로 기존 adminReply를 thread의 첫 admin 메시지로 승격해 무손실 이관한다.

type ThreadCarrier = { thread?: ThreadMessage[]; adminReply?: string; repliedAt?: string };

function makeId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// 레거시 adminReply를 thread 첫 메시지로 승격 (thread가 비어있을 때 1회).
export function seedLegacyThread(target: ThreadCarrier): void {
  if (!target.thread) target.thread = [];
  if (target.thread.length === 0 && target.adminReply) {
    target.thread.push({
      id: `legacy_${makeId()}`,
      from: 'admin',
      text: target.adminReply,
      at: target.repliedAt || '',
    });
  }
}

// 스레드에 메시지 추가. seedLegacyThread를 선행 호출해 레거시 답변을 보존한 뒤 append.
export function appendThreadMessage(
  target: ThreadCarrier,
  msg: { from: 'student' | 'admin'; text: string; author?: string },
): ThreadMessage {
  seedLegacyThread(target);
  const m: ThreadMessage = {
    id: makeId(),
    from: msg.from,
    text: msg.text,
    at: new Date().toISOString(),
    ...(msg.author ? { author: msg.author } : {}),
  };
  target.thread!.push(m);
  return m;
}

// 마지막 메시지가 학생이면 관리자 응답 대기 상태(인박스 재노출 트리거).
export function awaitingAdminReply(thread?: ThreadMessage[]): boolean {
  if (!thread || thread.length === 0) return false;
  return thread[thread.length - 1].from === 'student';
}

// 화면 표시용 전체 대화 = head(신청 본문) + thread(추가 메시지) 또는 레거시 adminReply.
export function buildDisplayThread(opts: {
  headText: string;
  headAt?: string;
  adminReply?: string;
  repliedAt?: string;
  thread?: ThreadMessage[];
}): ThreadMessage[] {
  const head: ThreadMessage = { id: 'head', from: 'student', text: opts.headText, at: opts.headAt || '' };
  if (opts.thread && opts.thread.length > 0) return [head, ...opts.thread];
  if (opts.adminReply) {
    return [head, { id: 'legacy', from: 'admin', text: opts.adminReply, at: opts.repliedAt || '' }];
  }
  return [head];
}
