'use client';

// 메신저형 인박스 — 좌측 학생별 대화목록 + 우측 채팅 타임라인. 학생의 모든 신청/건의가
// 시간순 액션 카드로 흐르고, 카드 안에서 바로 답변/승인/반려/폼입력을 처리한다.
// 데이터/핸들러/오버라이드 state 는 인박스 페이지가 소유(리스트 뷰와 공유) — 여기는 표현 계층.
import React, { useEffect, useRef, useState } from 'react';
import {
  Inbox, MessageSquare, Send, Loader2, Check, X, Clock, CheckCircle2, XCircle,
  User, UserPlus, ArrowLeft, Armchair, CalendarClock, Ticket, GraduationCap, Calendar, Utensils, Users, CornerDownRight,
} from 'lucide-react';
import type { Student, ConsultationLog, LeaveRequest, RewardRedemption, SeatMoveRequest, ConsultationBooking } from '@/lib/types/student';
import type { TimelineEvent } from '@/lib/chat-timeline';
import type { InboxItem, ConversationSummary } from './inbox-types';
import { ApprovalForms } from './approval-forms';
import { formatLeaveLabel, getRewardLabel } from '@/lib/leave';
import { getRequestTypeLabel } from '@/lib/student-requests';

const SOURCE_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  leave: { label: '휴가·반차', icon: Calendar },
  request: { label: '학습 변경', icon: GraduationCap },
  suggestion: { label: '건의', icon: MessageSquare },
  reward: { label: '쿠폰 교환', icon: Ticket },
  seat_move: { label: '자리이동', icon: Armchair },
  consultation: { label: '상담 예약', icon: CalendarClock },
  ot_absence: { label: 'OT 불참', icon: Users },
  mock_absence: { label: '모의고사 불참', icon: Users },
  meal_add: { label: '도시락 추가', icon: Utensils },
  chat: { label: '채팅', icon: MessageSquare },
};

// 카드 이벤트 표시 정보 — raw 만으로 파생(처리 완료된 항목은 inboxItems 에 없으므로).
export function adminCardInfo(e: TimelineEvent): { title: string; body: string; status?: string } {
  const raw = e.raw as any;
  switch (e.source) {
    case 'leave': {
      const r = raw as LeaveRequest;
      return { title: `${formatLeaveLabel(r.type, r.slot)} · ${r.date}`, body: r.reason || '(사유 없음)', status: r.status };
    }
    case 'request': {
      const r = raw as ConsultationLog;
      return { title: getRequestTypeLabel(r.requestType), body: r.content || '(내용 없음)', status: r.status || 'pending' };
    }
    case 'suggestion': {
      const r = raw as ConsultationLog;
      return { title: '건의사항', body: r.content || '(내용 없음)', status: r.status || 'pending' };
    }
    case 'reward': {
      const r = raw as RewardRedemption;
      return {
        title: `쿠폰 교환 · ${getRewardLabel(r.type)} (쿠폰 ${r.cost}장)`,
        body: r.status === 'pending' ? '승인됨 · 물품 지급 대기' : r.status === 'requested' ? '승인 시 쿠폰 차감' : '',
        status: r.status === 'requested' ? 'pending' : r.status,
      };
    }
    case 'seat_move': {
      const r = raw as SeatMoveRequest;
      return { title: `자리이동 · ${r.fromSeat != null ? `${r.fromSeat}번` : '미배정'} → ${r.toSeat}번`, body: '', status: r.status };
    }
    case 'consultation': {
      const b = raw as ConsultationBooking;
      return {
        title: `상담 예약${b.kind === 'extra' ? ' (추가 신청)' : ''} · ${b.date || '날짜 미정'}${b.slot ? ` ${b.slot}` : ''}`,
        body: `담당 ${b.counselor}${b.reason ? `\n${b.reason}` : ''}`,
        status: b.status === 'booked' ? 'pending' : b.status,
      };
    }
    case 'ot_absence':
    case 'mock_absence':
      return {
        title: `${e.source === 'ot_absence' ? 'OT' : '모의고사'} 불참 신청${raw?.eventName ? ` · ${raw.eventName}` : ''}`,
        body: raw?.reason || '(사유 없음)',
        status: raw?.status === 'absent' ? 'approved' : 'pending',
      };
    case 'meal_add':
      return { title: `도시락 추가${raw?.label ? ` · ${raw.label}` : ''}`, body: raw?.reason || '(사유 없음)', status: raw?.status };
    default:
      return { title: '항목', body: '' };
  }
}

