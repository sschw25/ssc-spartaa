// 채팅 타임라인 조립 — 학생별 신청/건의/휴가/불참/쿠폰/도시락/자리이동/상담예약 + 자유채팅을
// 시간순 단일 대화 스트림으로 flatten 하는 순수 모듈. 관리자 메신저 인박스와 학생 채팅방이
// 같은 함수를 공유한다(서버 API 신설 없음 — 양쪽 다 이미 폴링하는 데이터에서 파생).
//
// 이벤트 3종:
// - card:    신청 원본(head). raw 에 원본 항목을 실어 뷰가 승인폼/취소버튼을 붙인다.
// - message: 자유채팅·스레드 재답변 말풍선. 레거시 adminReply 는 thread 규칙과 동일하게 승격.
// - status:  승인/반려/완료 등 상태 변화 시스템 말풍선. statusKind 로 뷰별 문구 매핑.
import type {
  ConsultationLog,
  LeaveRequest,
  RewardRedemption,
  SeatMoveRequest,
  ConsultationBooking,
  ThreadMessage,
} from './types/student';
import { awaitingAdminReply } from './thread';

export type TimelineSource =
  | 'leave' | 'request' | 'suggestion' | 'ot_absence' | 'mock_absence'
  | 'reward' | 'meal_add' | 'seat_move' | 'consultation' | 'chat';

export type TimelineStatusKind =
  | 'approved' | 'rejected' | 'resolved' | 'acknowledged'
  | 'coupon_deducted' | 'fulfilled' | 'cancelled' | 'done' | 'noshow';

export interface TimelineEvent {
  id: string;                       // "source:itemId:구분" — React key + 읽음 계산용 (항목 내 유일)
  at: string;                       // 정렬키 (ISO 우선, 날짜만 있으면 YYYY-MM-DD)
  side: 'student' | 'admin';        // 말풍선 방향(이벤트 발생 주체)
  kind: 'card' | 'message' | 'status';
  source: TimelineSource;
  author?: string;                  // message 작성자(관리자 이름)
  text?: string;                    // message/status 본문 — status 는 기본 문구, 뷰에서 statusKind 로 교체 가능
  statusKind?: TimelineStatusKind;  // kind==='status' 전용
  raw?: unknown;                    // kind==='card' 전용 — 원본 항목(뷰가 폼/버튼 렌더에 사용)
  needsAction?: boolean;            // 관리자 관점 미처리 여부 (card 에만 세팅)
}

// 도시락 추가신청 — mealOrders 중첩 구조를 호출측에서 미리 평탄화해서 넘긴다.
export interface MealAddInput {
  id: string;
  planId: string;
  reason?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt?: string;
  label?: string;                   // "6/23~6/27 주 월 점심" 등 표시용(호출측 조립)
}

// OT/모의고사 참여 항목 — 불참 신청 흔적이 있는 것만 이벤트가 된다.
export interface AbsenceInput {
  eventId: string;
  status: string;                   // absent_requested | absent | attended | undecided ...
  reason?: string;
  updatedAt?: string;
  eventName?: string;               // 표시용(호출측에서 eventNames 매핑)
  eventDate?: string;
}

export interface TimelineInput {
  leaveRequests?: LeaveRequest[];
  changeRequests?: ConsultationLog[];   // type==='request'
  suggestions?: ConsultationLog[];      // type==='suggestion'
  rewardRedemptions?: RewardRedemption[];
  otAbsences?: AbsenceInput[];
  mockAbsences?: AbsenceInput[];
  mealAdds?: MealAddInput[];
  seatMoves?: SeatMoveRequest[];
  consultationBookings?: ConsultationBooking[];
  chatLog?: ConsultationLog | null;     // type==='chat' 싱글턴
}

// 처리(승인/반려/완료) 이후에 학생 재답변이 왔는지 — 인박스 재노출 트리거와 동일 규칙.
export function hasStudentReplyAfter(thread: ThreadMessage[] | undefined, cutoff?: string): boolean {
  if (!cutoff || !awaitingAdminReply(thread)) return false;
  const last = thread?.[thread.length - 1];
  return Boolean(last?.at && last.at > cutoff);
}

