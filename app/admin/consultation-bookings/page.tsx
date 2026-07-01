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

// 예약 출처(source) 시각 규약 — 이중부호화(색+텍스트/아이콘).
// 대리(관리자) 계열은 sky 톤, 셀프(학생) 계열은 중립 회색. 색 단독 금지.
// 상태색(완료=emerald, 노쇼=amber/rose, 변경요청=amber, 관리자제안=sky)과 겹치지 않게
// 출처 표시는 항상 짧은 텍스트/도트를 동반한다.
const SOURCE_META: Record<'admin' | 'student', { label: string; short: string; dot: string; chip: string }> = {
  admin: {
    label: '대리 예약',
    short: '대리',
    dot: 'bg-sky-500',
    chip: 'bg-sky-100 text-sky-700',
  },
  student: {
    label: '셀프 예약',
    short: '셀프',
    dot: 'bg-slate-400',
    chip: 'bg-slate-100 text-slate-600',
  },
};

function sourceMeta(src: ConsultationBooking['source']) {
  return SOURCE_META[src === 'admin' ? 'admin' : 'student'];
}

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
  const [pendingLogId, setPendingLogId] = useState<string | null>(null);

  // 관리자 직접 예약 폼
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [assignStudentId, setAssignStudentId] = useState('');
  const [assignDate, setAssignDate] = useState('');
  const [assignSlot, setAssignSlot] = useState('');

  // 시간 변경 제안 모달
  const [rsTarget, setRsTarget] = useState<ConsultationBooking | null>(null);
  const [rsDate, setRsDate] = useState('');
  const [rsSlot, setRsSlot] = useState('');
  const [rsReason, setRsReason] = useState('');

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

  // 선택 센터의 시간 변경 대기 건 (학생 요청 → 관리자 승인 / 관리자 제안 → 학생 승인 대기)
  const rescheduleRequests = useMemo(
    () => bookings.filter((b) => b.campus === campus && b.kind === 'regular' && b.status === 'booked' && b.reschedule),
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
      // 실패를 false로 반환 → 호출부(모달·폼)는 성공 시에만 리셋하므로 입력값이 보존됨.
      toast.error('네트워크 오류가 발생했어요. 입력값은 유지했으니 다시 시도해 주세요.');
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
    setPendingLogId(null);
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
      let logId = pendingLogId;
      if (!logId) {
        const noteRes = await fetch(`/api/admin/students/${b.studentId}/consultation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: b.date, content: noteDraft, type: 'learning' }),
        });
        const noteJson = await noteRes.json();
        if (!noteJson.success) { toast.error(noteJson.message || '상담 기록 저장 실패'); return; }
        logId = noteJson.data?.consultationLogs?.[0]?.id || null;
        setPendingLogId(logId);
      }

      const patchRes = await fetch('/api/admin/consultation-bookings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campus: b.campus, id: b.id, status: 'done', ...(logId ? { logId } : {}) }),
      });
      const patchJson = await patchRes.json();
      if (!patchJson.success) {
        toast.error((patchJson.message || '완료 처리 실패') + ' (메모는 저장됨 — 다시 시도해 주세요)');
        return; // pendingLogId 보존 → 재시도 시 노트 중복 생성 안 함
      }

      // 성공 시에만 모달·초안 리셋.
      toast.success('상담 완료로 기록했어요');
      setCompleteTarget(null);
      setNoteDraft('');
      setPendingLogId(null);
      await loadData();
    } catch {
      // 네트워크 오류 — 메모/모달 유지(pendingLogId 보존 → 재시도 시 노트 중복 방지).
      toast.error('네트워크 오류가 발생했어요. 작성한 메모는 유지했으니 다시 시도해 주세요.');
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

  // 학생 변경 요청 승인/거절
  const approveReschedule = async (b: ConsultationBooking) => {
    const ok = await patchBooking(b, { action: 'approve' }, `rs_${b.id}`);
    if (ok) toast.success('변경 요청을 승인했어요.');
  };
  const rejectReschedule = async (b: ConsultationBooking) => {
    if (!window.confirm('이 변경 요청을 거절할까요?')) return;
    const ok = await patchBooking(b, { action: 'reject' }, `rs_${b.id}`);
    if (ok) toast.success('변경 요청을 거절했어요.');
  };
  // 관리자 제안 철회
  const cancelRescheduleProposal = async (b: ConsultationBooking) => {
    const ok = await patchBooking(b, { action: 'cancel' }, `rs_${b.id}`);
    if (ok) toast.success('변경 제안을 철회했어요.');
  };

  // 변경 제안 모달 열기/제출
  const openReschedule = (b: ConsultationBooking) => {
    setRsTarget(b);
    setRsDate('');
    setRsSlot('');
    setRsReason('');
  };
  const rsFreeSlots = useMemo(() => {
    const day = grid.find((d) => d.date === rsDate);
    if (!day) return [];
    // 자기 자신 슬롯은 비어있지 않게 잡히므로, 현재 예약 슬롯도 후보에서 제외(같은 시간 제안 방지).
    return day.slots.filter((s) => !s.booking).map((s) => s.slot);
  }, [grid, rsDate]);
  const submitReschedule = async () => {
    if (!rsTarget || !rsDate || !rsSlot) { toast.error('날짜와 시간을 선택해 주세요.'); return; }
    const ok = await patchBooking(rsTarget, { action: 'request', date: rsDate, slot: rsSlot, reason: rsReason.trim() || undefined }, `rs_${rsTarget.id}`);
    if (ok) { toast.success('학생에게 시간 변경을 제안했어요. 학생 승인 후 확정돼요.'); setRsTarget(null); }
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
        // 성공 시에만 폼 리셋(선택 학생·시간). 날짜는 연속 예약을 위해 유지.
        toast.success('예약을 등록했습니다.');
        setAssignStudentId('');
        setAssignSlot('');
        await loadData();
      } else {
        // 실패 시 선택값 보존 — 사용자가 다시 고르지 않아도 됨.
        toast.error((json.message || '예약 등록에 실패했습니다.') + ' 선택값은 유지했어요.');
      }
    } catch {
      // 네트워크 오류 — 폼 리셋하지 않음.
      toast.error('네트워크 오류로 예약 등록에 실패했어요. 선택값은 유지했어요.');
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
                  {b.reason && <p className="text-[11px] font-semibold text-[#1D1D1F] leading-relaxed break-words">{b.reason}</p>}
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

        {/* 상담 시간 변경 (양방향 승인) */}
        {rescheduleRequests.length > 0 && (
          <section className="bg-white rounded-2xl border border-black/[0.05] shadow-sm p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-[#0071E3]" />
              <h2 className="text-sm font-black text-[#1D1D1F]">상담 시간 변경</h2>
              <span className="text-[11px] font-bold text-[#86868B]">{rescheduleRequests.length}건</span>
            </div>
            <div className="space-y-2">
              {rescheduleRequests.map((b) => {
                const rs = b.reschedule!;
                const fromAdmin = rs.by === 'admin';
                return (
                  <div key={b.id} className={`rounded-xl border px-3 py-2.5 space-y-2 ${fromAdmin ? 'border-sky-200/70 bg-sky-50/60' : 'border-amber-200/70 bg-amber-50/60'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <button type="button" onClick={() => openStudentSheet(b.studentId)} className="text-[13px] font-extrabold text-[#0071E3] hover:underline">
                          {b.studentName}
                        </button>
                        {(() => { const sm = sourceMeta(b.source); return (
                          <span className={`shrink-0 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-black ${sm.chip}`} title={`예약 출처 · ${sm.label}`}>
                            <span className={`w-1 h-1 rounded-full ${sm.dot}`} />{sm.short}
                          </span>
                        ); })()}
                      </div>
                      <span className={`shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full ${fromAdmin ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}`}>
                        {fromAdmin ? '학생 승인 대기' : '학생 변경 요청'}
                      </span>
                    </div>
                    <p className="text-[11px] font-semibold text-[#1D1D1F]">
                      {dateLabel(b.date, b.weekday)} {b.slot}
                      <span className="mx-1 text-[#86868B]">→</span>
                      <span className="font-black text-[#0071E3]">{dateLabel(rs.date, rs.weekday)} {rs.slot}</span>
                    </p>
                    {rs.reason && <p className="text-[11px] font-semibold text-[#86868B] break-words">사유: {rs.reason}</p>}
                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      {fromAdmin ? (
                        <Button size="sm" variant="outline" disabled={busy[`rs_${b.id}`]} onClick={() => cancelRescheduleProposal(b)} className="h-8 rounded-lg border-black/[0.08] text-[11px] font-bold px-3">
                          {busy[`rs_${b.id}`] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5 mr-1" />}제안 철회
                        </Button>
                      ) : (
                        <>
                          <Button size="sm" disabled={busy[`rs_${b.id}`]} onClick={() => approveReschedule(b)} className="h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-3">
                            {busy[`rs_${b.id}`] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}승인
                          </Button>
                          <Button size="sm" variant="outline" disabled={busy[`rs_${b.id}`]} onClick={() => rejectReschedule(b)} className="h-8 rounded-lg border-red-200 text-red-600 hover:bg-red-50 text-[11px] font-bold px-3">
                            <X className="w-3.5 h-3.5 mr-1" />거절
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

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


          {loading && !today ? (
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
                                  {(() => { const sm = sourceMeta(bk.source); return (
                                  <button
                                    type="button"
                                    onClick={() => openStudentSheet(bk.studentId)}
                                    title={`학생 정보 보기 · ${sm.label}`}
                                    className={`relative w-full rounded-lg px-1.5 py-1 text-[11px] font-bold transition-colors ${
                                      bk.status === 'done'
                                        ? 'bg-emerald-50 text-emerald-700'
                                        : bk.status === 'noshow'
                                        ? 'bg-amber-50 text-amber-700'
                                        : 'bg-[#0071E3]/10 text-[#0071E3] hover:bg-red-50 hover:text-red-600'
                                    }`}
                                  >
                                    <span
                                      className={`absolute right-1 top-1 w-1.5 h-1.5 rounded-full ${sm.dot}`}
                                      title={sm.label}
                                      aria-label={sm.label}
                                    />
                                    {bk.studentName}
                                  </button>
                                  ); })()}
                                  {(() => { const sm = sourceMeta(bk.source); return (
                                    <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-black ${sm.chip}`} title={sm.label}>
                                      <span className={`w-1 h-1 rounded-full ${sm.dot}`} />{sm.short}
                                    </span>
                                  ); })()}
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
                                  {bk.reschedule && (
                                    <span className={`inline-block w-full rounded-full px-1.5 py-0.5 text-center text-[9px] font-black ${bk.reschedule.by === 'admin' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}`}>
                                      {bk.reschedule.by === 'admin' ? '학생승인대기' : '변경요청'}
                                    </span>
                                  )}
                                  {!isPast && bk.status === 'booked' && !bk.reschedule && (
                                    <div className="flex gap-0.5">
                                      <button
                                        type="button"
                                        onClick={() => openReschedule(bk)}
                                        title="시간 변경 제안"
                                        className="flex-1 rounded-md bg-[#F5F5F7] px-1 py-0.5 text-[9px] font-bold text-[#86868B] hover:bg-[#0071E3]/10 hover:text-[#0071E3] transition-colors"
                                      >
                                        변경
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => cancelBooking(bk)}
                                        title="클릭하여 예약 취소"
                                        className="flex-1 rounded-md bg-[#F5F5F7] px-1 py-0.5 text-[9px] font-bold text-[#86868B] hover:bg-red-50 hover:text-red-600 transition-colors"
                                      >
                                        취소
                                      </button>
                                    </div>
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

      {/* 시간 변경 제안 모달 */}
      {rsTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <div
            className="w-full max-w-md rounded-3xl border border-white/20 shadow-2xl p-6 space-y-4"
            style={{ background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(28px) saturate(180%)', WebkitBackdropFilter: 'blur(28px) saturate(180%)' }}
          >
            <h3 className="text-sm font-black text-[#1D1D1F] leading-snug">
              {rsTarget.studentName} · 시간 변경 제안
            </h3>
            <p className="text-[12px] font-bold text-[#86868B]">
              현재 {dateLabel(rsTarget.date, rsTarget.weekday)} {rsTarget.slot} → 새 시간을 제안하면 학생 승인 후 확정됩니다.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <span className="text-[11px] font-extrabold text-[#86868B]">날짜</span>
                <select value={rsDate} onChange={(e) => { setRsDate(e.target.value); setRsSlot(''); }}
                  className="w-full h-9 rounded-xl border border-black/[0.08] bg-white px-2 text-xs font-semibold">
                  <option value="">운영일 선택</option>
                  {grid.map((d) => <option key={d.date} value={d.date}>{dateLabel(d.date, d.weekday)} · {d.counselor}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <span className="text-[11px] font-extrabold text-[#86868B]">시간</span>
                <select value={rsSlot} onChange={(e) => setRsSlot(e.target.value)} disabled={!rsDate}
                  className="w-full h-9 rounded-xl border border-black/[0.08] bg-white px-2 text-xs font-semibold disabled:opacity-50">
                  <option value="">빈 슬롯 선택</option>
                  {rsFreeSlots.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <textarea
              value={rsReason}
              onChange={(e) => setRsReason(e.target.value)}
              rows={2}
              maxLength={300}
              placeholder="변경 사유(선택) — 예) 담당자 일정 조정"
              className="w-full rounded-2xl border border-black/[0.08] bg-white/60 px-3 py-2.5 text-[12px] font-medium text-[#1D1D1F] leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-[#0071E3]/30"
            />
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setRsTarget(null)}
                className="h-9 rounded-2xl bg-[#F5F5F7] px-4 text-[12px] font-bold text-[#1D1D1F] hover:bg-[#E5E5EA] transition-colors">
                닫기
              </button>
              <button type="button" disabled={busy[`rs_${rsTarget.id}`] || !rsDate || !rsSlot} onClick={submitReschedule}
                className="h-9 rounded-2xl bg-[#0071E3] px-5 text-[12px] font-black text-white hover:bg-[#0071E3]/90 transition-colors disabled:opacity-50 flex items-center gap-1.5">
                {busy[`rs_${rsTarget.id}`] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                변경 제안 보내기
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
