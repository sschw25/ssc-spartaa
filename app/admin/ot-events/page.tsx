'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ChevronLeft, CalendarClock, RefreshCw, Loader2, Plus, Trash2,
  CheckCircle2, XCircle, HelpCircle, Bell, MessageSquare, Ticket,
} from 'lucide-react';
import { toast } from 'sonner';
import { Student, OtEvent, OtParticipation } from '@/lib/types/student';
import { AdminTopNav } from '@/components/admin/admin-top-nav';
import { useConfirm } from '@/components/ui/confirm-dialog';

const CAMPUS_FILTERS = ['all', 'wonju', 'chuncheon', 'chungju'];
const getCampusLabel = (c: string) => ({ wonju: '원주', chuncheon: '춘천', chungju: '충주' }[c] ?? '기타');

type Status = OtParticipation['status'];

const STATUS_CONFIG: Record<'attending' | 'absent' | 'undecided', { label: string; cls: string; icon: React.ReactNode }> = {
  attending: { label: '참여', cls: 'bg-emerald-600 text-white border-emerald-600', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  absent: { label: '불참', cls: 'bg-red-500 text-white border-red-500', icon: <XCircle className="w-3.5 h-3.5" /> },
  undecided: { label: '미정', cls: 'bg-white text-slate-500 border-slate-200', icon: <HelpCircle className="w-3.5 h-3.5" /> },
};

export default function OtEventsPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [events, setEvents] = useState<OtEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [campusFilter, setCampusFilter] = useState('all');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [adminCampus, setAdminCampus] = useState<string>('all');
  const [newName, setNewName] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [newCampus, setNewCampus] = useState<string>('all');
  const [adding, setAdding] = useState(false);
  const [notifyingEventId, setNotifyingEventId] = useState<string | null>(null);

  const handleLogout = async () => {
    try { await fetch('/api/admin/auth/logout', { method: 'POST' }); } catch {}
    router.replace('/admin');
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [stuRes, evRes] = await Promise.all([
        fetch('/api/admin/students', { cache: 'no-store', credentials: 'same-origin' }),
        fetch('/api/admin/ot-events', { cache: 'no-store', credentials: 'same-origin' }),
      ]);
      if (stuRes.ok) { const j = await stuRes.json(); if (j.success) setStudents(j.data || []); }
      if (evRes.ok) {
        const j = await evRes.json();
        if (j.success) { setEvents(j.events || []); setSelectedEventId((cur) => cur || j.events?.[0]?.id || null); }
      }
    } catch {
      toast.error('데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/auth/me');
        if (!res.ok) { router.replace('/admin'); return; }
        try {
          const me = await res.json();
          if (me?.campus && me.campus !== 'all') { setAdminCampus(me.campus); setNewCampus(me.campus); }
        } catch { /* noop */ }
        loadAll();
      } catch { router.replace('/admin'); } finally { setCheckingAuth(false); }
    })();
  }, [router, loadAll]);

  const addEvent = async () => {
    if (!newName.trim() || !newDate) { toast.error('OT명과 날짜를 입력해주세요.'); return; }
    setAdding(true);
    try {
      const res = await fetch('/api/admin/ot-events', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), date: newDate, campus: newCampus, message: newMessage.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('OT 일정이 등록되었습니다.');
        setEvents((prev) => [json.event, ...prev]);
        setSelectedEventId(json.event.id);
        setNewName(''); setNewDate(''); setNewMessage('');
      } else { toast.error(json.message || '등록 실패'); }
    } catch { toast.error('네트워크 에러'); } finally { setAdding(false); }
  };

  const deleteEvent = async (eventId: string) => {
    if (!(await confirm({ title: '이 OT 일정을 삭제할까요?', tone: 'danger', confirmText: '삭제' }))) return;
    try {
      const res = await fetch(`/api/admin/ot-events?eventId=${encodeURIComponent(eventId)}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        toast.success('삭제되었습니다.');
        setEvents((prev) => prev.filter((e) => e.id !== eventId));
        if (selectedEventId === eventId) setSelectedEventId(null);
      } else { toast.error(json.message || '삭제 실패'); }
    } catch { toast.error('네트워크 에러'); }
  };

  const notifyToStudents = async (eventId: string, action: 'send' | 'cancel' = 'send') => {
    if (notifyingEventId) return;
    if (action === 'cancel' && !(await confirm({ title: '발송된 OT 참여 알림을 취소할까요?', description: '학생 화면에서 사라지고, 다시 발송할 수 있습니다.', tone: 'danger', confirmText: '취소' }))) return;
    setNotifyingEventId(eventId);
    try {
      const res = await fetch('/api/admin/ot-events', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, action }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(action === 'cancel' ? 'OT 참여 알림을 취소했습니다.' : '학생들에게 OT 참여 확인 알림을 발송했습니다.');
        setEvents((prev) => prev.map((e) => (e.id === eventId ? json.event : e)));
      } else { toast.error(json.message || '처리 실패'); }
    } catch { toast.error('네트워크 에러'); } finally { setNotifyingEventId(null); }
  };

  const setStatus = async (studentId: string, status: Status) => {
    if (!selectedEventId) return;
    const key = `${studentId}-${selectedEventId}`;
    setUpdating(key);
    try {
      const res = await fetch(`/api/admin/students/${studentId}/ot-event`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: selectedEventId, status }),
      });
      const json = await res.json();
      if (json.success) {
        setStudents((prev) => prev.map((s) => {
          if (s.id !== studentId) return s;
          const existing = (s.otEvents || []).filter((e) => e.eventId !== selectedEventId);
          return { ...s, otEvents: [...existing, json.entry] };
        }));
        if (json.couponsGranted > 0) toast.success(`참여 처리 — 쿠폰 ${json.couponsGranted}장 지급됨`);
      } else { toast.error(json.message || '상태 변경 실패'); }
    } catch { toast.error('네트워크 에러'); } finally { setUpdating(null); }
  };

  const getStatus = (student: Student): Status => {
    if (!selectedEventId) return 'undecided';
    return (student.otEvents || []).find((e) => e.eventId === selectedEventId)?.status ?? 'undecided';
  };

  const selectedEvent = events.find((e) => e.id === selectedEventId);
  const scopedStudents = students.filter((s) => campusFilter === 'all' || s.campus === campusFilter);
  const stats = {
    attending: scopedStudents.filter((s) => getStatus(s) === 'attending').length,
    absent: scopedStudents.filter((s) => getStatus(s) === 'absent').length,
    pending: scopedStudents.filter((s) => getStatus(s) === 'absent_requested').length,
    undecided: scopedStudents.filter((s) => getStatus(s) === 'undecided').length,
  };

  if (checkingAuth) {
    return <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center"><Loader2 className="w-7 h-7 text-[#0071E3] animate-spin" /></div>;
  }

  return (
    <div className="ios-app-bg min-h-screen text-[#1D1D1F] font-sans">
      <AdminTopNav title="OT 참여 관리" titleIcon={<CalendarClock className="w-4 h-4 text-[#0071E3]" />} onLogout={handleLogout} />

      <main className="mx-auto max-w-4xl px-4 pt-6 pb-16 sm:px-6 space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => router.push('/admin/dashboard')}
            className="h-9 w-9 rounded-xl border-slate-200 bg-white hover:bg-slate-50 shrink-0">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-black tracking-tight flex items-center gap-2">
              <CalendarClock className="w-5 h-5 text-[#0071E3]" /> OT 참여 관리
            </h1>
            <p className="text-xs font-bold text-slate-400 mt-0.5">OT 일정을 등록·알림하고 참여 학생에게 쿠폰을 지급합니다.</p>
          </div>
          <Button variant="outline" size="sm" onClick={loadAll}
            className="ml-auto shrink-0 rounded-xl text-xs h-9 bg-white border-slate-200 hover:bg-slate-50">
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> 새로고침
          </Button>
        </div>

        {/* 쿠폰 안내 */}
        <div className="rounded-2xl border border-[#0071E3]/15 bg-[#0071E3]/[0.04] p-3.5 flex items-center gap-2.5 text-xs font-semibold text-slate-600">
          <Ticket className="w-4 h-4 text-[#0071E3] shrink-0" />
          학생을 "참여"로 처리하거나 학생이 직접 참여 응답하면 OT 참여 쿠폰이 자동 지급됩니다. 지급량은{' '}
          <button className="underline font-bold text-[#0071E3]" onClick={() => router.push('/admin/missions')}>쿠폰 미션 설정</button>에서 조정.
        </div>

        {/* 일정 등록 */}
        <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-5 space-y-3">
          <p className="text-sm font-black text-slate-700">OT 일정 등록</p>
          <div className="flex flex-wrap gap-2">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="OT명 (예: 신학기 OT)"
              className="flex-1 min-w-40 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 focus:border-[#0071E3] focus:outline-none" />
            <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 focus:border-[#0071E3] focus:outline-none" />
            <select
              value={newCampus}
              onChange={(e) => setNewCampus(e.target.value)}
              disabled={adminCampus !== 'all'}
              title={adminCampus !== 'all' ? '담당 센터로 자동 지정됩니다' : '대상 센터 선택'}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 focus:border-[#0071E3] focus:outline-none disabled:opacity-70">
              <option value="all">전체 센터</option>
              <option value="wonju">원주</option>
              <option value="chuncheon">춘천</option>
              <option value="chungju">충주</option>
            </select>
            <Button onClick={addEvent} disabled={adding}
              className="rounded-xl bg-[#0071E3] hover:bg-[#005DB9] text-white text-xs font-black h-10 px-4">
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} 등록
            </Button>
          </div>
          <textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="학생 알림에 함께 보낼 안내 메시지 (선택) — 예) 준비물·장소·시간 안내"
            rows={2}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 placeholder:text-slate-300 focus:border-[#0071E3] focus:outline-none resize-none"
          />
          <p className="text-[11px] font-semibold text-slate-400">
            💡 센터별로 날짜가 다르면 같은 OT명으로 센터를 바꿔 각각 등록하세요. 학생에게는 <b>OT 날짜 3일 전부터 자동</b>으로 알림이 뜹니다. (즉시 보내려면 ‘학생 알림’)
          </p>

          {events.length > 0 && (
            <div className="space-y-2 pt-1">
              {events.map((event) => (
                <div key={event.id} className={`flex items-center gap-2 rounded-2xl border px-3 py-2.5 transition ${
                  selectedEventId === event.id ? 'border-[#0071E3]/30 bg-[#0071E3]/5' : 'border-slate-100 bg-slate-50/60'
                }`}>
                  <button type="button" onClick={() => setSelectedEventId(event.id)} className="flex-1 flex items-start gap-2 text-left">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-xs font-black ${selectedEventId === event.id ? 'text-[#0071E3]' : 'text-slate-700'}`}>{event.name}</span>
                        <span className="text-[11px] font-semibold text-slate-400">{event.date}</span>
                        <span className="rounded-lg bg-slate-200/70 text-slate-600 px-1.5 py-0.5 text-[9px] font-black">
                          {event.campus && event.campus !== 'all' ? getCampusLabel(event.campus) : '전체 센터'}
                        </span>
                        {event.notifiedAt && (
                          <span className="flex items-center gap-1 rounded-lg bg-emerald-100 text-emerald-700 px-1.5 py-0.5 text-[9px] font-black">
                            <Bell className="w-2 h-2" /> 알림됨
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                  <button type="button" disabled={!!notifyingEventId} onClick={() => notifyToStudents(event.id, event.notifiedAt ? 'cancel' : 'send')}
                    title={event.notifiedAt ? `발송: ${new Date(event.notifiedAt).toLocaleString('ko-KR')} · 클릭하면 취소` : '학생에게 참여 확인 알림 발송'}
                    className={`flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-black transition active:scale-95 shrink-0 ${
                      event.notifiedAt ? 'border border-red-100 bg-red-50 text-red-600 hover:bg-red-100' : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}>
                    {notifyingEventId === event.id ? <Loader2 className="w-3 h-3 animate-spin" /> : event.notifiedAt ? <XCircle className="w-3 h-3" /> : <MessageSquare className="w-3 h-3" />}
                    {event.notifiedAt ? '알림 취소' : '학생 알림'}
                  </button>
                  <button type="button" onClick={() => deleteEvent(event.id)}
                    className="rounded-lg p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 transition shrink-0" title="삭제">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedEvent && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {([
                ['참여', 'bg-emerald-50 border-emerald-200/70 text-emerald-800', stats.attending],
                ['불참 승인대기', 'bg-amber-50 border-amber-200/70 text-amber-800', stats.pending],
                ['불참(승인)', 'bg-red-50 border-red-200/70 text-red-800', stats.absent],
                ['미정', 'bg-slate-50 border-slate-200/70 text-slate-600', stats.undecided],
              ] as [string, string, number][]).map(([label, cls, count]) => (
                <div key={label} className={`rounded-2xl border px-4 py-3 ${cls}`}>
                  <p className="text-[18px] font-semibold tracking-tight">{count}</p>
                  <p className="text-[11px] font-bold opacity-70 mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {CAMPUS_FILTERS.map((c) => (
                <button key={c} onClick={() => setCampusFilter(c)}
                  className={`rounded-xl px-3.5 py-1.5 text-xs font-black border transition active:scale-95 ${
                    campusFilter === c ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                  }`}>
                  {c === 'all' ? '전체 캠퍼스' : getCampusLabel(c)}
                </button>
              ))}
            </div>

            <div className="rounded-3xl border border-slate-100 bg-white shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs font-semibold text-slate-600">
                  <thead className="bg-slate-50/80 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                    <tr><th className="px-5 py-4">원생</th><th className="px-4 py-4">참여여부</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100/60">
                    {scopedStudents.map((s) => {
                      const status = getStatus(s);
                      const isUpdating = updating === `${s.id}-${selectedEventId}`;
                      const participation = selectedEventId ? (s.otEvents || []).find((e) => e.eventId === selectedEventId) : undefined;
                      const absentReason = (status === 'absent' || status === 'absent_requested') ? participation?.reason : undefined;
                      const selfResponded = participation?.respondedBy === 'student';
                      const pendingAbsence = status === 'absent_requested';
                      return (
                        <tr key={s.id}>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <span className="font-black text-slate-800">{s.name}</span>
                              <Badge className="bg-slate-100 text-slate-500 border-none font-bold rounded-lg px-2 py-0.5 text-[9px]">{getCampusLabel(s.campus)}</Badge>
                              {participation?.rewarded && (
                                <span className="flex items-center gap-0.5 rounded-md bg-amber-50 text-amber-600 px-1.5 py-0.5 text-[9px] font-black"><Ticket className="w-2.5 h-2.5" />지급</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1.5 items-center">
                              {(['attending', 'absent', 'undecided'] as Array<'attending' | 'absent' | 'undecided'>).map((st) => {
                                const cfg = STATUS_CONFIG[st];
                                const active = status === st;
                                return (
                                  <button key={st} type="button" disabled={isUpdating} onClick={() => setStatus(s.id, st)}
                                    className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-black transition active:scale-95 ${
                                      active ? cfg.cls : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                                    }`}>
                                    {isUpdating && active ? <Loader2 className="w-3 h-3 animate-spin" /> : cfg.icon}
                                    {cfg.label}
                                  </button>
                                );
                              })}
                              {pendingAbsence && (
                                <span className="rounded-lg bg-amber-100 text-amber-700 px-2 py-1 text-[10px] font-black animate-pulse">불참 승인대기</span>
                              )}
                              {selfResponded && !pendingAbsence && <span className="rounded-lg bg-blue-50 text-blue-600 px-2 py-1 text-[10px] font-black">학생응답</span>}
                            </div>
                            {absentReason && <p className="mt-1 text-[11px] font-semibold text-slate-400">{absentReason}</p>}
                            {pendingAbsence && (
                              <div className="mt-1.5 flex gap-1.5">
                                <button type="button" disabled={isUpdating} onClick={() => setStatus(s.id, 'absent')}
                                  className="flex items-center gap-1 rounded-lg bg-red-500 text-white px-2.5 py-1.5 text-[11px] font-black transition active:scale-95 disabled:opacity-50">
                                  {isUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />} 불참 승인
                                </button>
                                <button type="button" disabled={isUpdating} onClick={() => setStatus(s.id, 'undecided')}
                                  className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white text-slate-600 px-2.5 py-1.5 text-[11px] font-black transition active:scale-95 hover:border-slate-300 disabled:opacity-50">
                                  반려(참석 요청)
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {!selectedEvent && !loading && (
          <div className="rounded-2xl bg-white border border-slate-100 p-12 text-center">
            <CalendarClock className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-400">OT 일정을 먼저 등록해주세요.</p>
          </div>
        )}
      </main>
    </div>
  );
}
