'use client';

// 전역 채팅 독 — 관리자 어느 화면에서든 우하단 플로팅 버튼으로 학생 대화를 빠르게 확인/답장.
// 인박스 메신저의 경량판: 자유채팅 송수신 + 타임라인 열람은 여기서, 승인/반려/폼 처리는
// "인박스에서 처리" 딥링크(/admin/inbox?student=)로 넘긴다. admin layout 에 전역 마운트.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  MessageSquare, Send, Loader2, ArrowLeft, X, Inbox, CheckCircle2, XCircle, ExternalLink,
} from 'lucide-react';
import { AnimatedOverlay } from '@/components/ui/animated-overlay';
import { useAdminGlobalSheet } from '@/components/admin/admin-global-context';
import type { Student, ConsultationLog, SeatMoveRequest, ConsultationBooking } from '@/lib/types/student';
import {
  buildTimeline, lastActivityAt, needsActionCount, unreadCountFor, type TimelineEvent,
} from '@/lib/chat-timeline';
import { adminCardInfo, eventPreview } from '@/components/admin/inbox/chat-view';
import type { ConversationSummary } from '@/components/admin/inbox/inbox-types';

const CAMPUS_LABELS_KO: Record<string, string> = { wonju: '원주', chuncheon: '춘천', chungju: '충주' };

const formatTime = (at: string) => {
  if (!at || at.length < 16) return '';
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ko-KR', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Seoul' }).format(date);
};

const dateKeyOf = (at: string) => {
  if (!at) return '';
  if (at.length <= 10) return at;
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return at.slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(date);
};

const chatLogOf = (s: Student): ConsultationLog | undefined =>
  (s.consultationLogs || []).find((l) => l.type === 'chat');

