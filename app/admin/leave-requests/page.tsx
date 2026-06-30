'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Loader2, CalendarHeart, Search, Check, X, ChevronDown, RefreshCw, Ticket, Minus, Plus, Inbox,
} from 'lucide-react';
import { toast } from 'sonner';
import { Student, LeaveRequest, LeaveType } from '@/lib/types/student';
import { LEAVE_TYPES, LEAVE_TYPE_ORDER, formatLeaveLabel, COUPONS_PER_EXTRA_HALFDAY } from '@/lib/leave';
import { AdminTopNav } from '@/components/admin/admin-top-nav';
import { useAdminGlobalSheet } from '@/components/admin/admin-global-context';

const CAMPUS_FILTERS = ['all', 'wonju', 'chuncheon', 'chungju'];
type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';
type ScopeFilter = 'upcoming' | 'today' | 'date' | 'all';

function campusLabel(val: string) {
  switch (val) {
    case 'wonju': return '원주';
    case 'chuncheon': return '춘천';
    case 'chungju': return '충주';
    case 'all': return '전체';
    default: return '기타';
  }
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
function dateLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  const dow = WEEKDAYS[new Date(y, m - 1, d).getDay()] ?? '';
  return `${m}월 ${d}일 (${dow})`;
}

interface LeaveEvent {
  student: Student;
  request: LeaveRequest;
}

