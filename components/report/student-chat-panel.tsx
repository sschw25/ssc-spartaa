'use client';

// 학생 채팅방 — 내 신청/건의/휴가/쿠폰/자리이동/상담이 카드로 흐르고, 승인/반려/답변이
// 말풍선으로 이어지는 연속 대화 스트림 + 자유 메시지 입력. 관리자 메신저 인박스와
// lib/chat-timeline 의 같은 타임라인을 공유한다(양쪽이 같은 대화를 본다).
import React, { useEffect, useRef, useState } from 'react';
import { MessageSquare, Send, Loader2, Trash2, CheckCircle2, XCircle, Armchair, CalendarClock, Ticket, GraduationCap, Calendar, Utensils, Users } from 'lucide-react';
import type { ConsultationLog, LeaveRequest, RewardRedemption, SeatMoveRequest, ConsultationBooking } from '@/lib/types/student';
import type { TimelineEvent } from '@/lib/chat-timeline';
import { formatLeaveLabel, getRewardLabel } from '@/lib/leave';
import { getRequestTypeLabel } from '@/lib/student-requests';

interface StudentChatPanelProps {
  events: TimelineEvent[];
  active: boolean;                    // 채팅 서브탭 표시 여부 — 폴링/읽음 처리 게이트
  chatUnreadCount: number;
  chatSending: boolean;
  sendChatMessage: (text: string) => Promise<boolean>;
  markChatRead: () => void;
  refreshCore: () => void | Promise<void>;
  cancelSuggestion: (id: string) => Promise<void>;
  cancelLeave: (id: string) => Promise<void>;
  cancelRequest: (id: string) => Promise<void>;
}

const SOURCE_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  leave: { label: '휴가·반차', icon: Calendar },
  request: { label: '학습 신청', icon: GraduationCap },
  suggestion: { label: '건의사항', icon: MessageSquare },
  reward: { label: '쿠폰 교환', icon: Ticket },
  seat_move: { label: '자리이동', icon: Armchair },
  consultation: { label: '상담 예약', icon: CalendarClock },
  ot_absence: { label: 'OT 불참', icon: Users },
  mock_absence: { label: '모의고사 불참', icon: Users },
  meal_add: { label: '도시락 추가', icon: Utensils },
};

// 학생 어투 상태 문구 — 타임라인 status 이벤트의 기본 문구를 ~요체로 교체.
const STATUS_TEXT_KO: Record<string, string> = {
  approved: '승인됐어요',
  rejected: '반려됐어요',
  resolved: '처리 완료됐어요',
  coupon_deducted: '교환이 승인돼 쿠폰이 차감됐어요',
  fulfilled: '리워드가 지급됐어요',
  cancelled: '취소됐어요',
  done: '상담이 완료됐어요',
  noshow: '상담에 참석하지 못한 것으로 기록됐어요',
};

function statusBadge(status?: string) {
  if (status === 'approved' || status === 'resolved' || status === 'fulfilled' || status === 'done') {
    return (
      <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-white/10 px-2 py-0.5 text-[10px] font-black text-emerald-700 dark:text-emerald-300">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" /> 완료
      </span>
    );
  }
  if (status === 'rejected' || status === 'cancelled' || status === 'noshow') {
    return (
      <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-white/10 px-2 py-0.5 text-[10px] font-black text-red-600">
        <span className="h-1.5 w-1.5 rounded-full bg-red-600" /> 반려/취소
      </span>
    );
  }
  return (
    <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-white/10 px-2 py-0.5 text-[10px] font-black text-amber-700">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" /> 확인 중
    </span>
  );
}

