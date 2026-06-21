'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, Calendar, Check, X, RefreshCw, Ticket, Minus, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Student, LeaveRequest } from '@/lib/types/student';
import { LEAVE_TYPES, getLeaveTypeLabel, COUPONS_PER_EXTRA_HALFDAY } from '@/lib/leave';
import { AdminTopNav } from '@/components/admin/admin-top-nav';

const CAMPUS_FILTERS = ['all', 'wonju', 'chuncheon', 'chungju'];
type StatusFilter = 'pending' | 'approved' | 'rejected' | 'all';

function campusLabel(val: string) {
  switch (val) {
    case 'wonju': return '원주';
    case 'chuncheon': return '춘천';
    case 'chungju': return '충주';
    default: return '기타';
  }
}

interface LeaveRow {
  student: Student;
  request: LeaveRequest;
}

export default function AdminLeavePage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [campusFilter, setCampusFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [search, setSearch] = useState('');
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const loadStudents = async () => {
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
  };

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
  }, [router]);

  const handleLogout = async () => {
    try {
      await fetch('/api/admin/auth/logout', { method: 'POST' });
      router.replace('/admin');
    } catch { /* noop */ }
  };

  const rows: LeaveRow[] = useMemo(() => {
    const out: LeaveRow[] = [];
    for (const s of students) {
      if (campusFilter !== 'all' && s.campus !== campusFilter) continue;
      if (search && !s.name.toLowerCase().includes(search.toLowerCase())) continue;
      for (const r of s.leaveRequests || []) {
        if (statusFilter !== 'all' && r.status !== statusFilter) continue;
        out.push({ student: s, request: r });
      }
    }
    // 대기중 먼저, 그 다음 사용일 가까운 순
    return out.sort((a, b) => {
      const ap = a.request.status === 'pending' ? 0 : 1;
      const bp = b.request.status === 'pending' ? 0 : 1;
      return ap - bp || (a.request.date || '').localeCompare(b.request.date || '');
    });
  }, [students, campusFilter, statusFilter, search]);

  const pendingCount = useMemo(
    () => students.reduce((n, s) => n + (s.leaveRequests || []).filter((r) => r.status === 'pending').length, 0),
    [students]
  );

  const patchLeave = async (studentId: string, body: Record<string, unknown>, key: string) => {
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      const res = await fetch(`/api/admin/students/${studentId}/leave`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (res.ok && json.success) return json;
      toast.error(json.message || '처리에 실패했습니다.');
      return null;
    } catch {
      toast.error('네트워크 에러가 발생했습니다.');
      return null;
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  };

  const reviewRequest = async (row: LeaveRow, status: 'approved' | 'rejected') => {
    const key = `rev_${row.request.id}`;
    const reply = (replyDrafts[row.request.id] || '').trim();
    const json = await patchLeave(row.student.id, { requestId: row.request.id, status, reply }, key);
    if (!json) return;
    setStudents((prev) => prev.map((s) => s.id !== row.student.id ? s : {
      ...s,
      leaveRequests: (s.leaveRequests || []).map((r) => r.id !== row.request.id ? r : {
        ...r, status, adminReply: reply || r.adminReply, reviewedAt: new Date().toISOString(),
      }),
    }));
    toast.success(status === 'approved' ? '승인했습니다.' : '반려했습니다.');
  };

  const adjustCoupon = async (student: Student, delta: number) => {
    const key = `cp_${student.id}`;
    const json = await patchLeave(student.id, { couponDelta: delta }, key);
    if (!json) return;
    setStudents((prev) => prev.map((s) => s.id === student.id ? { ...s, leaveCoupons: json.leaveCoupons } : s));
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center justify-center font-sans">
        <Loader2 className="w-8 h-8 text-[#0071E3] animate-spin mb-4" />
        <p className="text-sm text-[#86868B]">휴가 신청 로드 중...</p>
      </div>
    );
  }

  return (
    <div className="admin-fluid-ui min-h-screen bg-[#F8F9FA] text-[#1D1D1F] font-sans">
      <AdminTopNav
        title="휴가 · 반차 신청 관리"
        titleIcon={<Calendar className="w-4 h-4 text-[#0071E3]" />}
        campusOptions={CAMPUS_FILTERS.map((c) => ({ value: c, label: c === 'all' ? '전체' : campusLabel(c) }))}
        campusValue={campusFilter}
        onCampusChange={setCampusFilter}
        onLogout={handleLogout}
        actions={
          <Button size="sm" variant="outline" onClick={loadStudents} className="rounded-2xl border-black/[0.05] text-xs h-9.5 bg-white px-3 shadow-sm" title="새로고침">
            <RefreshCw className="w-4 h-4" />
          </Button>
        }
      />

      <main className="max-w-5xl mx-auto p-4 md:p-8 space-y-5">
        {/* 필터 */}
        <div className="flex flex-col gap-3.5 bg-white p-5 rounded-2xl border border-black/[0.05] shadow-sm">
          <div className="relative max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868B]" />
            <Input
              placeholder="학생 이름 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 rounded-xl border-black/[0.08] text-xs h-10 bg-[#F5F5F7]"
            />
          </div>
          <div className="flex flex-wrap items-center gap-5 text-xs">
            <div className="flex items-center gap-2.5">
              <span className="font-extrabold text-[#86868B] shrink-0">상태</span>
              <div className="flex items-center bg-[#F5F5F7] p-1 rounded-xl border border-black/[0.04]">
                {([['pending', `대기중${pendingCount ? ` ${pendingCount}` : ''}`], ['approved', '승인'], ['rejected', '반려'], ['all', '전체']] as [StatusFilter, string][]).map(([v, label]) => (
                  <Button key={v} size="sm" variant={statusFilter === v ? 'default' : 'ghost'} onClick={() => setStatusFilter(v)}
                    className={`h-7.5 rounded-lg px-3 text-[11px] font-bold ${statusFilter === v ? 'bg-white text-black shadow-sm' : 'text-[#86868B] hover:text-black'}`}>
                    {label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 목록 */}
        {loading ? (
          <div className="text-center py-20 bg-white border border-black/[0.05] rounded-3xl flex flex-col items-center">
            <Loader2 className="w-8 h-8 text-[#0071E3] animate-spin mb-4" />
            <p className="text-xs text-[#86868B]">불러오는 중...</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-20 bg-white border border-dashed border-black/[0.08] rounded-3xl text-xs text-[#86868B]">
            조건에 맞는 휴가 신청이 없습니다.
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map(({ student, request }) => {
              const info = LEAVE_TYPES[request.type];
              const revKey = `rev_${request.id}`;
              const cpKey = `cp_${student.id}`;
              return (
                <div key={request.id} className="bg-white border border-black/[0.05] rounded-2xl p-4 md:p-5 shadow-sm space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-black text-sm text-[#1D1D1F]">{student.name}</span>
                      <Badge className="rounded-md text-[9px] px-1.5 py-0.5 border bg-[#F5F5F7] text-[#86868B] border-black/[0.06]">{campusLabel(student.campus)}</Badge>
                      <span className="text-[10px] text-[#86868B] font-semibold">{student.manager || '담당 코치'}</span>
                    </div>
                    {request.status === 'approved' ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700">승인됨</span>
                    ) : request.status === 'rejected' ? (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-black text-red-600">반려됨</span>
                    ) : (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-700">대기중</span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-lg bg-[#0071E3]/[0.06] px-2.5 py-1 font-black text-[#0071E3]">{info?.icon} {getLeaveTypeLabel(request.type)}</span>
                    <span className="text-[#86868B] font-semibold">{info?.slot}</span>
                    <span className="rounded-lg bg-[#F5F5F7] px-2 py-1 font-bold text-[#1D1D1F]">📅 {request.date}</span>
                    {info?.category === 'sick' && (
                      <span className="rounded-lg bg-amber-50 px-2 py-1 font-bold text-amber-700">영수증 밴드 증빙 필요</span>
                    )}
                  </div>

                  {request.reason && (
                    <p className="rounded-xl bg-[#F5F5F7] px-3 py-2 text-[11px] font-semibold text-[#434345] whitespace-pre-wrap break-words">{request.reason}</p>
                  )}
                  {request.adminReply && (
                    <div className="rounded-xl border border-[#0071E3]/15 bg-[#0071E3]/[0.05] px-2.5 py-1.5 text-[10px] font-semibold text-[#0071E3]">
                      💬 내 답변: {request.adminReply}
                    </div>
                  )}

                  {/* 코멘트 + 승인/반려 */}
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      value={replyDrafts[request.id] ?? ''}
                      onChange={(e) => setReplyDrafts((d) => ({ ...d, [request.id]: e.target.value }))}
                      placeholder="학생에게 보낼 코멘트 (선택)"
                      className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-300 focus:border-[#0071E3] focus:outline-none"
                    />
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" disabled={busy[revKey]} onClick={() => reviewRequest({ student, request }, 'approved')}
                        className="h-9 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 font-bold">
                        <Check className="w-3.5 h-3.5 mr-1" /> 승인
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy[revKey]} onClick={() => reviewRequest({ student, request }, 'rejected')}
                        className="h-9 rounded-xl border-red-200 text-red-600 hover:bg-red-50 text-xs px-3 font-bold">
                        <X className="w-3.5 h-3.5 mr-1" /> 반려
                      </Button>
                    </div>
                  </div>

                  {/* 쿠폰 조정 */}
                  <div className="flex items-center justify-between border-t border-black/[0.04] pt-2.5">
                    <span className="flex items-center gap-1.5 text-[11px] font-bold text-[#86868B]">
                      <Ticket className="w-3.5 h-3.5" /> 쿠폰 잔액 <b className="text-[#1D1D1F]">{student.leaveCoupons ?? 0}</b>개
                      <span className="text-[9px] text-[#86868B]">(반차 추가 1회 = {COUPONS_PER_EXTRA_HALFDAY}개)</span>
                    </span>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="outline" disabled={busy[cpKey]} onClick={() => adjustCoupon(student, -1)} className="h-7 w-7 rounded-lg border-black/[0.08]" title="쿠폰 차감">
                        <Minus className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="outline" disabled={busy[cpKey]} onClick={() => adjustCoupon(student, 1)} className="h-7 w-7 rounded-lg border-black/[0.08]" title="쿠폰 지급">
                        <Plus className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy[cpKey]} onClick={() => adjustCoupon(student, COUPONS_PER_EXTRA_HALFDAY)} className="h-7 rounded-lg border-black/[0.08] text-[10px] px-2 font-bold" title={`쿠폰 ${COUPONS_PER_EXTRA_HALFDAY}개 지급`}>
                        +{COUPONS_PER_EXTRA_HALFDAY}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
