'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  ChevronLeft, CalendarClock, Loader2, Plus, Trash2,
  XCircle, Bell, MessageSquare, Ticket, Lightbulb,
} from 'lucide-react';
import { toast } from 'sonner';
import { Student, OtEvent } from '@/lib/types/student';
import { AdminTopNav } from '@/components/admin/admin-top-nav';
import { AdminNavActions } from '@/components/admin/admin-nav-actions';
import { RecipientPickerModal } from '@/components/admin/recipient-picker-modal';
import { OtEventManager } from '@/components/admin/ot-event-manager';
import { useConfirm } from '@/components/ui/confirm-dialog';

const getCampusLabel = (c: string) => ({ wonju: '원주', chuncheon: '춘천', chungju: '충주' }[c] ?? '기타');

export default function OtEventsPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [events, setEvents] = useState<OtEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [adminCampus, setAdminCampus] = useState<string>('all');
  const [newName, setNewName] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [newCampus, setNewCampus] = useState<string>('all');
  const [adding, setAdding] = useState(false);
  const [notifyingEventId, setNotifyingEventId] = useState<string | null>(null);
  const [pickerEvent, setPickerEvent] = useState<OtEvent | null>(null);

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
    if (!newName.trim() || !newDate) { toast.error('OT명과 날짜를 입력해 주세요.'); return; }
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

  const cancelNotify = async (eventId: string) => {
    if (notifyingEventId) return;
    if (!(await confirm({ title: '발송된 OT 참여 알림을 취소할까요?', description: '학생 화면에서 사라지고, 다시 발송할 수 있습니다.', tone: 'danger', confirmText: '취소' }))) return;
    setNotifyingEventId(eventId);
    try {
      const res = await fetch('/api/admin/ot-events', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, action: 'cancel' }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('OT 참여 알림을 취소했습니다.');
        setEvents((prev) => prev.map((e) => (e.id === eventId ? json.event : e)));
      } else { toast.error(json.message || '처리 실패'); }
    } catch { toast.error('네트워크 에러'); } finally { setNotifyingEventId(null); }
  };

  // 수신자 체크리스트에서 확정한 학생에게만 발송
  const sendNotify = async (eventId: string, studentIds: string[]) => {
    if (notifyingEventId) return;
    setNotifyingEventId(eventId);
    try {
      const res = await fetch('/api/admin/ot-events', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, action: 'send', studentIds }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`OT 참여 확인 알림을 ${studentIds.length}명에게 발송했습니다.`);
        setEvents((prev) => prev.map((e) => (e.id === eventId ? json.event : e)));
        setPickerEvent(null);
      } else { toast.error(json.message || '처리 실패'); }
    } catch { toast.error('네트워크 에러'); } finally { setNotifyingEventId(null); }
  };

  const selectedEvent = events.find((e) => e.id === selectedEventId);

  if (checkingAuth) {
    return <div className="min-h-screen bg-[#F8F9FA] dark:bg-[#0b0b0c] flex items-center justify-center"><Loader2 className="w-7 h-7 text-[#0071E3] animate-spin" /></div>;
  }

  return (
    <div className="ios-app-bg min-h-screen text-slate-900 dark:text-slate-100 font-sans">
      <AdminTopNav title="OT 참여 관리" titleIcon={<CalendarClock className="w-4 h-4 text-[#0071E3]" />} onLogout={handleLogout} actions={<AdminNavActions onRefresh={loadAll} loading={loading} onLogout={handleLogout} />} />

      <main className="stagger-children mx-auto max-w-4xl px-4 pt-6 pb-16 sm:px-6 space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => router.push('/admin/dashboard')}
            className="h-9 w-9 rounded-xl border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] hover:bg-slate-50 dark:hover:bg-white/5 shrink-0">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-black tracking-tight flex items-center gap-2">
              <CalendarClock className="w-5 h-5 text-[#0071E3]" /> OT 참여 관리
            </h1>
            <p className="text-xs font-bold text-slate-400 dark:text-slate-400 mt-0.5">OT 일정을 등록·알림하고 참여 학생에게 쿠폰을 지급합니다.</p>
          </div>
        </div>

        {/* 쿠폰 안내 */}
        <div className="rounded-2xl border border-[#0071E3]/15 bg-[#0071E3]/[0.04] dark:bg-[#0071E3]/15 p-3.5 flex items-center gap-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
          <Ticket className="w-4 h-4 text-[#0071E3] shrink-0" />
          학생을 "참여"로 처리하거나 학생이 직접 참여 응답하면 OT 참여 쿠폰이 자동 지급됩니다. 지급량은{' '}
          <button className="underline font-bold text-[#0071E3]" onClick={() => router.push('/admin/missions')}>쿠폰 미션 설정</button>에서 조정.
        </div>

        {/* 일정 등록 */}
        <div className="rounded-2xl bg-white dark:bg-[#1c1c1e] border border-slate-100 dark:border-white/10 shadow-sm p-5 space-y-3">
          <p className="text-sm font-black text-slate-700 dark:text-slate-300">OT 일정 등록</p>
          <div className="flex flex-wrap gap-2">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="OT명 (예: 신학기 OT)"
              className="flex-1 min-w-40 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-3 py-2 text-sm font-semibold text-slate-800 dark:text-slate-200 focus:border-[#0071E3] focus:outline-none" />
            <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)}
              className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-3 py-2 text-sm font-semibold text-slate-800 dark:text-slate-200 focus:border-[#0071E3] focus:outline-none" />
            <select
              value={newCampus}
              onChange={(e) => setNewCampus(e.target.value)}
              disabled={adminCampus !== 'all'}
              title={adminCampus !== 'all' ? '담당 캠퍼스로 자동 지정됩니다' : '대상 캠퍼스 선택'}
              className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-3 py-2 text-sm font-semibold text-slate-800 dark:text-slate-200 focus:border-[#0071E3] focus:outline-none disabled:opacity-70">
              <option value="all">전체 캠퍼스</option>
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
            className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-3 py-2 text-sm font-semibold text-slate-800 dark:text-slate-200 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:border-[#0071E3] focus:outline-none resize-none"
          />
          <p className="text-[11px] font-semibold text-slate-400 flex items-start gap-1">
            <Lightbulb className="w-3 h-3 shrink-0 mt-0.5" />
            <span>캠퍼스별로 날짜가 다르면 같은 OT명으로 캠퍼스를 바꿔 각각 등록하세요. 학생에게는 <b>OT 날짜 3일 전부터 자동</b>으로 알림이 뜹니다. (즉시 보내려면 ‘학생 알림’)</span>
          </p>

          {events.length > 0 && (
            <div className="space-y-2 pt-1">
              {events.map((event) => (
                <div key={event.id} className={`flex items-center gap-2 rounded-2xl border px-3 py-2.5 transition ${
                  selectedEventId === event.id ? 'border-[#0071E3]/30 bg-[#0071E3]/5 dark:bg-[#0071E3]/15' : 'border-slate-100 dark:border-white/10 bg-slate-50/60 dark:bg-white/5'
                }`}>
                  <button type="button" onClick={() => setSelectedEventId(event.id)} className="flex-1 flex items-start gap-2 text-left">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-xs font-black ${selectedEventId === event.id ? 'text-[#0071E3]' : 'text-slate-700 dark:text-slate-300'}`}>{event.name}</span>
                        <span className="text-[11px] font-semibold text-slate-400">{event.date}</span>
                        <span className="rounded-lg bg-slate-200/70 dark:bg-white/10 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 text-[9px] font-black">
                          {event.campus && event.campus !== 'all' ? getCampusLabel(event.campus) : '전체 캠퍼스'}
                        </span>
                        {event.notifiedAt && (
                          <span className="flex items-center gap-1 rounded-lg bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 text-[9px] font-black">
                            <Bell className="w-2 h-2" /> 알림됨
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                  <button type="button" disabled={!!notifyingEventId} onClick={() => (event.notifiedAt ? cancelNotify(event.id) : setPickerEvent(event))}
                    title={event.notifiedAt ? `발송: ${new Date(event.notifiedAt).toLocaleString('ko-KR')} · 클릭하면 취소` : '수신 대상 선택 후 발송'}
                    className={`flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-black transition active:scale-95 shrink-0 ${
                      event.notifiedAt ? 'border border-red-100 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 text-red-600 hover:bg-red-100' : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}>
                    {notifyingEventId === event.id ? <Loader2 className="w-3 h-3 animate-spin" /> : event.notifiedAt ? <XCircle className="w-3 h-3" /> : <MessageSquare className="w-3 h-3" />}
                    {event.notifiedAt ? '알림 취소' : '학생 알림'}
                  </button>
                  <button type="button" onClick={() => deleteEvent(event.id)}
                    className="rounded-lg p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition shrink-0" title="삭제">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedEvent && (
          <OtEventManager event={selectedEvent} students={students} onStudentsChange={setStudents} adminCampus={adminCampus} />
        )}

        {!selectedEvent && !loading && (
          <div className="rounded-2xl bg-white dark:bg-[#1c1c1e] border border-slate-100 dark:border-white/10 p-12 text-center">
            <CalendarClock className="w-10 h-10 text-slate-200 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-400">OT 일정을 먼저 등록해 주세요.</p>
          </div>
        )}
      </main>

      {pickerEvent && (
        <RecipientPickerModal
          key={pickerEvent.id}
          eventName={pickerEvent.name}
          kindLabel="OT"
          students={students}
          campus={pickerEvent.campus}
          targetExamTypes={pickerEvent.targetExamTypes}
          sending={!!notifyingEventId}
          onCancel={() => setPickerEvent(null)}
          onSend={(ids) => sendNotify(pickerEvent.id, ids)}
        />
      )}
    </div>
  );
}
