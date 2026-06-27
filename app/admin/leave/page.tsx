'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, Ticket, Minus, Plus, Inbox, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { Student } from '@/lib/types/student';
import { COUPONS_PER_EXTRA_HALFDAY } from '@/lib/leave';
import { AdminTopNav } from '@/components/admin/admin-top-nav';

const CAMPUS_FILTERS = ['all', 'wonju', 'chuncheon', 'chungju'];

function campusLabel(val: string) {
  switch (val) {
    case 'wonju': return '원주';
    case 'chuncheon': return '춘천';
    case 'chungju': return '충주';
    default: return '기타';
  }
}

export default function AdminLeavePage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [campusFilter, setCampusFilter] = useState('all');
  const [search, setSearch] = useState('');
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

  const monthPrefix = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  const studentRows = useMemo(() => {
    return students
      .filter((s) => campusFilter === 'all' || s.campus === campusFilter)
      .filter((s) => !search || s.name.toLowerCase().includes(search.toLowerCase()))
      .map((s) => {
        const reqs = s.leaveRequests || [];
        const pending = reqs.filter((r) => r.status === 'pending').length;
        const approvedThisMonth = reqs.filter((r) => r.status === 'approved' && (r.date || '').startsWith(monthPrefix)).length;
        return { student: s, pending, approvedThisMonth };
      })
      .sort((a, b) => b.pending - a.pending || a.student.name.localeCompare(b.student.name, 'ko'));
  }, [students, campusFilter, search, monthPrefix]);

  const pendingCount = useMemo(
    () => students.reduce((n, s) => n + (s.leaveRequests || []).filter((r) => r.status === 'pending').length, 0),
    [students]
  );

  const adjustCoupon = async (student: Student, delta: number) => {
    const key = `cp_${student.id}`;
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      const res = await fetch(`/api/admin/students/${student.id}/leave`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ couponDelta: delta }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setStudents((prev) => prev.map((s) => s.id === student.id ? { ...s, leaveCoupons: json.leaveCoupons } : s));
        toast.success(delta > 0 ? `쿠폰 ${delta}개를 지급했습니다.` : `쿠폰 ${Math.abs(delta)}개를 차감했습니다.`);
      } else {
        toast.error(json.message || '쿠폰 조정에 실패했습니다.');
      }
    } catch {
      toast.error('네트워크 에러가 발생했습니다.');
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center justify-center font-sans">
        <Loader2 className="w-8 h-8 text-[#0071E3] animate-spin mb-4" />
        <p className="text-sm text-[#86868B]">휴가 쿠폰 정보 로드 중...</p>
      </div>
    );
  }

  return (
    <div className="admin-fluid-ui min-h-screen bg-[#F8F9FA] text-[#1D1D1F] font-sans">
      <AdminTopNav
        title="휴가 쿠폰 관리"
        titleIcon={<Ticket className="w-4 h-4 text-[#0071E3]" />}
        campusOptions={CAMPUS_FILTERS.map((c) => ({ value: c, label: c === 'all' ? '전체' : campusLabel(c) }))}
        campusValue={campusFilter}
        onCampusChange={setCampusFilter}
        onLogout={handleLogout}
      />

      <main className="max-w-5xl mx-auto p-4 md:p-8 space-y-5">
        {/* 승인은 인박스에서 처리 안내 */}
        <button
          type="button"
          onClick={() => router.push('/admin/inbox')}
          className={`w-full flex items-center justify-between gap-3 rounded-2xl border p-4 text-left transition-all active:scale-[0.99] ${
            pendingCount > 0
              ? 'border-amber-200/70 bg-amber-50 hover:bg-amber-100/70'
              : 'border-black/[0.05] bg-white hover:bg-[#F5F5F7]'
          }`}
        >
          <span className="flex items-center gap-3 min-w-0">
            <span className={`flex h-9 w-9 items-center justify-center rounded-xl shrink-0 ${pendingCount > 0 ? 'bg-amber-500 text-white' : 'bg-[#F5F5F7] text-[#86868B]'}`}>
              <Inbox className="w-4 h-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-black text-[#1D1D1F]">
                {pendingCount > 0 ? `대기 중인 휴가·반차 신청 ${pendingCount}건` : '휴가·반차 신청 승인'}
              </span>
              <span className="block text-[11px] font-semibold text-[#86868B]">
                신청 승인·반려는 통합 인박스에서 처리합니다. 이 화면은 쿠폰(반차 추가권) 관리 전용입니다.
              </span>
            </span>
          </span>
          <span className="flex items-center gap-1 text-xs font-black text-[#0071E3] shrink-0">
            인박스 열기 <ChevronRight className="w-4 h-4" />
          </span>
        </button>

        {/* 검색 */}
        <div className="bg-white p-5 rounded-2xl border border-black/[0.05] shadow-sm">
          <div className="relative max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868B]" />
            <Input
              placeholder="학생 이름 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 rounded-xl border-black/[0.08] text-xs h-10 bg-[#F5F5F7]"
            />
          </div>
        </div>

        {/* 학생별 쿠폰 목록 */}
        {loading ? (
          <div className="text-center py-20 bg-white border border-black/[0.05] rounded-3xl flex flex-col items-center">
            <Loader2 className="w-8 h-8 text-[#0071E3] animate-spin mb-4" />
            <p className="text-xs text-[#86868B]">불러오는 중...</p>
          </div>
        ) : studentRows.length === 0 ? (
          <div className="text-center py-20 bg-white border border-dashed border-black/[0.08] rounded-3xl text-xs text-[#86868B]">
            조건에 맞는 원생이 없습니다.
          </div>
        ) : (
          <div className="space-y-2.5">
            {studentRows.map(({ student, pending, approvedThisMonth }) => {
              const cpKey = `cp_${student.id}`;
              return (
                <div key={student.id} className="bg-white border border-black/[0.05] rounded-2xl p-4 md:p-5 shadow-sm flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-black text-sm text-[#1D1D1F]">{student.name}</span>
                    <Badge className="rounded-md text-[9px] px-1.5 py-0.5 border bg-[#F5F5F7] text-[#86868B] border-black/[0.06]">{campusLabel(student.campus)}</Badge>
                    <span className="text-[10px] text-[#86868B] font-semibold">{student.manager || '담당 코치'}</span>
                    {pending > 0 && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-700">대기 {pending}건</span>
                    )}
                    <span className="text-[10px] text-[#86868B] font-semibold">이번 달 사용 {approvedThisMonth}회</span>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <span className="flex items-center gap-1.5 text-[11px] font-bold text-[#86868B]">
                      <Ticket className="w-3.5 h-3.5" /> 쿠폰 <b className="text-[#1D1D1F] text-sm">{student.leaveCoupons ?? 0}</b>개
                    </span>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="outline" disabled={busy[cpKey]} onClick={() => adjustCoupon(student, -1)} className="h-7 w-7 rounded-lg border-black/[0.08]" title="쿠폰 차감">
                        <Minus className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="outline" disabled={busy[cpKey]} onClick={() => adjustCoupon(student, 1)} className="h-7 w-7 rounded-lg border-black/[0.08]" title="쿠폰 지급">
                        <Plus className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy[cpKey]} onClick={() => adjustCoupon(student, COUPONS_PER_EXTRA_HALFDAY)} className="h-7 rounded-lg border-black/[0.08] text-[10px] px-2 font-bold" title={`쿠폰 ${COUPONS_PER_EXTRA_HALFDAY}개 지급 (반차 추가 1회)`}>
                        +{COUPONS_PER_EXTRA_HALFDAY} (반차권)
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