export default function AdminLeaveRequestsPage() {
  const router = useRouter();
  const { openStudent } = useAdminGlobalSheet();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  const [campusFilter, setCampusFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<LeaveType | 'all'>('all');
  const [scope, setScope] = useState<ScopeFilter>('upcoming');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);
  const [pickedDate, setPickedDate] = useState(todayStr);

  const monthPrefix = useMemo(() => todayStr.slice(0, 7), [todayStr]);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/students', { cache: 'no-store', credentials: 'same-origin' });
      if (res.ok) {
        const json = await res.json();
        if (json.success) setStudents(json.data || []);
      } else {
        toast.error('학생 데이터를 가져오지 못했습니다.');
      }
    } catch {
      toast.error('네트워크 에러가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/auth/me');
        if (!res.ok) { router.replace('/admin'); return; }
        await loadStudents();
      } catch {
        router.replace('/admin');
      } finally {
        setCheckingAuth(false);
      }
    })();
  }, [router, loadStudents]);

  const handleLogout = async () => {
    try { await fetch('/api/admin/auth/logout', { method: 'POST' }); router.replace('/admin'); } catch {}
  };

  // 전체 휴식·반차 신청 집계 (필터 적용)
  const events: LeaveEvent[] = useMemo(() => {
    const out: LeaveEvent[] = [];
    for (const s of students) {
      if (campusFilter !== 'all' && s.campus !== campusFilter) continue;
      if (search && !s.name.toLowerCase().includes(search.toLowerCase())) continue;
      for (const r of s.leaveRequests || []) {
        if (statusFilter !== 'all' && r.status !== statusFilter) continue;
        if (typeFilter !== 'all' && r.type !== typeFilter) continue;
        if (scope === 'today' && r.date !== todayStr) continue;
        if (scope === 'upcoming' && r.date < todayStr) continue;
        if (scope === 'date' && r.date !== pickedDate) continue;
        out.push({ student: s, request: r });
      }
    }
    // 대기 우선, 그다음 날짜 오름차순(다가오는 순)
    const rank = (st: string) => (st === 'pending' ? 0 : st === 'approved' ? 1 : 2);
    return out.sort((a, b) => {
      const dr = rank(a.request.status) - rank(b.request.status);
      if (dr !== 0) return dr;
      const dd = a.request.date.localeCompare(b.request.date);
      if (dd !== 0) return dd;
      return a.student.name.localeCompare(b.student.name, 'ko');
    });
  }, [students, campusFilter, search, statusFilter, typeFilter, scope, todayStr, pickedDate]);

  // 날짜별 그룹 (표시 순서 유지)
  const grouped = useMemo(() => {
    const map = new Map<string, LeaveEvent[]>();
    for (const ev of events) {
      const arr = map.get(ev.request.date) || [];
      arr.push(ev);
      map.set(ev.request.date, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [events]);

  // 전역 카운트 (필터 무관, 대기 강조용)
  const counts = useMemo(() => {
    let pending = 0, approvedThisMonth = 0;
    for (const s of students) {
      if (campusFilter !== 'all' && s.campus !== campusFilter) continue;
      for (const r of s.leaveRequests || []) {
        if (r.status === 'pending') pending += 1;
        else if (r.status === 'approved' && (r.date || '').startsWith(monthPrefix)) approvedThisMonth += 1;
      }
    }
    return { pending, approvedThisMonth };
  }, [students, campusFilter, monthPrefix]);

  const patchLeave = async (studentId: string, body: Record<string, unknown>, key: string) => {
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      const res = await fetch(`/api/admin/students/${studentId}/leave`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const json = await res.json();
      if (res.ok && json.success) return json;
      toast.error(json.message || '처리에 실패했습니다.');
      return null;
    } catch { toast.error('네트워크 에러가 발생했습니다.'); return null; }
    finally { setBusy((b) => ({ ...b, [key]: false })); }
  };

  const reviewRequest = async (ev: LeaveEvent, status: 'approved' | 'rejected') => {
    const key = `rev_${ev.request.id}`;
    const reply = (replyDrafts[ev.request.id] || '').trim();
    const json = await patchLeave(ev.student.id, { requestId: ev.request.id, status, reply }, key);
    if (!json) return;
    setStudents((prev) => prev.map((s) => s.id !== ev.student.id ? s : {
      ...s,
      leaveRequests: (s.leaveRequests || []).map((r) => r.id !== ev.request.id ? r : { ...r, status, adminReply: reply || r.adminReply, reviewedAt: new Date().toISOString() }),
    }));
    toast.success(status === 'approved' ? '승인했습니다. 출결판에 반영됩니다.' : '반려했습니다.');
  };

  const adjustCoupon = async (student: Student, delta: number) => {
    const key = `cp_${student.id}`;
    const json = await patchLeave(student.id, { couponDelta: delta }, key);
    if (!json) return;
    setStudents((prev) => prev.map((s) => s.id === student.id ? { ...s, leaveCoupons: json.leaveCoupons } : s));
  };

  const openStudentSheet = (student: Student) => openStudent(student, {
    onUpdate: (updated) => setStudents((prev) => prev.map((s) => s.id === updated.id ? updated : s)),
    onDelete: (id) => setStudents((prev) => prev.filter((s) => s.id !== id)),
    allStudents: students,
    defaultTab: 'info',
  });

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center justify-center font-sans">
        <Loader2 className="w-8 h-8 text-[#0071E3] animate-spin mb-4" />
        <p className="text-sm text-[#86868B]">휴식·반차 정보 로드 중...</p>
      </div>
    );
  }

  const SCOPES: [ScopeFilter, string][] = [['upcoming', '다가오는'], ['today', '오늘'], ['date', '특정일'], ['all', '전체']];
  const STATUSES: [StatusFilter, string][] = [['all', '전체'], ['pending', '대기'], ['approved', '승인'], ['rejected', '반려']];

  return (
    <div className="admin-fluid-ui ios-app-bg min-h-screen text-[#1D1D1F] font-sans">
      <AdminTopNav
        title="휴식·반차 관리"
        titleIcon={<CalendarHeart className="w-4 h-4 text-[#0071E3]" />}
        campusOptions={CAMPUS_FILTERS.map((c) => ({ value: c, label: c === 'all' ? '전체' : campusLabel(c) }))}
        campusValue={campusFilter}
        onCampusChange={setCampusFilter}
        onLogout={handleLogout}
        actions={
          <Button size="sm" variant="outline" onClick={loadStudents} className="rounded-2xl border-black/[0.05] text-xs h-9 bg-white px-3 shadow-sm" title="새로고침">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        }
      />

      <main className="max-w-4xl mx-auto p-4 md:p-8 space-y-5">
        {/* 인박스 안내 + 대기 요약 */}
        <button
          type="button"
          onClick={() => router.push('/admin/inbox')}
          className={`w-full flex items-center justify-between gap-3 rounded-2xl border p-4 text-left transition-all active:scale-[0.99] ${
            counts.pending > 0 ? 'border-amber-200/70 bg-amber-50 hover:bg-amber-100/70' : 'border-black/[0.05] bg-white hover:bg-[#F5F5F7]'
          }`}
        >
          <span className="flex items-center gap-3 min-w-0">
            <span className={`flex h-9 w-9 items-center justify-center rounded-xl shrink-0 ${counts.pending > 0 ? 'bg-amber-500 text-white' : 'bg-[#F5F5F7] text-[#86868B]'}`}>
              <Inbox className="w-4 h-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-black text-[#1D1D1F]">
                {counts.pending > 0 ? `대기 중인 휴식·반차 ${counts.pending}건` : '대기 중인 신청이 없습니다'}
              </span>
              <span className="block text-[11px] font-semibold text-[#86868B]">
                이번 달 승인 {counts.approvedThisMonth}건 · 여기서 바로 승인하면 출결판에 반영됩니다. (통합 인박스에서도 처리 가능)
              </span>
            </span>
          </span>
        </button>

        {/* 필터 바 */}
        <div className="bg-white rounded-2xl border border-black/[0.05] shadow-sm p-4 space-y-3">
          {/* 기간 */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-extrabold text-[#86868B] w-9 shrink-0">기간</span>
            <div className="flex items-center bg-[#F5F5F7] p-1 rounded-xl border border-black/[0.04]">
              {SCOPES.map(([v, label]) => (
                <button key={v} type="button" onClick={() => setScope(v)}
                  className={`h-7.5 rounded-lg px-2.5 text-[11px] font-bold transition-all ${scope === v ? 'bg-white text-black shadow-sm' : 'text-[#86868B] hover:text-black'}`}>
                  {label}
                </button>
              ))}
            </div>
            {scope === 'date' && (
              <Input type="date" value={pickedDate} onChange={(e) => setPickedDate(e.target.value || todayStr)}
                className="h-8 w-auto rounded-xl border-black/[0.08] bg-[#F5F5F7] px-2 text-xs font-semibold" />
            )}
          </div>

          {/* 상태 */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-extrabold text-[#86868B] w-9 shrink-0">상태</span>
            <div className="flex items-center bg-[#F5F5F7] p-1 rounded-xl border border-black/[0.04]">
              {STATUSES.map(([v, label]) => (
                <button key={v} type="button" onClick={() => setStatusFilter(v)}
                  className={`h-7.5 rounded-lg px-2.5 text-[11px] font-bold transition-all ${statusFilter === v ? 'bg-white text-black shadow-sm' : 'text-[#86868B] hover:text-black'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 종류 + 검색 */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-extrabold text-[#86868B] w-9 shrink-0">종류</span>
            <div className="flex items-center gap-1 flex-wrap">
              <button type="button" onClick={() => setTypeFilter('all')}
                className={`h-7.5 rounded-lg px-2.5 text-[11px] font-bold border transition-all ${typeFilter === 'all' ? 'bg-[#1D1D1F] text-white border-transparent' : 'bg-white text-[#86868B] border-black/[0.08] hover:text-black'}`}>
                전체
              </button>
              {LEAVE_TYPE_ORDER.map((t) => (
                <button key={t} type="button" onClick={() => setTypeFilter(t)}
                  className={`h-7.5 rounded-lg px-2.5 text-[11px] font-bold border transition-all ${typeFilter === t ? 'bg-[#1D1D1F] text-white border-transparent' : 'bg-white text-[#86868B] border-black/[0.08] hover:text-black'}`}>
                  {LEAVE_TYPES[t].icon} {LEAVE_TYPES[t].label}
                </button>
              ))}
            </div>
          </div>

          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868B]" />
            <Input placeholder="학생 이름 검색" value={search} onChange={(e) => setSearch(e.target.value)}
              className="pl-9 rounded-xl border-black/[0.08] text-xs h-9 bg-[#F5F5F7]" />
          </div>
        </div>

        {/* 목록 */}
        {loading ? (
          <div className="text-center py-20 bg-white border border-black/[0.05] rounded-3xl flex flex-col items-center">
            <Loader2 className="w-8 h-8 text-[#0071E3] animate-spin mb-4" />
            <p className="text-xs text-[#86868B]">불러오는 중...</p>
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-20 bg-white border border-dashed border-black/[0.08] rounded-3xl text-xs text-[#86868B]">
            조건에 맞는 휴식·반차 신청이 없습니다.
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map(([date, list]) => (
              <div key={date} className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <span className={`text-sm font-black ${date === todayStr ? 'text-[#0071E3]' : 'text-[#1D1D1F]'}`}>{dateLabel(date)}</span>
                  {date === todayStr && <span className="rounded-full bg-[#0071E3]/10 px-2 py-0.5 text-[10px] font-black text-[#0071E3]">오늘</span>}
                  <span className="text-[11px] font-bold text-[#86868B]">{list.length}건</span>
                </div>

                {list.map((ev) => {
                  const isExpanded = expandedId === ev.request.id;
                  const revKey = `rev_${ev.request.id}`;
                  const cpKey = `cp_${ev.student.id}`;
                  const statusBar = ev.request.status === 'approved' ? 'border-l-emerald-400' : ev.request.status === 'rejected' ? 'border-l-red-400' : 'border-l-amber-400';
                  const statusLabel = ev.request.status === 'approved'
                    ? <span className="flex items-center gap-1 text-[10px] font-black text-emerald-700"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />승인</span>
                    : ev.request.status === 'rejected'
                    ? <span className="flex items-center gap-1 text-[10px] font-black text-red-600"><span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />반려</span>
                    : <span className="flex items-center gap-1 text-[10px] font-black text-amber-700"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse inline-block" />대기</span>;
                  return (
                    <div key={ev.request.id} className={`rounded-2xl border border-black/[0.05] border-l-[3px] overflow-hidden bg-white shadow-sm ${statusBar}`}>
                      <button type="button" onClick={() => setExpandedId(isExpanded ? null : ev.request.id)}
                        className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-[#F8F9FA] transition-colors">
                        <span className="text-base shrink-0">{LEAVE_TYPES[ev.request.type]?.icon}</span>
                        <div className="flex-1 min-w-0">
                          <span className="font-extrabold text-[13px] text-[#1D1D1F] truncate block">
                            {ev.student.name}
                            <span className="ml-1.5 text-[11px] font-bold text-[#0071E3]">{formatLeaveLabel(ev.request.type, ev.request.slot)}</span>
                          </span>
                          <span className="text-[10px] text-[#86868B] font-medium">{campusLabel(ev.student.campus)} · {ev.student.manager || '담당 없음'}
                            {ev.request.urgent && <span className="ml-1.5 rounded bg-red-50 text-red-600 px-1 py-0.5 text-[9px] font-black">긴급</span>}
                            {ev.request.usedCoupon && <span className="ml-1.5 rounded bg-violet-50 text-violet-600 px-1 py-0.5 text-[9px] font-black">쿠폰추가</span>}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">{statusLabel}<ChevronDown className={`w-3.5 h-3.5 text-slate-300 transition-transform ${isExpanded ? 'rotate-180' : ''}`} /></div>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-black/[0.04] bg-[#F8F9FA] px-4 pb-4 pt-3 space-y-3">
                          {ev.request.reason && (
                            <div className="rounded-xl bg-white border border-black/[0.05] px-3 py-2.5">
                              <p className="text-[9px] font-extrabold text-[#86868B] uppercase tracking-wide mb-1">신청 사유</p>
                              <p className="text-[11px] font-semibold text-[#1D1D1F] leading-relaxed break-all">{ev.request.reason}</p>
                            </div>
                          )}
                          {ev.request.adminReply && (
                            <div className="rounded-xl bg-[#0071E3]/[0.04] border border-[#0071E3]/15 px-3 py-2.5">
                              <p className="text-[9px] font-extrabold text-[#0071E3] uppercase tracking-wide mb-1">답변</p>
                              <p className="text-[11px] font-semibold text-[#1D1D1F] leading-relaxed">{ev.request.adminReply}</p>
                            </div>
                          )}
                          {ev.request.status === 'pending' && (
                            <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                              <input value={replyDrafts[ev.request.id] ?? ''} onChange={(e) => setReplyDrafts((dft) => ({ ...dft, [ev.request.id]: e.target.value }))}
                                placeholder="답변 코멘트 입력 (선택)" className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-[11px] font-semibold text-slate-800 placeholder:text-slate-300 focus:border-[#0071E3] focus:outline-none" />
                              <div className="grid grid-cols-2 gap-2">
                                <Button size="sm" disabled={busy[revKey]} onClick={() => reviewRequest(ev, 'approved')} className="h-9 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm">
                                  {busy[revKey] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />} 승인
                                </Button>
                                <Button size="sm" variant="outline" disabled={busy[revKey]} onClick={() => reviewRequest(ev, 'rejected')} className="h-9 rounded-xl border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold">
                                  <X className="w-3.5 h-3.5 mr-1" /> 반려
                                </Button>
                              </div>
                            </div>
                          )}
                          <div className="flex items-center justify-between gap-2 rounded-xl bg-white border border-black/[0.05] px-3 py-2" onClick={(e) => e.stopPropagation()}>
                            <button type="button" onClick={() => openStudentSheet(ev.student)} className="text-[11px] font-bold text-[#0071E3] hover:underline">학생 카드 열기</button>
                            <div className="flex items-center gap-1">
                              <span className="flex items-center gap-1 text-[11px] font-bold text-[#1D1D1F] mr-1"><Ticket className="w-3 h-3 text-[#86868B]" />쿠폰 <b className="text-[#0071E3]">{ev.student.leaveCoupons ?? 0}</b></span>
                              <Button size="icon" variant="outline" disabled={busy[cpKey]} onClick={() => adjustCoupon(ev.student, -1)} className="h-7 w-7 rounded-lg border-black/[0.08]"><Minus className="w-3 h-3" /></Button>
                              <Button size="icon" variant="outline" disabled={busy[cpKey]} onClick={() => adjustCoupon(ev.student, 1)} className="h-7 w-7 rounded-lg border-black/[0.08]"><Plus className="w-3 h-3" /></Button>
                              <Button size="sm" variant="outline" disabled={busy[cpKey]} onClick={() => adjustCoupon(ev.student, COUPONS_PER_EXTRA_HALFDAY)} className="h-7 rounded-lg border-black/[0.08] text-[10px] px-2 font-bold">+{COUPONS_PER_EXTRA_HALFDAY}</Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