// 카드 이벤트의 표시 정보(제목·본문·상태·취소 가능 여부)를 소스별로 뽑는다.
function cardInfo(e: TimelineEvent): { title: string; body: string; status?: string; cancelable?: 'suggestion' | 'leave' | 'request'; cancelId?: string } {
  const raw = e.raw as any;
  switch (e.source) {
    case 'leave': {
      const r = raw as LeaveRequest;
      return {
        title: `${formatLeaveLabel(r.type, r.slot)} · ${r.date}`,
        body: r.reason || '(사유 없음)',
        status: r.status,
        ...(r.status === 'pending' ? { cancelable: 'leave' as const, cancelId: r.id } : {}),
      };
    }
    case 'request': {
      const r = raw as ConsultationLog;
      return {
        title: getRequestTypeLabel(r.requestType),
        body: r.content || '(내용 없음)',
        status: r.status || 'pending',
        ...((r.status || 'pending') === 'pending' ? { cancelable: 'request' as const, cancelId: r.id } : {}),
      };
    }
    case 'suggestion': {
      const r = raw as ConsultationLog;
      return {
        title: '건의사항',
        body: r.content || '(내용 없음)',
        status: r.status || 'pending',
        ...((r.status || 'pending') === 'pending' ? { cancelable: 'suggestion' as const, cancelId: r.id } : {}),
      };
    }
    case 'reward': {
      const r = raw as RewardRedemption;
      return {
        title: `쿠폰 교환 · ${getRewardLabel(r.type)}`,
        body: `쿠폰 ${r.cost}장으로 교환을 신청했어요.`,
        status: r.status === 'requested' ? 'pending' : r.status,
      };
    }
    case 'seat_move': {
      const r = raw as SeatMoveRequest;
      return {
        title: '자리이동 신청',
        body: `${r.fromSeat != null ? `${r.fromSeat}번` : '미배정'} → ${r.toSeat}번 자리로 신청했어요.`,
        status: r.status,
      };
    }
    case 'consultation': {
      const b = raw as ConsultationBooking;
      return {
        title: `상담 예약${b.kind === 'extra' ? ' (추가 신청)' : ''}`,
        body: `${b.date || '날짜 협의'}${b.slot ? ` ${b.slot}` : ''} · 담당 ${b.counselor}${b.reason ? `\n${b.reason}` : ''}`,
        status: b.status === 'booked' ? 'pending' : b.status,
      };
    }
    case 'ot_absence':
    case 'mock_absence':
      return {
        title: e.source === 'ot_absence' ? `OT 불참 신청${raw?.eventName ? ` · ${raw.eventName}` : ''}` : `모의고사 불참 신청${raw?.eventName ? ` · ${raw.eventName}` : ''}`,
        body: raw?.reason || '(사유 없음)',
        status: raw?.status === 'absent' ? 'approved' : 'pending',
      };
    case 'meal_add':
      return {
        title: `도시락 추가 신청${raw?.label ? ` · ${raw.label}` : ''}`,
        body: raw?.reason || '(사유 없음)',
        status: raw?.status,
      };
    default:
      return { title: '신청', body: '' };
  }
}

// 날짜 칩 그룹핑 키 — ISO(UTC)를 그대로 자르면 KST 자정~09시 메시지가 전날로 묶인다. KST 변환 필수.
const dateKeyOf = (at: string) => {
  if (!at) return '';
  if (at.length <= 10) return at; // date-only(YYYY-MM-DD)는 이미 KST 기준
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return at.slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(date);
};

function formatDateChip(dateKey: string): string {
  if (!dateKey) return '';
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!y || !m || !d) return dateKey;
  const date = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }).format(date);
}

const formatTime = (at: string) => {
  if (!at || at.length < 16) return '';
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ko-KR', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Seoul' }).format(date);
};