export function AdminChatDock() {
  const pathname = usePathname();
  const router = useRouter();
  // 열림 상태·배지는 전역 컨텍스트 — 퀵탭 '채팅' 탭과 사이드바가 같은 독을 연다.
  const { chatDockOpen: open, closeChatDock, setChatBadgeCount } = useAdminGlobalSheet();
  const [students, setStudents] = useState<Student[]>([]);
  const [seatMoves, setSeatMoves] = useState<SeatMoveRequest[]>([]);
  const [bookings, setBookings] = useState<ConsultationBooking[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const inFlightRef = useRef(false);
  const seqRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 로그인 페이지 제외 — 퀵탭 배지·독 오버레이는 인박스 포함 전 관리자 화면에서 동작.
  const hidden = !pathname || pathname === '/admin';

  const load = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    const seq = seqRef.current;
    try {
      // 인박스 채팅 뷰와 같은 3소스 — 배지/타임라인이 인박스와 어긋나지 않게 자리이동·상담예약도 합류.
      const [res, seatRes, bookingRes] = await Promise.all([
        fetch('/api/admin/students', { cache: 'no-store' }),
        fetch('/api/admin/seat-moves', { cache: 'no-store' }).catch(() => null),
        fetch('/api/admin/consultation-bookings', { cache: 'no-store' }).catch(() => null),
      ]);
      if (!res.ok) return; // 미인증(401) 등 — 조용히 무시
      const json = await res.json();
      if (seqRef.current === seq && json.success) {
        setStudents(json.data || []);
        setLoaded(true);
      }
      if (seatRes && seatRes.ok) {
        const j = await seatRes.json();
        if (seqRef.current === seq && j.success) setSeatMoves(j.requests || []);
      }
      if (bookingRes && bookingRes.ok) {
        const j = await bookingRes.json();
        if (seqRef.current === seq && j.success) setBookings(j.bookings || []);
      }
    } catch {
      // 배지/폴링 실패는 조용히 — 다음 주기에 재시도
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  // 배지용 1회 지연 로드(페이지 본 작업 방해 최소화) + 닫힌 동안 3분 저빈도 갱신(배지 노후 방지).
  useEffect(() => {
    if (hidden || open) return;
    const t = window.setTimeout(load, 3_000);
    const iv = window.setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 180_000);
    return () => {
      window.clearTimeout(t);
      window.clearInterval(iv);
    };
  }, [hidden, open, load]);
  useEffect(() => {
    if (!open || hidden) return;
    load();
    const iv = window.setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 12_000);
    return () => window.clearInterval(iv);
  }, [open, hidden, load]);

  // 학생별 타임라인 — 인박스와 같은 단일소스(lib/chat-timeline)·같은 소스 구성.
  // OT/모고/도시락은 이름 매핑 없이 일반 라벨로 표시(독은 열람용, 상세 처리는 인박스).
  const timelines = useMemo(() => {
    const map = new Map<string, TimelineEvent[]>();
    const seatByStudent = new Map<string, SeatMoveRequest[]>();
    for (const r of seatMoves) {
      const list = seatByStudent.get(r.studentId) || [];
      list.push(r);
      seatByStudent.set(r.studentId, list);
    }
    const bookingsByStudent = new Map<string, ConsultationBooking[]>();
    for (const b of bookings) {
      const list = bookingsByStudent.get(b.studentId) || [];
      list.push(b);
      bookingsByStudent.set(b.studentId, list);
    }
    for (const s of students) {
      const events = buildTimeline({
        seatMoves: seatByStudent.get(s.id),
        consultationBookings: bookingsByStudent.get(s.id),
        leaveRequests: s.leaveRequests,
        changeRequests: (s.consultationLogs || []).filter((l) => l.type === 'request'),
        suggestions: (s.consultationLogs || []).filter((l) => l.type === 'suggestion'),
        rewardRedemptions: s.rewardRedemptions,
        otAbsences: (s.otEvents || []).map((e) => ({ eventId: e.eventId, status: e.status, reason: e.reason, updatedAt: e.updatedAt })),
        mockAbsences: (s.mockExams || []).map((e) => ({ eventId: e.examId, status: e.status, reason: e.reason, updatedAt: e.updatedAt })),
        mealAdds: (s.mealOrders || []).flatMap((o) => (o.addRequests || []).map((r) => ({
          id: r.id, planId: o.planId, reason: r.reason, status: r.status, createdAt: r.createdAt,
        }))),
        chatLog: chatLogOf(s),
      });
      if (events.length > 0) map.set(s.id, events);
    }
    return map;
  }, [students, seatMoves, bookings]);

  const conversations = useMemo<ConversationSummary[]>(() => {
    const list: ConversationSummary[] = [];
    for (const s of students) {
      const events = timelines.get(s.id);
      if (!events || events.length === 0) continue;
      list.push({
        studentId: s.id,
        studentName: s.name,
        campus: s.campus,
        lastActivityAt: lastActivityAt(events),
        lastPreview: eventPreview(events[events.length - 1]),
        needsActionCount: needsActionCount(events),
        unread: unreadCountFor(events.filter((e) => e.kind === 'message' && e.source === 'chat'), 'admin', chatLogOf(s)?.adminReadAt) > 0,
      });
    }
    return list.sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
  }, [students, timelines]);

  const badgeCount = useMemo(
    () => conversations.reduce((n, c) => n + c.needsActionCount + (c.unread ? 1 : 0), 0),
    [conversations],
  );

  // 배지를 전역 컨텍스트로 보고 — 퀵탭 '채팅' 탭 아이콘이 표시한다.
  useEffect(() => {
    setChatBadgeCount(loaded ? badgeCount : 0);
  }, [loaded, badgeCount, setChatBadgeCount]);

  const selectedStudent = selectedId ? students.find((s) => s.id === selectedId) : undefined;
  const events = selectedId ? timelines.get(selectedId) || [] : [];

  // 방 열람 읽음 처리 — 학생 발신 자유채팅 미읽음이 있을 때만(인박스와 동일 규칙: source='chat' 한정).
  useEffect(() => {
    if (!open || !selectedId) return;
    const student = students.find((s) => s.id === selectedId);
    const roomEvents = timelines.get(selectedId);
    if (!student || !roomEvents) return;
    const chatLog = chatLogOf(student);
    if (!chatLog) return;
    const unread = unreadCountFor(
      roomEvents.filter((e) => e.kind === 'message' && e.source === 'chat'),
      'admin',
      chatLog.adminReadAt,
    );
    if (unread === 0) return;
    const nowIso = new Date().toISOString();
    seqRef.current += 1;
    setStudents((prev) => prev.map((s) => (s.id === selectedId
      ? { ...s, consultationLogs: (s.consultationLogs || []).map((l) => (l.type === 'chat' ? { ...l, adminReadAt: nowIso } : l)) }
      : s)));
    fetch(`/api/admin/students/${selectedId}/chat`, { method: 'PATCH' }).catch(() => {});
  }, [open, selectedId, students, timelines]);

  // 새 이벤트/방 진입 시 맨 아래로.
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [open, selectedId, events.length]);

  const sendChat = async () => {
    const message = draft.trim();
    if (!message || sending || !selectedId) return;
    setSending(true);
    try {
      const res = await fetch(`/api/admin/students/${selectedId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        toast.error(json.message || '메시지 전송 실패');
        return;
      }
      const sent = json.sent || { id: `local_${Date.now()}`, from: 'admin' as const, text: message, at: new Date().toISOString(), author: '코멘터' };
      seqRef.current += 1; // 발사 중인 stale 폴링 응답이 방금 보낸 말풍선을 되돌리지 않게
      setStudents((prev) => prev.map((s) => {
        if (s.id !== selectedId) return s;
        const logs = s.consultationLogs || [];
        const has = logs.some((l) => l.type === 'chat');
        const nextLogs = has
          ? logs.map((l) => (l.type === 'chat' ? { ...l, thread: [...(l.thread || []), sent], adminReadAt: sent.at } : l))
          : [...logs, { id: 'chat_main', date: (sent.at || '').slice(0, 10), manager: '채팅', content: '', type: 'chat' as const, createdAt: sent.at, thread: [sent], adminReadAt: sent.at }];
        return { ...s, consultationLogs: nextLogs };
      }));
      setDraft('');
    } catch {
      toast.error('네트워크 에러가 발생했습니다.');
    } finally {
      setSending(false);
    }
  };

  const openInbox = (studentId?: string) => {
    closeChatDock();
    router.push(studentId ? `/admin/inbox?student=${encodeURIComponent(studentId)}` : '/admin/inbox');
  };

  if (hidden) return null;

  return (
    <>
      {open && (
        <AnimatedOverlay
          align="bottom"
          onClose={closeChatDock}
          closeOnEscape
          lockScroll
          ariaLabel="학생 채팅 독"
          backdropClassName="no-print fixed inset-0 z-[80] flex items-end justify-end bg-black/25 backdrop-blur-[2px] p-0 md:p-5"
          panelClassName="flex h-[82dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-black/5 bg-white shadow-2xl dark:border-white/10 dark:bg-[#1c1c1e] md:h-[85dvh] md:w-[420px] md:rounded-3xl"
        >
          {(requestClose) => (
            <>
              {/* 헤더 */}
              <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-white/10">
                {selectedId ? (
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-500 dark:border-white/10 dark:text-slate-400"
                    aria-label="대화목록으로"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                ) : (
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#0071E3]/10 text-[#0071E3]">
                    <MessageSquare className="h-4 w-4" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-black text-slate-900 dark:text-slate-100">
                    {selectedStudent ? selectedStudent.name : '학생 채팅'}
                  </span>
                  <span className="block truncate text-[10px] font-bold text-slate-400 dark:text-slate-500">
                    {selectedStudent
                      ? `${CAMPUS_LABELS_KO[selectedStudent.campus] || selectedStudent.campus} · 처리(승인/반려)는 인박스에서`
                      : '빠른 확인·답장 — 상세 처리는 인박스'}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => openInbox(selectedId || undefined)}
                  className="flex shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[10px] font-bold text-slate-600 transition hover:bg-slate-100 active:scale-[0.97] dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
                >
                  <Inbox className="h-3.5 w-3.5 text-[#0071E3]" /> 인박스
                </button>
                <button
                  type="button"
                  onClick={requestClose}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-500 dark:border-white/10 dark:text-slate-400"
                  aria-label="닫기"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* 본문 — 대화목록 ↔ 방 (단일 컬럼 push) */}
              {!selectedId ? (
                <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain p-3">
                  {!loaded ? (
                    <div className="flex h-40 items-center justify-center">
                      <Loader2 className="h-5 w-5 animate-spin text-[#0071E3]" />
                    </div>
                  ) : conversations.length === 0 ? (
                    <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
                      <MessageSquare className="h-6 w-6 text-slate-300 dark:text-slate-600" />
                      <p className="text-[11px] font-bold text-slate-400">대화 내역 없음</p>
                    </div>
                  ) : (
                    conversations.map((c) => (
                      <button
                        key={c.studentId}
                        type="button"
                        onClick={() => setSelectedId(c.studentId)}
                        className="flex w-full items-center gap-2.5 rounded-2xl border border-slate-100 bg-white px-3 py-2.5 text-left transition hover:border-slate-200 active:scale-[0.99] dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20"
                      >
                        <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-black text-slate-500 dark:bg-white/10 dark:text-slate-300">
                          {c.studentName.slice(0, 2)}
                          {c.unread && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[#0071E3] ring-2 ring-white dark:ring-[#1c1c1e]" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-xs font-black text-slate-800 dark:text-slate-200">{c.studentName}</span>
                            <span className="shrink-0 rounded-md border border-slate-200 bg-slate-100 px-1 py-px text-[9px] font-bold text-slate-500 dark:border-white/10 dark:bg-white/10 dark:text-slate-400">
                              {CAMPUS_LABELS_KO[c.campus] || c.campus}
                            </span>
                          </span>
                          <span className="block truncate text-[10px] font-semibold text-slate-400 dark:text-slate-500">{c.lastPreview}</span>
                        </span>
                        {c.needsActionCount > 0 && (
                          <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-amber-500 px-1.5 text-[10px] font-black text-white">
                            {c.needsActionCount}
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              ) : (
                <>
                  <div ref={scrollRef} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain p-3.5">
                    {events.length === 0 ? (
                      <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
                        <MessageSquare className="h-6 w-6 text-slate-300 dark:text-slate-600" />
                        <p className="text-[11px] font-bold text-slate-400">대화 내역 없음 — 아래에서 첫 메시지 전송 가능</p>
                      </div>
                    ) : (
                      events.map((e, idx) => {
                        const prev = events[idx - 1];
                        const showDateChip = !prev || dateKeyOf(prev.at) !== dateKeyOf(e.at);
                        return (
                          <React.Fragment key={e.id}>
                            {showDateChip && dateKeyOf(e.at) && (
                              <div className="flex justify-center py-1">
                                <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-400 dark:bg-white/10 dark:text-slate-500">
                                  {dateKeyOf(e.at)}
                                </span>
                              </div>
                            )}
                            {e.kind === 'status' ? (
                              <div className="flex justify-center animate-in fade-in-0 slide-in-from-bottom-2 duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]">
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-100 bg-slate-50 px-3 py-1 text-[10px] font-bold text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
                                  {e.statusKind === 'rejected' || e.statusKind === 'cancelled' || e.statusKind === 'noshow'
                                    ? <XCircle className="h-3 w-3 text-red-500" />
                                    : <CheckCircle2 className="h-3 w-3 text-emerald-600" />}
                                  {e.text}
                                </span>
                              </div>
                            ) : e.kind === 'message' ? (
                              <div className={`flex ${e.side === 'admin' ? 'justify-end' : 'justify-start'} animate-in fade-in-0 slide-in-from-bottom-2 duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]`}>
                                <div className={`max-w-[82%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-xs font-semibold shadow-sm ${
                                  e.side === 'admin'
                                    ? 'rounded-br-md bg-[#0071E3] text-white'
                                    : 'rounded-bl-md border border-slate-200/60 bg-slate-100 text-slate-700 dark:border-white/10 dark:bg-white/10 dark:text-slate-200'
                                }`}>
                                  {e.side !== 'admin' && (
                                    <span className="mb-0.5 block text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">학생</span>
                                  )}
                                  {e.text}
                                  <span className={`mt-1 block text-right text-[9px] font-bold ${e.side === 'admin' ? 'text-white/60' : 'text-slate-400 dark:text-slate-500'}`}>
                                    {formatTime(e.at)}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              (() => {
                                const info = adminCardInfo(e);
                                return (
                                  <div className="flex justify-start animate-in fade-in-0 slide-in-from-bottom-2 duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]">
                                    <div className="w-full max-w-[92%] space-y-1.5 rounded-2xl rounded-bl-md border border-slate-200 bg-slate-50/70 p-3 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
                                      <p className="text-[11px] font-black text-slate-800 dark:text-slate-200 break-keep">{info.title}</p>
                                      {info.body && (
                                        <p className="whitespace-pre-wrap break-words text-[10px] font-semibold text-slate-500 dark:text-slate-400">{info.body}</p>
                                      )}
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500">{formatTime(e.at)}</span>
                                        {e.needsAction && (
                                          <button
                                            type="button"
                                            onClick={() => openInbox(selectedId)}
                                            className="inline-flex items-center gap-1 rounded-lg bg-[#0071E3] px-2 py-1 text-[10px] font-bold text-white transition hover:bg-[#0077ED] active:scale-[0.97]"
                                          >
                                            <ExternalLink className="h-3 w-3" /> 인박스에서 처리
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

                  {/* 자유채팅 입력 */}
                  <div className="shrink-0 border-t border-slate-100 bg-slate-50/60 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                    <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-white p-2 focus-within:border-[#0071E3] focus-within:ring-2 focus-within:ring-[#0071E3]/15 dark:border-white/10 dark:bg-[#1c1c1e]">
                      <textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                            e.preventDefault();
                            sendChat();
                          }
                        }}
                        placeholder={`${selectedStudent?.name || '학생'}에게 메시지 전송`}
                        rows={1}
                        className="max-h-24 min-h-[36px] flex-1 resize-none border-0 bg-transparent px-1.5 py-1.5 text-xs font-semibold text-slate-800 placeholder:text-slate-300 focus:outline-none dark:text-slate-200 dark:placeholder:text-slate-600"
                      />
                      <button
                        type="button"
                        onClick={sendChat}
                        disabled={!draft.trim() || sending}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0071E3] text-white shadow-sm transition hover:bg-[#0077ED] active:scale-[0.96] disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-white/10 dark:disabled:text-slate-500"
                        aria-label="메시지 전송"
                      >
                        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </AnimatedOverlay>
      )}
    </>
  );
}