// thread[] + 레거시 adminReply 를 message 이벤트로 펼친다(buildDisplayThread 와 동일 승격 규칙).
function threadMessages(
  source: TimelineSource,
  itemId: string,
  carrier: { thread?: ThreadMessage[]; adminReply?: string; repliedAt?: string },
): TimelineEvent[] {
  const msgs: ThreadMessage[] = (carrier.thread && carrier.thread.length > 0)
    ? carrier.thread
    : carrier.adminReply
      ? [{ id: 'legacy', from: 'admin', text: carrier.adminReply, at: carrier.repliedAt || '' }]
      : [];
  return msgs.map((m) => ({
    id: `${source}:${itemId}:msg:${m.id}`,
    at: m.at || '',
    side: m.from,
    kind: 'message' as const,
    source,
    author: m.author,
    text: m.text,
  }));
}

function statusEvent(
  source: TimelineSource,
  itemId: string,
  statusKind: TimelineStatusKind,
  at: string,
  text: string,
): TimelineEvent {
  return { id: `${source}:${itemId}:status:${statusKind}`, at, side: 'admin', kind: 'status', source, statusKind, text };
}

// 학생별 이종 항목 → 시간순 단일 타임라인. 오래된 것부터(채팅 스크롤 방향).
export function buildTimeline(input: TimelineInput): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  // 1) 휴가/반차/병가
  for (const r of input.leaveRequests || []) {
    const createdAt = r.createdAt || r.date || '';
    const processed = r.status === 'approved' || r.status === 'rejected';
    const needsAction =
      (r.status === 'pending' && !(r.adminReply || r.acknowledgedAt)) ||
      (r.status === 'pending' && awaitingAdminReply(r.thread)) ||
      (processed && hasStudentReplyAfter(r.thread, r.reviewedAt));
    events.push({
      id: `leave:${r.id}:head`, at: createdAt, side: 'student', kind: 'card', source: 'leave',
      raw: r, needsAction,
    });
    events.push(...threadMessages('leave', r.id, r));
    if (r.reappealedAt) {
      events.push({
        id: `leave:${r.id}:reappeal`, at: r.reappealedAt, side: 'student', kind: 'message', source: 'leave',
        text: r.reappealReason ? `[재승인 요청] ${r.reappealReason}` : '재승인을 요청했어요.',
      });
    }
    if (processed && r.reviewedAt) {
      events.push(statusEvent('leave', r.id, r.status as TimelineStatusKind, r.reviewedAt,
        r.status === 'approved' ? '휴가 승인' : '휴가 반려'));
    }
  }

  // 2) 학습 변경 신청 / 3) 건의 — 동일 구조(ConsultationLog)
  const consultLike: Array<[TimelineSource, ConsultationLog[] | undefined]> = [
    ['request', input.changeRequests],
    ['suggestion', input.suggestions],
  ];
  for (const [source, logs] of consultLike) {
    for (const r of logs || []) {
      const createdAt = r.createdAt || r.date || '';
      const resolved = r.status === 'resolved';
      const needsAction =
        ((r.status || 'pending') !== 'resolved' && !(r.adminReply || r.acknowledgedAt)) ||
        (!resolved && awaitingAdminReply(r.thread)) ||
        (resolved && hasStudentReplyAfter(r.thread, r.resolvedAt));
      events.push({
        id: `${source}:${r.id}:head`, at: createdAt, side: 'student', kind: 'card', source,
        raw: r, needsAction,
      });
      events.push(...threadMessages(source, r.id, r));
      if (resolved && r.resolvedAt) {
        events.push(statusEvent(source, r.id, 'resolved', r.resolvedAt,
          source === 'request' ? '요청 처리 완료' : '건의 처리 완료'));
      }
    }
  }

  // 4) OT / 5) 모의고사 불참 — 신청 흔적(absent_requested/absent)만 대화에 남긴다.
  const absencePairs: Array<['ot_absence' | 'mock_absence', AbsenceInput[] | undefined]> = [
    ['ot_absence', input.otAbsences],
    ['mock_absence', input.mockAbsences],
  ];
  for (const [source, list] of absencePairs) {
    for (const e of list || []) {
      if (e.status !== 'absent_requested' && e.status !== 'absent') continue;
      const at = e.updatedAt || '';
      events.push({
        id: `${source}:${e.eventId}:head`, at, side: 'student', kind: 'card', source,
        raw: e, needsAction: e.status === 'absent_requested',
      });
      if (e.status === 'absent') {
        events.push(statusEvent(source, e.eventId, 'approved', at, '불참 승인'));
      }
    }
  }

  // 6) 쿠폰 교환
  for (const rwd of input.rewardRedemptions || []) {
    events.push({
      id: `reward:${rwd.id}:head`, at: rwd.createdAt || '', side: 'student', kind: 'card', source: 'reward',
      raw: rwd, needsAction: rwd.status === 'requested' || rwd.status === 'pending',
    });
    if (rwd.status !== 'requested' && rwd.approvedAt) {
      events.push(statusEvent('reward', rwd.id, 'coupon_deducted', rwd.approvedAt, '교환 승인 · 쿠폰 차감'));
    }
    if (rwd.status === 'fulfilled') {
      events.push(statusEvent('reward', rwd.id, 'fulfilled', rwd.fulfilledAt || rwd.approvedAt || rwd.createdAt || '', '리워드 지급 완료'));
    } else if (rwd.status === 'rejected') {
      // 반려 시각 필드가 없어 신청 시각 직후로 붙인다(순서 안정).
      events.push(statusEvent('reward', rwd.id, 'rejected', rwd.approvedAt || rwd.createdAt || '', '교환 반려'));
    }
  }

  // 7) 도시락 마감 후 추가 신청 (호출측 평탄화)
  for (const m of input.mealAdds || []) {
    events.push({
      id: `meal_add:${m.id}:head`, at: m.createdAt || '', side: 'student', kind: 'card', source: 'meal_add',
      raw: m, needsAction: m.status === 'pending',
    });
    if (m.status !== 'pending') {
      events.push(statusEvent('meal_add', m.id, m.status, m.createdAt || '',
        m.status === 'approved' ? '도시락 추가 승인' : '도시락 추가 반려'));
    }
  }

  // 8) 자리이동
  for (const s of input.seatMoves || []) {
    events.push({
      id: `seat_move:${s.id}:head`, at: s.createdAt || '', side: 'student', kind: 'card', source: 'seat_move',
      raw: s, needsAction: s.status === 'pending',
    });
    if (s.status !== 'pending' && s.processedAt) {
      events.push(statusEvent('seat_move', s.id, s.status, s.processedAt,
        s.status === 'approved' ? '자리이동 승인' : `자리이동 반려${s.rejectReason ? ` — ${s.rejectReason}` : ''}`));
    }
  }

  // 9) 상담 예약 — 처리 로직은 전용 화면에 두고, 대화에는 흐름만 남긴다.
  for (const b of input.consultationBookings || []) {
    events.push({
      id: `consultation:${b.id}:head`, at: b.createdAt || '', side: b.source === 'admin' ? 'admin' : 'student',
      kind: 'card', source: 'consultation', raw: b,
      needsAction: b.status === 'booked' && ((b.kind === 'extra' && !b.resolvedAt && !b.slot) || b.reschedule?.by === 'student'),
    });
    if (b.adminReply) {
      events.push({
        id: `consultation:${b.id}:reply`, at: b.resolvedAt || b.cancelledAt || b.createdAt || '',
        side: 'admin', kind: 'message', source: 'consultation', text: b.adminReply,
      });
    }
    if (b.status === 'cancelled' && b.cancelledAt) {
      events.push(statusEvent('consultation', b.id, 'cancelled', b.cancelledAt, '상담 예약 취소'));
    } else if ((b.status === 'done' || b.status === 'noshow') && b.resolvedAt) {
      events.push(statusEvent('consultation', b.id, b.status, b.resolvedAt,
        b.status === 'done' ? '상담 완료' : '상담 노쇼'));
    }
  }

  // 10) 자유채팅 — head 없이 thread 메시지만 흐른다.
  if (input.chatLog?.thread?.length) {
    events.push(...threadMessages('chat', input.chatLog.id || 'chat_main', { thread: input.chatLog.thread }));
  }

  return events.sort((a, b) => a.at.localeCompare(b.at));
}

// 대화방 정렬키 — 마지막 이벤트 시각(없으면 '').
export function lastActivityAt(events: TimelineEvent[]): string {
  let max = '';
  for (const e of events) if (e.at > max) max = e.at;
  return max;
}

// viewer 기준 안읽음 수 — readAt 이후 상대측 이벤트(card/message/status 모두).
export function unreadCountFor(events: TimelineEvent[], viewer: 'student' | 'admin', readAt?: string): number {
  const cutoff = readAt || '';
  let count = 0;
  for (const e of events) {
    if (e.side === viewer) continue;
    if (e.at && e.at > cutoff) count++;
  }
  return count;
}

// 관리자 미처리 건수 — card 이벤트의 needsAction 합.
export function needsActionCount(events: TimelineEvent[]): number {
  let count = 0;
  for (const e of events) if (e.kind === 'card' && e.needsAction) count++;
  return count;
}

// 관리자 미답 자유채팅 여부 — 채팅 로그 마지막 메시지가 학생이면 true.
export function chatAwaitingAdmin(chatLog?: ConsultationLog | null): boolean {
  return awaitingAdminReply(chatLog?.thread);
}