export function StudentChatPanel({
  events,
  active,
  chatUnreadCount,
  chatSending,
  sendChatMessage,
  markChatRead,
  refreshCore,
  cancelSuggestion,
  cancelLeave,
  cancelRequest,
}: StudentChatPanelProps) {
  const [message, setMessage] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // 채팅 탭이 보이는 동안 12초 폴링 — 관리자 답변을 새로고침 없이 반영.
  useEffect(() => {
    if (!active) return;
    const tick = () => {
      if (document.visibilityState === 'visible') refreshCore();
    };
    const iv = setInterval(tick, 12_000);
    return () => clearInterval(iv);
  }, [active, refreshCore]);

  // 열람 중 새 메시지가 도착할 때마다 읽음 처리(미읽음>0일 때만 — 쓰기 절약).
  useEffect(() => {
    if (!active || chatUnreadCount === 0) return;
    markChatRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, chatUnreadCount]);

  // 새 이벤트가 생기면 맨 아래로 — 채팅 스크롤 관례.
  useEffect(() => {
    if (!active) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [active, events.length]);

  const handleSend = async () => {
    const text = message.trim();
    if (!text || chatSending) return;
    const ok = await sendChatMessage(text);
    if (ok) setMessage('');
  };

  const cancelBy = { suggestion: cancelSuggestion, leave: cancelLeave, request: cancelRequest };

  return (
    <div id="student-suggestions" className="space-y-4 scroll-mt-24">
      <div className="rounded-3xl border border-[#0071E3]/15 dark:border-white/10 bg-[#0071E3]/[0.03] dark:bg-[#0071E3]/15 p-5 shadow-sm md:p-6">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-[#0071E3]/10 dark:bg-[#0071E3]/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#0071E3]">
          <MessageSquare className="h-3.5 w-3.5" /> 메시지
        </div>
        <h3 className="mt-2 text-xl font-black text-slate-900 dark:text-slate-100">코멘터와 대화</h3>
        <p className="mt-1 text-[11px] font-semibold leading-5 text-slate-500 dark:text-slate-400">
          궁금한 점이나 건의할 내용을 채팅으로 보내 주세요. 내가 낸 신청들의 진행 상황도 여기에 대화로 흘러요.
        </p>
      </div>

      <div className="no-print rounded-3xl border border-slate-100 dark:border-white/10 bg-white dark:bg-[#1c1c1e] shadow-sm overflow-hidden">
        {/* 타임라인 */}
        <div ref={scrollRef} className="max-h-[62vh] min-h-[280px] overflow-y-auto overscroll-contain p-4 space-y-2.5">
          {events.length === 0 ? (
            <div className="flex h-56 flex-col items-center justify-center gap-2 text-center">
              <MessageSquare className="h-7 w-7 text-slate-300 dark:text-slate-600" />
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">아직 대화가 없어요</p>
              <p className="text-[11px] font-medium text-slate-400 dark:text-slate-400">첫 메시지를 보내면 담당 코멘터가 확인하고 답해 드려요.</p>
            </div>
          ) : (
            events.map((e, idx) => {
              const prev = events[idx - 1];
              const showDateChip = !prev || dateKeyOf(prev.at) !== dateKeyOf(e.at);
              const mine = e.side === 'student';
              return (
                <React.Fragment key={e.id}>
                  {showDateChip && dateKeyOf(e.at) && (
                    <div className="flex justify-center py-1.5">
                      <span className="rounded-full bg-slate-100 dark:bg-white/10 px-3 py-1 text-[10px] font-bold text-slate-400 dark:text-slate-500">
                        {formatDateChip(dateKeyOf(e.at))}
                      </span>
                    </div>
                  )}

                  {e.kind === 'status' ? (
                    <div className="flex justify-center">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-100 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-3 py-1 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                        {e.statusKind === 'rejected' || e.statusKind === 'cancelled' || e.statusKind === 'noshow'
                          ? <XCircle className="h-3 w-3 text-red-500" />
                          : <CheckCircle2 className="h-3 w-3 text-emerald-600" />}
                        {SOURCE_META[e.source]?.label || ''} {STATUS_TEXT_KO[e.statusKind || ''] || e.text}
                        <span className="text-slate-300 dark:text-slate-600">{formatTime(e.at)}</span>
                      </span>
                    </div>
                  ) : e.kind === 'message' ? (
                    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-xs font-semibold whitespace-pre-wrap break-words shadow-sm ${
                        mine
                          ? 'bg-[#0071E3] text-white rounded-br-md'
                          : 'bg-slate-100 dark:bg-white/10 border border-slate-200/60 dark:border-white/10 text-slate-700 dark:text-slate-200 rounded-bl-md'
                      }`}>
                        {!mine && (
                          <span className="block text-[9px] font-black uppercase tracking-wider text-[#0071E3] dark:text-[#409CFF] mb-0.5">
                            {e.author || '코멘터'}
                          </span>
                        )}
                        {e.text}
                        <span className={`mt-1 block text-right text-[9px] font-bold ${mine ? 'text-white/60' : 'text-slate-400 dark:text-slate-500'}`}>
                          {formatTime(e.at)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    (() => {
                      const info = cardInfo(e);
                      const Icon = SOURCE_META[e.source]?.icon || MessageSquare;
                      return (
                        <div className="flex justify-end">
                          <div className="max-w-[86%] min-w-[220px] rounded-2xl rounded-br-md border border-[#0071E3]/15 dark:border-[#0071E3]/25 bg-[#0071E3]/[0.04] dark:bg-[#0071E3]/10 p-3 shadow-sm">
                            <div className="flex items-center justify-between gap-2">
                              <span className="inline-flex min-w-0 items-center gap-1.5 text-[10px] font-black text-[#0071E3]">
                                <Icon className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">{SOURCE_META[e.source]?.label || '신청'}</span>
                              </span>
                              {statusBadge(info.status)}
                            </div>
                            <p className="mt-1.5 text-[11px] font-black text-slate-800 dark:text-slate-200 break-keep">{info.title}</p>
                            <p className="mt-1 whitespace-pre-wrap break-words text-[11px] font-semibold text-slate-500 dark:text-slate-400">{info.body}</p>
                            <div className="mt-1.5 flex items-center justify-between gap-2">
                              <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500">{formatTime(e.at)}</span>
                              {info.cancelable && info.cancelId && (
                                <button
                                  type="button"
                                  onClick={() => cancelBy[info.cancelable!](info.cancelId!)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2 py-1 text-[10px] font-bold text-slate-500 dark:text-slate-400 transition hover:border-red-300 hover:text-red-500 active:scale-[0.97]"
                                >
                                  <Trash2 className="h-3 w-3" /> 신청 취소
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })()
                  )}
                </React.Fragment>
              );
            })
          )}
        </div>

        {/* 입력창 */}
        <div className="border-t border-slate-100 dark:border-white/10 bg-slate-50/60 dark:bg-white/[0.03] p-3">
          <div className="flex items-end gap-2 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-2 focus-within:border-[#0071E3] focus-within:ring-2 focus-within:ring-[#0071E3]/15">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="메시지를 입력해 주세요. 예) 자습실 조명이 조금 어두워요"
              rows={1}
              className="max-h-28 min-h-[38px] flex-1 resize-none border-0 bg-transparent px-1.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!message.trim() || chatSending}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0071E3] text-white shadow-sm transition hover:bg-[#0077ED] active:scale-[0.96] disabled:bg-slate-200 dark:disabled:bg-white/10 disabled:text-slate-400 dark:disabled:text-slate-500 disabled:shadow-none"
              aria-label="메시지 보내기"
            >
              {chatSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-1.5 px-1 text-[9px] font-bold text-slate-400 dark:text-slate-500">
            Enter로 보내고 Shift+Enter로 줄을 바꿔요. 담당 코멘터가 확인하는 대로 답해 드려요.
          </p>
        </div>
      </div>
    </div>
  );
}
