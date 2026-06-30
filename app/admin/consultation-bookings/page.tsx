'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Loader2, CalendarClock, Search, Check, X, RefreshCw, Plus, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { buildConsultationDigest } from '@/lib/consultation-digest';
import { Student, ConsultationBooking, BlackoutEntry } from '@/lib/types/student';
import {
  CONSULTATION_SLOT_TIMES,
  WEEKDAY_LABEL,
  type DaySlotGrid,
} from '@/lib/consultation-schedule';
import { AdminTopNav } from '@/components/admin/admin-top-nav';
import { useAdminGlobalSheet } from '@/components/admin/admin-global-context';

const ALL_CAMPUSES = ['wonju', 'chuncheon', 'chungju'] as const;
type Campus = (typeof ALL_CAMPUSES)[number];

function consultationStats(list: ConsultationBooking[]) {
  const total = list.length;
  const done = list.filter((b) => b.status === 'done').length;
  const noshow = list.filter((b) => b.status === 'noshow').length;
  const resolved = done + noshow;
  return { total, done, noshow, noshowRate: resolved ? Math.round((noshow / resolved) * 100) : 0 };
}

function campusLabel(val: string) {
  switch (val) {
    case 'wonju': return '원주';
    case 'chuncheon': return '춘천';
    case 'chungju': return '충주';
    default: return val;
  }
}

function dateLabel(ymd: string, weekday?: string): string {
  const [, m, d] = ymd.split('-');
  const wk = weekday && weekday in WEEKDAY_LABEL ? WEEKDAY_LABEL[weekday as keyof typeof WEEKDAY_LABEL] : '';
  return `${Number(m)}월 ${Number(d)}일${wk ? ` (${wk})` : ''}`;
}

interface ApiResponse {
  success: boolean;
  bookings: ConsultationBooking[];
  grids: Record<string, DaySlotGrid[]>;
  blackouts: Record<string, BlackoutEntry[]>;
  today: string;
}