// 대화목록 미리보기 문구 — 마지막 이벤트를 한 줄로.
export function eventPreview(e: TimelineEvent): string {
  if (e.kind === 'message') return `${e.side === 'admin' ? '나: ' : ''}${e.text || ''}`;
  if (e.kind === 'status') return e.text || '';
  const info = adminCardInfo(e);
  return `[${SOURCE_META[e.source]?.label || '신청'}] ${info.title}`;
}

function statusBadge(status?: string) {
  if (status === 'approved' || status === 'resolved' || status === 'fulfilled' || status === 'done') {
    return (
      <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-black text-emerald-700 dark:bg-emerald-500/15 dark:border-emerald-500/25 dark:text-emerald-300">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" /> 완료
      </span>
    );
  }
  if (status === 'rejected' || status === 'cancelled' || status === 'noshow') {
    return (
      <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[10px] font-black text-red-600 dark:bg-red-500/15 dark:border-red-500/25 dark:text-red-400">
        <span className="h-1.5 w-1.5 rounded-full bg-red-600" /> 반려/취소
      </span>
    );
  }
  return (
    <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-black text-amber-700 dark:bg-amber-500/15 dark:border-amber-500/25 dark:text-amber-300">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" /> 접수중
    </span>
  );
}

// 날짜 칩 그룹핑 키 — ISO(UTC)를 그대로 자르면 KST 자정~09시 메시지가 전날로 묶인다. KST 변환 필수.
const dateKeyOf = (at: string) => {
  if (!at) return '';
  if (at.length <= 10) return at; // date-only(YYYY-MM-DD)는 이미 KST 기준
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return at.slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(date);
};

const formatTime = (at: string) => {
  if (!at || at.length < 16) return '';
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ko-KR', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Seoul' }).format(date);
};

const formatListTime = (at: string) => {
  if (!at) return '';
  const dateKey = dateKeyOf(at);
  const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
  return dateKey === todayKey ? formatTime(at) : dateKey.slice(5).replace('-', '/');
};

export interface ChatViewProps {
  students: Student[];
  conversations: ConversationSummary[];
  timelines: Map<string, TimelineEvent[]>;
  selectedStudentId: string | null;
  onSelectStudent: (id: string | null) => void;
  signupCount: number;
  onOpenSignups: () => void;
  onOpenStudent: (studentId: string) => void;
  getCampusLabel: (campus: string) => string;
  findInboxItem: (studentId: string, e: TimelineEvent) => InboxItem | undefined;
  processing: boolean;
  onProcessItem: (item: InboxItem, status: 'approved' | 'rejected' | 'resolved' | 'pending', reply?: string) => Promise<void>;
  onReplyItem: (item: InboxItem, reply: string) => Promise<void>;
  onSendChat: (studentId: string, text: string) => Promise<boolean>;
  chatSending: boolean;
  onGoRewards: () => void;
  // 자리이동 인라인 승인/거절 + 상담 예약 전용 화면 딥링크(reschedule 이 슬롯 점유와 얽혀 재구현 대신 링크)
  onProcessSeatMove: (request: SeatMoveRequest, approve: boolean) => Promise<void>;
  onOpenConsultations: () => void;
  loading: boolean;
  // 승인폼 오버라이드 — 페이지 소유 state (리스트 뷰와 공유, 뷰 전환에도 값 유지)
  planStartDateOverrides: Record<string, string>;
  setPlanStartDateOverride: (itemId: string, v: string) => void;
  deadlinePolicies: Record<string, 'keep-deadline' | 'keep-duration'>;
  setDeadlinePolicy: (itemId: string, v: 'keep-deadline' | 'keep-duration') => void;
  regenerateChecks: Record<string, boolean>;
  setRegenerateCheck: (itemId: string, v: boolean) => void;
}