export default function AdminConsultationBookingsPage() {
  const router = useRouter();
  const { openStudent } = useAdminGlobalSheet();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const [sessionCampus, setSessionCampus] = useState<string>('all');
  const [campus, setCampus] = useState<Campus>('wonju');

  const [bookings, setBookings] = useState<ConsultationBooking[]>([]);
  const [grids, setGrids] = useState<Record<string, DaySlotGrid[]>>({});
  const [blackoutsMap, setBlackoutsMap] = useState<Record<string, BlackoutEntry[]>>({});
  const [today, setToday] = useState('');

  // 완료 처리 모달 상태
  const [completeTarget, setCompleteTarget] = useState<ConsultationBooking | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [completeBusy, setCompleteBusy] = useState(false);

  // 관리자 직접 예약 폼
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [assignStudentId, setAssignStudentId] = useState('');
  const [assignDate, setAssignDate] = useState('');
  const [assignSlot, setAssignSlot] = useState('');

  // 접근 가능한 센터 목록
  const allowedCampuses: Campus[] = useMemo(() => {
    if (sessionCampus === 'all') return [...ALL_CAMPUSES];
    return ALL_CAMPUSES.filter((c) => c === sessionCampus);
  }, [sessionCampus]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/consultation-bookings', { cache: 'no-store', credentials: 'same-origin' });
      if (res.ok) {
        const json: ApiResponse = await res.json();
        if (json.success) {
          setBookings(json.bookings || []);
          setGrids(json.grids || {});
          setBlackoutsMap(json.blackouts || {});
          setToday(json.today || '');
        }
      } else {
        toast.error('상담 예약 데이터를 가져오지 못했습니다.');
      }
    } catch {
      toast.error('네트워크 에러가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStudents = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/students', { cache: 'no-store', credentials: 'same-origin' });
      if (res.ok) {
        const json = await res.json();
        if (json.success) setAllStudents(json.data || []);
      }
    } catch { /* 검색용 보조 데이터라 실패해도 치명적이지 않음 */ }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/auth/me', { cache: 'no-store' });
        if (!res.ok) { router.replace('/admin'); return; }
        const me = await res.json();
        const c = typeof me?.campus === 'string' ? me.campus : 'all';
        setSessionCampus(c);
        setCampus((c === 'all' ? 'wonju' : c) as Campus);
        await Promise.all([loadData(), loadStudents()]);
      } catch {
        router.replace('/admin');
      } finally {
        setCheckingAuth(false);
      }
    })();
  }, [router, loadData, loadStudents]);

  const handleLogout = async () => {
    try { await fetch('/api/admin/auth/logout', { method: 'POST' }); router.replace('/admin'); } catch {}
  };

  const grid: DaySlotGrid[] = grids[campus] || [];

  // 선택 센터의 추가/긴급 신청 (대기)
  const extraRequests = useMemo(
    () => bookings.filter((b) => b.campus === campus && b.kind === 'extra' && b.status === 'booked'),
    [bookings, campus],
  );

  // 관리자 직접 예약: 선택 센터 소속 학생만
  const campusStudents = useMemo(
    () => allStudents.filter((s) => s.campus === campus && (!studentSearch || s.name.includes(studentSearch))),
    [allStudents, campus, studentSearch],
  );

  // 직접 예약용 날짜 옵션(grid의 운영일) + 선택일의 빈 슬롯
  const assignDayOptions = grid;
  const assignFreeSlots = useMemo(() => {
    const day = grid.find((d) => d.date === assignDate);
    if (!day) return [];
    return day.slots.filter((s) => !s.booking).map((s) => s.slot);
  }, [grid, assignDate]);

  const openStudentSheet = (studentId: string) => {
    const student = allStudents.find((s) => s.id === studentId);
    if (!student) { toast.error('학생 정보를 찾을 수 없습니다.'); return; }
    openStudent(student, {
      onUpdate: (updated) => setAllStudents((prev) => prev.map((s) => s.id === updated.id ? updated : s)),
      onDelete: (id) => setAllStudents((prev) => prev.filter((s) => s.id !== id)),
      allStudents,
      defaultTab: 'info',
    });
  };

  // 공통 PATCH 호출
  const patchBooking = async (booking: ConsultationBooking, patch: Record<string, unknown>, key: string) => {
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      const res = await fetch('/api/admin/consultation-bookings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campus: booking.campus, id: booking.id, ...patch }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        await loadData();
        return true;
      }
      toast.error(json.message || '처리에 실패했습니다.');
      return false;
    } catch {
      toast.error('네트워크 에러가 발생했습니다.');
      return false;
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  };

  const cancelBooking = async (booking: ConsultationBooking) => {
    if (!window.confirm('이 예약을 취소하시겠습니까?')) return;
    const ok = await patchBooking(booking, { status: 'cancelled' }, `cancel_${booking.id}`);
    if (ok) toast.success('예약을 취소했습니다.');
  };

  const markDone = async (booking: ConsultationBooking) => {
    const ok = await patchBooking(booking, { status: 'done' }, `done_${booking.id}`);
    if (ok) toast.success('처리완료로 표시했습니다.');
  };

  const resolveBooking = async (bk: ConsultationBooking, status: 'done' | 'noshow') => {
    const ok = await patchBooking(bk, { status }, `resolve_${bk.id}`);
    if (ok) toast.success(status === 'done' ? '완료 처리했어요' : '노쇼로 기록했어요');
  };

  async function openCompleteModal(booking: ConsultationBooking) {
    setCompleteTarget(booking);
    setNoteDraft('[상담 메모]\n');
    try {
      const res = await fetch(`/api/admin/students/${booking.studentId}`);
      const json = await res.json();
      if (json.success && json.data) {
        const digest = buildConsultationDigest(json.data, booking.date);
        const prefilled = digest.length
          ? `[그날 변경사항]\n${digest.map((d) => `- ${d.label}${d.detail ? ` (${d.detail})` : ''}`).join('\n')}\n\n[상담 메모]\n`
          : '[상담 메모]\n';
        setNoteDraft(prefilled);
      }
    } catch {
      // 조회 실패해도 기본 폼으로 진행
    }
  }

  async function submitComplete() {
    if (!completeTarget) return;
    const b = completeTarget;
    setCompleteBusy(true);
    try {
      const noteRes = await fetch(`/api/admin/students/${b.studentId}/consultation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: b.date, content: noteDraft, type: 'learning' }),
      });
      const noteJson = await noteRes.json();
      if (!noteJson.success) { toast.error(noteJson.message || '상담 기록 저장 실패'); return; }
      const newLogId: string | undefined = noteJson.data?.consultationLogs?.[0]?.id;

      const patchRes = await fetch('/api/admin/consultation-bookings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campus: b.campus, id: b.id, status: 'done', ...(newLogId ? { logId: newLogId } : {}) }),
      });
      const patchJson = await patchRes.json();
      if (!patchJson.success) { toast.error(patchJson.message || '완료 처리 실패'); return; }

      toast.success('상담 완료로 기록했어요');
      setCompleteTarget(null);
      setNoteDraft('');
      await loadData();
    } finally {
      setCompleteBusy(false);
    }
  }

  const assignExtraToSlot = async (booking: ConsultationBooking, date: string, slot: string, counselor: string) => {
    const ok = await patchBooking(
      booking,
      { status: 'done', date, slot, counselor, adminReply: `${dateLabel(date)} ${slot} 슬롯으로 배정되었습니다.` },
      `assign_${booking.id}`,
    );
    if (ok) toast.success('슬롯에 배정했습니다.');
  };

  const directAssign = async () => {
    if (!assignStudentId || !assignDate || !assignSlot) {
      toast.error('학생·날짜·시간을 모두 선택해 주세요.');
      return;
    }
    const key = 'direct_assign';
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      const res = await fetch('/api/admin/consultation-bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: assignStudentId, date: assignDate, slot: assignSlot }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success('예약을 등록했습니다.');
        setAssignStudentId('');
        setAssignSlot('');
        await loadData();
      } else {
        toast.error(json.message || '예약 등록에 실패했습니다.');
      }
    } catch {
      toast.error('네트워크 에러가 발생했습니다.');
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  };

  const saveBlackouts = async (c: string, next: BlackoutEntry[]) => {
    const res = await fetch('/api/admin/consultation-bookings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campus: c, blackouts: next }),
    });
    const json = await res.json();
    if (!json.success) { alert(json.message || '차단 저장 실패'); return; }
    await loadData();
  };

  const toggleFullday = (c: string, date: string, current: BlackoutEntry[]) => {
    const existing = current.find((b) => b.date === date);
    const next = existing && existing.scope === 'fullday'
      ? current.filter((b) => b.date !== date)
      : [...current.filter((b) => b.date !== date), { date, scope: 'fullday' as const, reason: '휴무' }];
    return saveBlackouts(c, next);
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center justify-center font-sans">
        <Loader2 className="w-8 h-8 text-[#0071E3] animate-spin mb-4" />
        <p className="text-sm text-[#86868B]">상담 예약 정보 로드 중...</p>
      </div>
    );
  }

  const campusOptions = allowedCampuses.map((c) => ({ value: c, label: campusLabel(c) }));

  return (
    <div className="admin-fluid-ui ios-app-bg min-h-screen text-[#1D1D1F] font-sans">
      <AdminTopNav
        title="상담 예약"
        titleIcon={<CalendarClock className="w-4 h-4 text-[#0071E3]" />}
        campusOptions={campusOptions}
        campusValue={campus}
        onCampusChange={(v) => setCampus(v as Campus)}
        onLogout={handleLogout}
        actions={
          <Button size="sm" variant="outline" onClick={loadData} className="rounded-2xl border-black/[0.05] text-xs h-9 bg-white px-3 shadow-sm" title="새로고침">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        }
      />

      <main className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">
        {/* 추가/긴급 신청 */}
        <section className="bg-white rounded-2xl border border-black/[0.05] shadow-sm p-4 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <h2 className="text-sm font-black text-[#1D1D1F]">추가 · 긴급 상담 신청</h2>
            <span className="text-[11px] font-bold text-[#86868B]">{extraRequests.length}건 대기</span>
          </div>
          {extraRequests.length === 0 ? (
            <p className="text-[11px] text-[#86868B] py-2">대기 중인 추가·긴급 신청이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {extraRequests.map((b) => (
                <div key={b.id} className="rounded-xl border border-amber-200/70 bg-amber-50/60 px-3 py-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <button type="button" onClick={() => openStudentSheet(b.studentId)} className="text-[13px] font-extrabold text-[#0071E3] hover:underline">
                      {b.studentName}
                    </button>
                    <span className="text-[10px] font-bold text-[#86868B]">{new Date(b.createdAt).toLocaleDateString('ko-KR')}</span>
                  </div>
                  {b.reason && <p className="text-[11px] font-semibold text-[#1D1D1F] leading-relaxed break-all">{b.reason}</p>}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button size="sm" disabled={busy[`done_${b.id}`]} onClick={() => markDone(b)} className="h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-3">
                      {busy[`done_${b.id}`] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}처리완료
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy[`cancel_${b.id}`]} onClick={() => cancelBooking(b)} className="h-8 rounded-lg border-red-200 text-red-600 hover:bg-red-50 text-[11px] font-bold px-3">
                      <X className="w-3.5 h-3.5 mr-1" />취소
                    </Button>
                    {/* 빈 슬롯으로 배정 */}
                    <AssignSlotInline grid={grid} disabled={!!busy[`assign_${b.id}`]} onAssign={(date, slot, counselor) => assignExtraToSlot(b, date, slot, counselor)} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 관리자 직접 예약 */}
        <section className="bg-white rounded-2xl border border-black/[0.05] shadow-sm p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-[#0071E3]" />
            <h2 className="text-sm font-black text-[#1D1D1F]">관리자 직접 예약</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="md:col-span-2 space-y-1.5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868B]" />
                <Input placeholder="학생 이름 검색" value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)}
                  className="pl-9 rounded-xl border-black/[0.08] text-xs h-9 bg-[#F5F5F7]" />
              </div>
              <select value={assignStudentId} onChange={(e) => setAssignStudentId(e.target.value)}
                className="w-full h-9 rounded-xl border border-black/[0.08] bg-white px-2 text-xs font-semibold">
                <option value="">학생 선택 ({campusLabel(campus)})</option>
                {campusStudents.slice(0, 100).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}{s.manager ? ` · ${s.manager}` : ''}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <span className="text-[11px] font-extrabold text-[#86868B]">날짜</span>
              <select value={assignDate} onChange={(e) => { setAssignDate(e.target.value); setAssignSlot(''); }}
                className="w-full h-9 rounded-xl border border-black/[0.08] bg-white px-2 text-xs font-semibold">
                <option value="">운영일 선택</option>
                {assignDayOptions.map((d) => (
                  <option key={d.date} value={d.date}>{dateLabel(d.date, d.weekday)} · {d.counselor}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <span className="text-[11px] font-extrabold text-[#86868B]">시간</span>
              <select value={assignSlot} onChange={(e) => setAssignSlot(e.target.value)} disabled={!assignDate}
                className="w-full h-9 rounded-xl border border-black/[0.08] bg-white px-2 text-xs font-semibold disabled:opacity-50">
                <option value="">빈 슬롯 선택</option>
                {assignFreeSlots.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <Button size="sm" disabled={busy['direct_assign'] || !assignStudentId || !assignDate || !assignSlot} onClick={directAssign}
            className="h-9 rounded-xl bg-[#0071E3] hover:bg-[#0071E3]/90 text-white text-xs font-bold px-4">
            {busy['direct_assign'] ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Plus className="w-3.5 h-3.5 mr-1" />}예약 등록
          </Button>
        </section>

        {/* 타임테이블 */}
        <section className="space-y-3">
          {(() => {
            const campusBookings = bookings.filter((b) => b.campus === campus);
            const s = consultationStats(campusBookings);
            return (
              <div className="flex items-center gap-2 px-1 flex-wrap">
                <CalendarClock className="w-4 h-4 text-[#0071E3]" />
                <h2 className="text-sm font-black text-[#1D1D1F]">{campusLabel(campus)} 상담 타임테이블</h2>
                <span className="text-[11px] font-bold text-[#86868B]">앞 요일부터 채워집니다</span>
                <span className="ml-auto text-[11px] font-bold text-[#86868B]">
                  신청 {s.total} · 완료 {s.done} · 노쇼 {s.noshow} (노쇼율 {s.noshowRate}%)
                </span>
              </div>
            );
          })()}


          {loading ? (
            <div className="text-center py-20 bg-white border border-black/[0.05] rounded-3xl flex flex-col items-center">
              <Loader2 className="w-8 h-8 text-[#0071E3] animate-spin mb-4" />
              <p className="text-xs text-[#86868B]">불러오는 중...</p>
            </div>
          ) : grid.length === 0 ? (
            <div className="text-center py-20 bg-white border border-dashed border-black/[0.08] rounded-3xl text-xs text-[#86868B]">
              예정된 운영일이 없습니다.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-black/[0.05] bg-white shadow-sm">
              <table className="w-full border-collapse text-center text-[11px]">
                <thead>
                  <tr className="bg-[#F5F5F7]">
                    <th className="sticky left-0 z-10 bg-[#F5F5F7] px-3 py-2 text-left font-extrabold text-[#86868B] border-b border-black/[0.05]">시간</th>
                    {grid.map((d) => {
                      const full = d.slots.every((s) => s.booking);
                      const isToday = d.date === today;
                      const campusBlackouts = blackoutsMap[campus] || [];
                      const bo = campusBlackouts.find((b) => b.date === d.date);
                      const isFulldayBlocked = bo?.scope === 'fullday';
                      return (
                        <th key={d.date} className={`px-2 py-2 font-black border-b border-l border-black/[0.05] min-w-[88px] ${isToday ? 'text-[#0071E3]' : 'text-[#1D1D1F]'}`}>
                          <div>{dateLabel(d.date, d.weekday)}</div>
                          <div className="text-[10px] font-bold text-[#86868B]">{d.counselor}</div>
                          {full && <span className="inline-block mt-0.5 rounded-full bg-red-100 px-1.5 text-[9px] font-black text-red-600">만석</span>}
                          <button
                            type="button"
                            onClick={() => toggleFullday(campus, d.date, campusBlackouts)}
                            title={isFulldayBlocked ? '휴무 해제' : '종일 휴무 설정'}
                            className={`mt-1 inline-block rounded-full px-1.5 text-[9px] font-black transition-colors ${isFulldayBlocked ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-[#F5F5F7] text-[#86868B] hover:bg-amber-50 hover:text-amber-600'}`}
                          >
                            {isFulldayBlocked ? '휴무중' : '휴무'}
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const nowHHMM = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
                    return CONSULTATION_SLOT_TIMES.map((slot) => (
                      <tr key={slot} className="border-b border-black/[0.03] last:border-0">
                        <td className="sticky left-0 z-10 bg-white px-3 py-1.5 text-left font-bold text-[#86868B] border-r border-black/[0.04]">{slot}</td>
                        {grid.map((d) => {
                          const cell = d.slots.find((s) => s.slot === slot);
                          const bk = cell?.booking || null;
                          const isPast = bk ? (bk.date < today || (bk.date === today && bk.slot <= nowHHMM)) : false;
                          return (
                            <td key={d.date + slot} className="px-1.5 py-1.5 border-l border-black/[0.03] align-middle">
                              {bk ? (
                                <div className="space-y-1">
                                  <button
                                    type="button"
                                    onClick={() => openStudentSheet(bk.studentId)}
                                    title="학생 정보 보기"
                                    className={`w-full rounded-lg px-1.5 py-1 text-[11px] font-bold transition-colors ${
                                      bk.status === 'done'
                                        ? 'bg-emerald-50 text-emerald-700'
                                        : bk.status === 'noshow'
                                        ? 'bg-amber-50 text-amber-700'
                                        : 'bg-[#0071E3]/10 text-[#0071E3] hover:bg-red-50 hover:text-red-600'
                                    }`}
                                  >
                                    {bk.studentName}
                                  </button>
                                  {bk.status === 'done' && (
                                    <span className="inline-block w-full rounded-full bg-emerald-100 px-1.5 py-0.5 text-center text-[9px] font-black text-emerald-700">완료</span>
                                  )}
                                  {bk.status === 'noshow' && (
                                    <span className="inline-block w-full rounded-full bg-amber-100 px-1.5 py-0.5 text-center text-[9px] font-black text-amber-700">노쇼</span>
                                  )}
                                  {isPast && bk.status === 'booked' && (
                                    <div className="flex gap-0.5">
                                      <button
                                        type="button"
                                        disabled={!!busy[`resolve_${bk.id}`]}
                                        onClick={() => openCompleteModal(bk)}
                                        className="flex-1 rounded-md bg-emerald-500 px-1 py-0.5 text-[9px] font-black text-white hover:bg-emerald-600 transition-colors disabled:opacity-50"
                                      >
                                        완료
                                      </button>
                                      <button
                                        type="button"
                                        disabled={!!busy[`resolve_${bk.id}`]}
                                        onClick={() => resolveBooking(bk, 'noshow')}
                                        className="flex-1 rounded-md bg-rose-500 px-1 py-0.5 text-[9px] font-black text-white hover:bg-rose-600 transition-colors disabled:opacity-50"
                                      >
                                        {busy[`resolve_${bk.id}`] ? '…' : '노쇼'}
                                      </button>
                                    </div>
                                  )}
                                  {!isPast && bk.status === 'booked' && (
                                    <button
                                      type="button"
                                      onClick={() => cancelBooking(bk)}
                                      title="클릭하여 예약 취소"
                                      className="w-full rounded-md bg-[#F5F5F7] px-1 py-0.5 text-[9px] font-bold text-[#86868B] hover:bg-red-50 hover:text-red-600 transition-colors"
                                    >
                                      취소
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <span className="text-[#C7C7CC]">·</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {/* 완료 처리 모달 */}
      {completeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <div
            className="w-full max-w-lg rounded-3xl border border-white/20 shadow-2xl p-6 space-y-4"
            style={{
              background: 'rgba(255,255,255,0.82)',
              backdropFilter: 'blur(28px) saturate(180%)',
              WebkitBackdropFilter: 'blur(28px) saturate(180%)',
            }}
          >
            <h3 className="text-sm font-black text-[#1D1D1F] leading-snug">
              {completeTarget.studentName} · {completeTarget.date} {completeTarget.slot} 상담 완료
            </h3>
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              rows={6}
              className="w-full rounded-2xl border border-black/[0.08] bg-white/60 px-3 py-2.5 text-[12px] font-medium text-[#1D1D1F] leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-[#0071E3]/30"
              placeholder="상담 내용을 작성하세요"
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => { setCompleteTarget(null); setNoteDraft(''); }}
                className="h-9 rounded-2xl bg-[#F5F5F7] px-4 text-[12px] font-bold text-[#1D1D1F] hover:bg-[#E5E5EA] transition-colors"
              >
                닫기
              </button>
              <button
                type="button"
                disabled={completeBusy}
                onClick={submitComplete}
                className="h-9 rounded-2xl bg-emerald-500 px-5 text-[12px] font-black text-white hover:bg-emerald-600 transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {completeBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                완료 저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 추가/긴급 신청을 실제 빈 슬롯으로 배정하는 인라인 셀렉터
function AssignSlotInline({
  grid,
  disabled,
  onAssign,
}: {
  grid: DaySlotGrid[];
  disabled: boolean;
  onAssign: (date: string, slot: string, counselor: string) => void;
}) {
  const [date, setDate] = useState('');
  const [slot, setSlot] = useState('');
  const day = grid.find((d) => d.date === date);
  const freeSlots = day ? day.slots.filter((s) => !s.booking).map((s) => s.slot) : [];

  return (
    <div className="flex items-center gap-1.5">
      <select value={date} onChange={(e) => { setDate(e.target.value); setSlot(''); }}
        className="h-8 rounded-lg border border-black/[0.08] bg-white px-1.5 text-[10px] font-semibold">
        <option value="">날짜</option>
        {grid.map((d) => <option key={d.date} value={d.date}>{dateLabel(d.date, d.weekday)}</option>)}
      </select>
      <select value={slot} onChange={(e) => setSlot(e.target.value)} disabled={!date}
        className="h-8 rounded-lg border border-black/[0.08] bg-white px-1.5 text-[10px] font-semibold disabled:opacity-50">
        <option value="">시간</option>
        {freeSlots.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <Button size="sm" variant="outline" disabled={disabled || !date || !slot}
        onClick={() => { onAssign(date, slot, day?.counselor || ''); setDate(''); setSlot(''); }}
        className="h-8 rounded-lg border-black/[0.08] text-[10px] font-bold px-2">슬롯배정</Button>
    </div>
  );
}