export function ChatView(props: ChatViewProps) {
  const {
    students, conversations, timelines, selectedStudentId, onSelectStudent,
    signupCount, onOpenSignups, onOpenStudent, getCampusLabel,
  } = props;

  const selectedStudent = selectedStudentId ? students.find((s) => s.id === selectedStudentId) : undefined;
  const events = selectedStudentId ? timelines.get(selectedStudentId) || [] : [];

  return (
    <div className="grid grid-cols-1 md:grid-cols-[320px_minmax(0,1fr)] gap-4 items-start">
      {/* 좌측: 대화목록 (모바일에선 방 선택 시 숨김) */}
      <div className={`space-y-2 ${selectedStudentId ? 'hidden md:block' : ''}`}>
        {/* 가입신청 배너 — 학생 레코드가 없어 채팅방 불가, 전용 페이지로 */}
        {signupCount > 0 && (
          <button
            type="button"
            onClick={onOpenSignups}
            className="w-full flex items-center gap-2.5 rounded-2xl border border-[#0071E3]/25 bg-[#0071E3]/[0.05] dark:bg-[#0071E3]/15 px-3.5 py-3 text-left transition hover:bg-[#0071E3]/[0.09] active:scale-[0.99]"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#0071E3]/10 text-[#0071E3]">
              <UserPlus className="h-4.5 w-4.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-black text-slate-800 dark:text-slate-200">신규 가입신청 {signupCount}건</span>
              <span className="block text-[10px] font-bold text-slate-400 dark:text-slate-500">가입승인 페이지에서 처리</span>
            </span>
            <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-[#0071E3] px-1.5 text-[10px] font-black text-white">{signupCount}</span>
          </button>
        )}

        <div className="max-h-[72vh] space-y-1.5 overflow-y-auto pr-1">
          {conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-3xl border border-slate-100 dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-10 text-center">
              <Inbox className="h-7 w-7 text-slate-300 dark:text-slate-600" />
              <p className="text-xs font-bold text-slate-400">대화 내역 없음</p>
            </div>
          ) : (
            conversations.map((c) => {
              const active = c.studentId === selectedStudentId;
              return (
                <button
                  key={c.studentId}
                  type="button"
                  onClick={() => onSelectStudent(c.studentId)}
                  className={`w-full flex items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left transition active:scale-[0.99] ${
                    active
                      ? 'border-[#0071E3] bg-[#0071E3]/[0.04] dark:bg-[#0071E3]/15 ring-2 ring-[#0071E3]/15'
                      : 'border-slate-100 dark:border-white/10 bg-white dark:bg-[#1c1c1e] hover:border-slate-200 dark:hover:border-white/20'
                  }`}
                >
                  <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 dark:bg-white/10 text-xs font-black text-slate-500 dark:text-slate-300">
                    {c.studentName.slice(0, 2)}
                    {c.unread && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[#0071E3] ring-2 ring-white dark:ring-[#1c1c1e]" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-black text-slate-800 dark:text-slate-200">{c.studentName}</span>
                      <span className="shrink-0 rounded-md border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/10 px-1 py-px text-[9px] font-bold text-slate-500 dark:text-slate-400">
                        {getCampusLabel(c.campus)}
                      </span>
                    </span>
                    <span className="block truncate text-[10px] font-semibold text-slate-400 dark:text-slate-500">{c.lastPreview}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-[9px] font-bold text-slate-300 dark:text-slate-600">{formatListTime(c.lastActivityAt)}</span>
                    {c.needsActionCount > 0 && (
                      <span className="grid h-4.5 min-w-4.5 place-items-center rounded-full bg-amber-500 px-1.5 text-[10px] font-black text-white">
                        {c.needsActionCount}
                      </span>
                    )}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* 우측: 채팅방 */}
      <div className={selectedStudentId ? '' : 'hidden md:block'}>
        {selectedStudent ? (
          <ChatRoom key={selectedStudent.id} {...props} student={selectedStudent} events={events} />
        ) : (
          <div className="flex h-[60vh] flex-col items-center justify-center gap-2.5 rounded-3xl border border-dashed border-slate-200 dark:border-white/10 bg-white/60 dark:bg-white/5 text-center">
            <MessageSquare className="h-7 w-7 text-slate-300 dark:text-slate-600" />
            <p className="text-xs font-bold text-slate-400">좌측 목록에서 학생 선택</p>
            <p className="text-[10px] font-semibold text-slate-300 dark:text-slate-600">신청·건의가 대화로 표시되고, 카드에서 바로 처리 가능</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 채팅방 (선택 학생 1명) ──────────────────────────────────────────────────

function ChatRoom(props: ChatViewProps & { student: Student; events: TimelineEvent[] }) {
  const {
    student, events, onSelectStudent, onOpenStudent, getCampusLabel,
    findInboxItem, processing, onProcessItem, onReplyItem, onSendChat, chatSending, onGoRewards,
  } = props;
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // 새 이벤트 도착/방 진입 시 맨 아래로.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events.length]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || chatSending) return;
    const ok = await onSendChat(student.id, text);
    if (ok) setDraft('');
  };

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-100 dark:border-white/10 bg-white dark:bg-[#1c1c1e] shadow-sm">
      {/* 방 헤더 */}
      <div className="flex items-center gap-2.5 border-b border-slate-100 dark:border-white/10 px-4 py-3">
        <button
          type="button"
          onClick={() => onSelectStudent(null)}
          className="md:hidden grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400"
          aria-label="대화목록으로"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 dark:bg-white/10 text-xs font-black text-slate-500 dark:text-slate-300">
          {student.name.slice(0, 2)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-black text-slate-900 dark:text-slate-100">{student.name}</span>
          <span className="block text-[10px] font-bold text-slate-400 dark:text-slate-500">{getCampusLabel(student.campus)} · 신청·건의 통합 대화</span>
        </span>
        <button
          type="button"
          onClick={() => onOpenStudent(student.id)}
          className="flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-2.5 py-1.5 text-[10px] font-bold text-slate-600 dark:text-slate-300 transition hover:bg-slate-100 dark:hover:bg-white/10 active:scale-[0.97]"
        >
          <User className="h-3.5 w-3.5 text-[#0071E3]" /> 원생 상세
        </button>
      </div>

      {/* 타임라인 */}
      <div ref={scrollRef} className="max-h-[58vh] min-h-[300px] space-y-2.5 overflow-y-auto overscroll-contain p-4">
        {events.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-center">
            <MessageSquare className="h-6 w-6 text-slate-300 dark:text-slate-600" />
            <p className="text-[11px] font-bold text-slate-400">대화 내역 없음 — 아래 입력창으로 첫 메시지 전송 가능</p>
          </div>
        ) : (
          events.map((e, idx) => {
            const prev = events[idx - 1];
            const showDateChip = !prev || dateKeyOf(prev.at) !== dateKeyOf(e.at);
            return (
              <React.Fragment key={e.id}>
                {showDateChip && dateKeyOf(e.at) && (
                  <div className="flex justify-center py-1">
                    <span className="rounded-full bg-slate-100 dark:bg-white/10 px-3 py-1 text-[10px] font-bold text-slate-400 dark:text-slate-500">
                      {dateKeyOf(e.at)}
                    </span>
                  </div>
                )}
                {e.kind === 'status' ? (
                  <div className="flex justify-center">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-100 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-3 py-1 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                      {e.statusKind === 'rejected' || e.statusKind === 'cancelled' || e.statusKind === 'noshow'
                        ? <XCircle className="h-3 w-3 text-red-500" />
                        : <CheckCircle2 className="h-3 w-3 text-emerald-600" />}
                      {e.text}
                      <span className="text-slate-300 dark:text-slate-600">{formatTime(e.at)}</span>
                    </span>
                  </div>
                ) : e.kind === 'message' ? (
                  <MessageBubble event={e} />
                ) : (
                  <AdminActionCard {...props} event={e} item={findInboxItem(student.id, e)} />
                )}
              </React.Fragment>
            );
          })
        )}
      </div>

      {/* 자유채팅 입력 — 항상 채팅 전송(카드별 답변은 카드 안 미니 입력) */}
      <div className="border-t border-slate-100 dark:border-white/10 bg-slate-50/60 dark:bg-white/[0.03] p-3">
        <div className="flex items-end gap-2 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-2 focus-within:border-[#0071E3] focus-within:ring-2 focus-within:ring-[#0071E3]/15">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={`${student.name} 학생에게 메시지 전송`}
            rows={1}
            className="max-h-28 min-h-[38px] flex-1 resize-none border-0 bg-transparent px-1.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!draft.trim() || chatSending}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0071E3] text-white shadow-sm transition hover:bg-[#0077ED] active:scale-[0.96] disabled:bg-slate-200 dark:disabled:bg-white/10 disabled:text-slate-400 dark:disabled:text-slate-500"
            aria-label="메시지 전송"
          >
            {chatSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
        <p className="mt-1.5 px-1 text-[9px] font-bold text-slate-400 dark:text-slate-500">Enter 전송 · Shift+Enter 줄바꿈 · 승인/반려는 카드 버튼으로 처리</p>
      </div>
    </div>
  );
}

function MessageBubble({ event }: { event: TimelineEvent }) {
  const mine = event.side === 'admin'; // 관리자 화면: 관리자=오른쪽
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-xs font-semibold whitespace-pre-wrap break-words shadow-sm ${
        mine
          ? 'bg-[#0071E3] text-white rounded-br-md'
          : 'bg-slate-100 dark:bg-white/10 border border-slate-200/60 dark:border-white/10 text-slate-700 dark:text-slate-200 rounded-bl-md'
      }`}>
        {!mine && (
          <span className="mb-0.5 block text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">학생</span>
        )}
        {mine && event.author && (
          <span className="mb-0.5 block text-[9px] font-black uppercase tracking-wider text-white/60">{event.author}</span>
        )}
        {event.text}
        <span className={`mt-1 block text-right text-[9px] font-bold ${mine ? 'text-white/60' : 'text-slate-400 dark:text-slate-500'}`}>
          {formatTime(event.at)}
        </span>
      </div>
    </div>
  );
}

// ── 액션 카드 — 신청 원본 + 승인폼 + 처리 버튼 + 카드별 답변 미니 입력 ──────────

function AdminActionCard(props: ChatViewProps & { event: TimelineEvent; item?: InboxItem }) {
  const {
    event, item, processing, onProcessItem, onReplyItem, onGoRewards,
    planStartDateOverrides, setPlanStartDateOverride,
    deadlinePolicies, setDeadlinePolicy,
    regenerateChecks, setRegenerateCheck,
    students,
  } = props;
  const { onProcessSeatMove, onOpenConsultations } = props;
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replySending, setReplySending] = useState(false);

  const info = adminCardInfo(event);
  const Icon = SOURCE_META[event.source]?.icon || MessageSquare;
  const raw = event.raw as any;
  const canReply = item && (item.type === 'leave' || item.type === 'request' || item.type === 'suggestion');
  const actionable = item && item.needsAction;
  const student = students.find((s) => item && s.id === item.studentId);
  const isPendingSeatMove = event.source === 'seat_move' && raw?.status === 'pending';
  const isActionableConsultation = event.source === 'consultation' && event.needsAction;

  const handleReply = async () => {
    const text = replyText.trim();
    if (!item || !text || replySending) return;
    setReplySending(true);
    try {
      await onReplyItem(item, text);
      setReplyText('');
      setReplyOpen(false);
    } finally {
      setReplySending(false);
    }
  };

  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[92%] rounded-2xl rounded-bl-md border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.04] p-3.5 shadow-sm space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex min-w-0 items-center gap-1.5 text-[10px] font-black text-slate-500 dark:text-slate-400">
            <Icon className="h-3.5 w-3.5 shrink-0 text-[#0071E3]" />
            <span className="truncate uppercase tracking-wider">{SOURCE_META[event.source]?.label || '신청'}</span>
            <span className="text-slate-300 dark:text-slate-600 normal-case tracking-normal">{formatTime(event.at)}</span>
          </span>
          {statusBadge(info.status)}
        </div>
        <p className="text-xs font-black text-slate-800 dark:text-slate-200 break-keep">{info.title}</p>
        {info.body && (
          <p className="whitespace-pre-wrap break-words rounded-xl border border-slate-100/70 dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-2.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            {info.body}
          </p>
        )}

        {/* 학습변경 신청 승인폼(계획/자료추가/수정/삭제/진도정정) — 리스트 뷰와 동일 컴포넌트·공유 오버라이드 */}
        {item && item.type === 'request' && actionable && (
          <ApprovalForms
            raw={item.rawItem}
            student={student}
            planStartDateOverride={planStartDateOverrides[item.id]}
            onPlanStartDateChange={(v) => setPlanStartDateOverride(item.id, v)}
            deadlinePolicy={deadlinePolicies[item.id]}
            onDeadlinePolicyChange={(v) => setDeadlinePolicy(item.id, v)}
            regenerate={regenerateChecks[item.id]}
            onRegenerateChange={(v) => setRegenerateCheck(item.id, v)}
          />
        )}

        {/* 처리 버튼 매트릭스 — 리스트 뷰 상세 패널과 동일 동작 */}
        {actionable && item && (
          <div className="space-y-1.5">
            {item.type === 'reward' ? (
              item.rawItem?.status === 'requested' ? (
                <div className="grid grid-cols-2 gap-1.5">
                  <CardButton tone="emerald" disabled={processing} onClick={() => onProcessItem(item, 'approved')}>
                    <Check className="h-3.5 w-3.5" /> 승인 (쿠폰 차감)
                  </CardButton>
                  <CardButton tone="red" disabled={processing} onClick={() => onProcessItem(item, 'rejected')}>
                    <X className="h-3.5 w-3.5" /> 반려
                  </CardButton>
                </div>
              ) : (
                <CardButton tone="blue" onClick={onGoRewards}>
                  <Ticket className="h-3.5 w-3.5" /> 쿠폰 관리 지급내역에서 처리
                </CardButton>
              )
            ) : item.type === 'meal_add' ? (
              <div className="grid grid-cols-2 gap-1.5">
                <CardButton tone="emerald" disabled={processing} onClick={() => onProcessItem(item, 'approved')}>
                  <Check className="h-3.5 w-3.5" /> 추가 승인 (표 반영)
                </CardButton>
                <CardButton tone="red" disabled={processing} onClick={() => onProcessItem(item, 'rejected')}>
                  <X className="h-3.5 w-3.5" /> 반려
                </CardButton>
              </div>
            ) : item.type === 'ot_absence' || item.type === 'mock_absence' ? (
              <div className="grid grid-cols-2 gap-1.5">
                <CardButton tone="red" disabled={processing} onClick={() => onProcessItem(item, 'approved')}>
                  <Check className="h-3.5 w-3.5" /> 불참 승인
                </CardButton>
                <CardButton tone="plain" disabled={processing} onClick={() => onProcessItem(item, 'rejected')}>
                  <X className="h-3.5 w-3.5" /> 반려(참석 요청)
                </CardButton>
              </div>
            ) : item.type === 'leave' ? (
              <div className="grid grid-cols-2 gap-1.5">
                <CardButton tone="emerald" disabled={processing} onClick={() => onProcessItem(item, 'approved')}>
                  <Check className="h-3.5 w-3.5" /> 승인 처리
                </CardButton>
                <CardButton tone="red" disabled={processing} onClick={() => onProcessItem(item, 'rejected')}>
                  <X className="h-3.5 w-3.5" /> 반려 처리
                </CardButton>
              </div>
            ) : item.type === 'request' || item.type === 'suggestion' ? (
              <div className="grid grid-cols-2 gap-1.5">
                <CardButton
                  tone={item.rawItem?.proposedMaterialDelete ? 'red' : 'emerald'}
                  disabled={processing}
                  onClick={() => onProcessItem(item, 'resolved')}
                >
                  <Check className="h-3.5 w-3.5" />
                  {item.rawItem?.proposedMaterialDelete ? '승인 및 삭제'
                    : item.rawItem?.proposedMaterialEdit ? '승인 및 수정 반영'
                    : item.rawItem?.proposedMaterial ? '승인 및 자료 생성'
                    : item.rawItem?.proposedGoal ? '승인 및 계획 반영'
                    : item.rawItem?.proposedProgressCorrection ? '승인 및 진도 정정'
                    : '해결/처리 완료'}
                </CardButton>
                <CardButton tone="blue" disabled={processing} onClick={() => onProcessItem(item, 'pending')}>
                  <Clock className="h-3.5 w-3.5" /> 확인했어요
                </CardButton>
              </div>
            ) : null}
          </div>
        )}

        {/* 자리이동 — 인박스 항목이 아닌 별도 원장이라 전용 인라인 처리 */}
        {isPendingSeatMove && (
          <div className="grid grid-cols-2 gap-1.5">
            <CardButton tone="emerald" disabled={processing} onClick={() => onProcessSeatMove(raw as SeatMoveRequest, true)}>
              <Check className="h-3.5 w-3.5" /> 승인 (좌석 이동)
            </CardButton>
            <CardButton tone="red" disabled={processing} onClick={() => onProcessSeatMove(raw as SeatMoveRequest, false)}>
              <X className="h-3.5 w-3.5" /> 거절
            </CardButton>
          </div>
        )}

        {/* 상담 예약 — 슬롯 점유/시간 변경이 얽혀 있어 전용 화면에서 처리 */}
        {isActionableConsultation && (
          <CardButton tone="blue" onClick={onOpenConsultations}>
            <CalendarClock className="h-3.5 w-3.5" /> 상담 예약 관리에서 처리
          </CardButton>
        )}

        {/* 카드별 답변 — 이 신청의 스레드에 append(자유채팅과 별개) */}
        {canReply && item && (
          replyOpen ? (
            <div className="flex items-end gap-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-1.5 focus-within:border-[#0071E3]">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    handleReply();
                  }
                }}
                placeholder="이 신청에 대한 답변"
                rows={1}
                autoFocus
                className="max-h-20 min-h-[32px] flex-1 resize-none border-0 bg-transparent px-1.5 py-1 text-[11px] font-semibold text-slate-800 dark:text-slate-200 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleReply}
                disabled={!replyText.trim() || replySending}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#0071E3] text-white disabled:bg-slate-200 dark:disabled:bg-white/10 disabled:text-slate-400"
                aria-label="답변 전송"
              >
                {replySending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setReplyOpen(true)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2 py-1 text-[10px] font-bold text-slate-500 dark:text-slate-400 transition hover:border-[#0071E3]/40 hover:text-[#0071E3] active:scale-[0.97]"
            >
              <CornerDownRight className="h-3 w-3" /> 이 건에 답변
            </button>
          )
        )}
      </div>
    </div>
  );
}

function CardButton({ tone, disabled, onClick, children }: {
  tone: 'emerald' | 'red' | 'blue' | 'plain';
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const toneClass =
    tone === 'emerald' ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
    : tone === 'red' ? 'bg-red-600 hover:bg-red-700 text-white'
    : tone === 'blue' ? 'bg-[#0071E3] hover:bg-[#0077ED] text-white'
    : 'border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] hover:bg-slate-50 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300';
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex w-full items-center justify-center gap-1 rounded-xl px-2.5 py-2 text-[11px] font-bold shadow-sm transition active:scale-[0.98] disabled:opacity-50 ${toneClass}`}
    >
      {children}
    </button>
  );
}
