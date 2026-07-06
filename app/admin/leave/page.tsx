'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, Ticket, Minus, Plus, Inbox, ChevronRight, Gift, Check, Clock, X } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Student, RewardRedemption } from '@/lib/types/student';
import { REWARD_CATALOG, getRewardLabel } from '@/lib/leave';
import { AdminTopNav } from '@/components/admin/admin-top-nav';
import { getRewardGrantsFromStudent } from '@/lib/student-activity';

type LeaveTab = 'coupons' | 'rewards';

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
  const confirm = useConfirm();
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [campusFilter, setCampusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<LeaveTab>('coupons');
  const [couponDrafts, setCouponDrafts] = useState<Record<string, string>>({});
  // 리워드 지급 처리 입력값
  const [fulfillDrafts, setFulfillDrafts] = useState<Record<string, { voucherCode: string; note: string }>>({});

  const loadStudents = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/students', { cache: 'no-store', credentials: 'same-origin' });
      if (res.ok) {
        const json = await res.json();
        if (json.success) setStudents(json.data || []);
      } else {
        toast.error('학생 정보를 불러오지 못했습니다.');
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
        return { student: s, pending, approvedThisMonth, recentGrants: getRewardGrantsFromStudent(s, 3) };
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
        setStudents((prev) => prev.map((s) => s.id === student.id ? (json.student || { ...s, leaveCoupons: json.leaveCoupons }) : s));
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

  // URL ?tab=rewards 진입 시 리워드 탭 활성화 (인박스에서 링크)
  useEffect(() => {
    try {
      const tab = new URLSearchParams(window.location.search).get('tab');
      if (tab === 'rewards') setActiveTab('rewards');
    } catch { /* noop */ }
  }, []);

  // 쿠폰 잔액 직접 설정 (텍스트 입력 → 절대값으로 조정)
  const setCouponAbsolute = async (student: Student, value: number) => {
    const current = student.leaveCoupons ?? 0;
    const delta = Math.round(value) - current;
    if (delta === 0) { toast.info('변경된 값이 없습니다.'); return; }
    await adjustCoupon(student, delta);
    setCouponDrafts((d) => { const n = { ...d }; delete n[student.id]; return n; });
  };

  // 실물(상품권/플래너) 교환 신청 승인/반려 — 학생이 직접 신청한 건을 처리
  //  승인: 쿠폰 차감 + 지급대기(pending) / 반려: 미차감 반려(rejected)
  const reviewReward = async (studentId: string, redemption: RewardRedemption, action: 'approve' | 'reject') => {
    const key = `rev_${redemption.id}`;
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      const res = await fetch(`/api/admin/students/${studentId}/reward`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'approve' ? { redemptionId: redemption.id, approve: true } : { redemptionId: redemption.id, reject: true }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setStudents((prev) => prev.map((s) => s.id === studentId
          ? {
              ...s,
              leaveCoupons: json.leaveCoupons ?? s.leaveCoupons,
              rewardRedemptions: (s.rewardRedemptions || []).map((r) => r.id === redemption.id ? json.redemption : r),
            }
          : s));
        toast.success(action === 'approve' ? '승인했습니다. (쿠폰 차감 · 지급 대기)' : '교환 신청을 반려했습니다.');
      } else {
        toast.error(json.message || '처리에 실패했습니다.');
      }
    } catch {
      toast.error('네트워크 에러가 발생했습니다.');
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  };

  // 리워드 지급완료 처리 (상품권 번호/플래너 메모 기록)
  const fulfillReward = async (studentId: string, redemption: RewardRedemption) => {
    const draft = fulfillDrafts[redemption.id] || { voucherCode: '', note: '' };
    const key = `ful_${redemption.id}`;
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      const res = await fetch(`/api/admin/students/${studentId}/reward`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ redemptionId: redemption.id, voucherCode: draft.voucherCode, note: draft.note }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setStudents((prev) => prev.map((s) => s.id === studentId
          ? {
              ...s,
              rewardRedemptions: (s.rewardRedemptions || []).map((r) => r.id === redemption.id ? json.redemption : r),
              // requested→지급 한 번에 처리 시 쿠폰이 지금 차감되므로 잔액 동기화
              ...(typeof json.leaveCoupons === 'number' ? { leaveCoupons: json.leaveCoupons } : {}),
            }
          : s));
        toast.success('지급 완료로 기록했어요. 학생 화면에 번호가 표시됩니다.');
      } else {
        toast.error(json.message || '지급 처리에 실패했습니다.');
      }
    } catch {
      toast.error('네트워크 에러가 발생했습니다.');
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  };

  // 모든 학생의 리워드 교환 내역 (지급대기 우선)
  const redemptionRows = useMemo(() => {
    const rows: { student: Student; r: RewardRedemption }[] = [];
    students
      .filter((s) => campusFilter === 'all' || s.campus === campusFilter)
      .forEach((s) => (s.rewardRedemptions || []).forEach((r) => rows.push({ student: s, r })));
    // 처리 필요(신청 → 지급대기) 우선, 그 다음 최신순
    const rank = (st: string) => (st === 'requested' ? 0 : st === 'pending' ? 1 : 2);
    return rows.sort((a, b) => {
      const d = rank(a.r.status) - rank(b.r.status);
      if (d !== 0) return d;
      return (b.r.createdAt || '').localeCompare(a.r.createdAt || '');
    });
  }, [students, campusFilter]);

  const pendingRewardCount = useMemo(
    () => redemptionRows.filter((x) => x.r.status === 'requested' || x.r.status === 'pending').length,
    [redemptionRows]
  );

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] dark:bg-[#0b0b0c] flex flex-col items-center justify-center font-sans">
        <Loader2 className="w-8 h-8 text-[#0071E3] animate-spin mb-4" />
        <p className="text-sm text-slate-500 dark:text-slate-400">쿠폰 정보 로드 중...</p>
      </div>
    );
  }

  return (
    <div className="admin-fluid-ui ios-app-bg min-h-screen text-slate-900 dark:text-slate-100 font-sans">
      <AdminTopNav
        title="쿠폰 관리"
        titleIcon={<Ticket className="w-4 h-4 text-[#0071E3]" />}
        campusOptions={CAMPUS_FILTERS.map((c) => ({ value: c, label: c === 'all' ? '전체' : campusLabel(c) }))}
        campusValue={campusFilter}
        onCampusChange={setCampusFilter}
        onLogout={handleLogout}
      />

      <main className="stagger-children max-w-5xl mx-auto p-4 md:p-8 space-y-5">
        {/* 승인은 인박스에서 처리 안내 */}
        <button
          type="button"
          onClick={() => router.push('/admin/inbox')}
          className={`w-full flex items-center justify-between gap-3 rounded-2xl border p-4 text-left transition-all active:scale-[0.99] ${
            pendingCount > 0
              ? 'border-amber-200/70 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100/70'
              : 'border-black/[0.05] dark:border-white/10 bg-white dark:bg-[#1c1c1e] hover:bg-[#F5F5F7] dark:hover:bg-white/5'
          }`}
        >
          <span className="flex items-center gap-3 min-w-0">
            <span className={`flex h-9 w-9 items-center justify-center rounded-xl shrink-0 ${pendingCount > 0 ? 'bg-amber-500 text-white' : 'bg-[#F5F5F7] dark:bg-white/10 text-slate-500 dark:text-slate-400'}`}>
              <Inbox className="w-4 h-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-black text-slate-900 dark:text-slate-100">
                {pendingCount > 0 ? `대기 중인 휴가·반차 신청 ${pendingCount}건` : '휴가·반차 신청 승인'}
              </span>
              <span className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                신청 승인·반려는 통합 인박스에서 처리합니다. 이 화면은 쿠폰 잔액·지급 이력·교환 내역 관리 전용입니다.
              </span>
            </span>
          </span>
          <span className="flex items-center gap-1 text-xs font-black text-[#0071E3] shrink-0">
            인박스 열기 <ChevronRight className="w-4 h-4" />
          </span>
        </button>

        {/* 탭: 쿠폰 지급 / 리워드 지급내역 */}
        <div className="flex items-center gap-1 bg-[#F5F5F7] dark:bg-white/5 p-1 rounded-2xl border border-black/[0.02] dark:border-white/10 w-fit">
          <button
            type="button"
            onClick={() => setActiveTab('coupons')}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${activeTab === 'coupons' ? 'bg-white dark:bg-[#1c1c1e] text-black dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'}`}
          >
            쿠폰 지급
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('rewards')}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all ${activeTab === 'rewards' ? 'bg-white dark:bg-[#1c1c1e] text-black dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'}`}
          >
            <Gift className="w-3.5 h-3.5" /> 리워드 지급내역
            {pendingRewardCount > 0 && (
              <span className="rounded-full bg-amber-500 text-white px-1.5 py-0.5 text-[9px] font-black">{pendingRewardCount}</span>
            )}
          </button>
        </div>

        {activeTab === 'coupons' && (<>
        {/* 리워드 교환 안내 */}
        <div className="rounded-2xl border border-[#0071E3]/15 bg-[#0071E3]/[0.03] dark:bg-[#0071E3]/15 p-4 text-[11px] font-semibold text-[#0071E3]">
          쿠폰 교환은 <b>학생이 본인 리포트에서 직접</b> 합니다 — 반차권/휴식권은 즉시 교환(쿠폰 즉시 차감), 상품권·플래너는 신청 시 통합 인박스로 알림이 와요. 이 화면은 쿠폰 지급/차감, 지급 이력, <b>리워드 지급내역</b> 관리 전용입니다.
        </div>

        {/* 검색 */}
        <div className="bg-white dark:bg-[#1c1c1e] p-5 rounded-2xl border border-black/[0.05] dark:border-white/10 shadow-sm">
          <div className="relative max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <Input
              placeholder="학생 이름 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 rounded-xl border-black/[0.08] dark:border-white/10 text-xs h-10 bg-[#F5F5F7] dark:bg-white/5"
            />
          </div>
        </div>

        {/* 학생별 쿠폰 목록 */}
        {loading && students.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-[#1c1c1e] border border-black/[0.05] dark:border-white/10 rounded-3xl flex flex-col items-center">
            <Loader2 className="w-8 h-8 text-[#0071E3] animate-spin mb-4" />
            <p className="text-xs text-slate-500 dark:text-slate-400">불러오는 중...</p>
          </div>
        ) : studentRows.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-[#1c1c1e] border border-dashed border-black/[0.08] dark:border-white/10 rounded-3xl text-xs text-slate-500 dark:text-slate-400">
            조건에 맞는 학생이 없습니다.
          </div>
        ) : (
          <div className="space-y-2.5">
            {studentRows.map(({ student, pending, approvedThisMonth, recentGrants }) => {
              const cpKey = `cp_${student.id}`;
              return (
                <div key={student.id} className="bg-white dark:bg-[#1c1c1e] border border-black/[0.05] dark:border-white/10 rounded-2xl p-4 md:p-5 shadow-sm flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <span className="font-black text-sm text-slate-900 dark:text-slate-100">{student.name}</span>
                      <Badge className="rounded-md text-[9px] px-1.5 py-0.5 border bg-[#F5F5F7] dark:bg-white/10 text-slate-500 dark:text-slate-400 border-black/[0.06] dark:border-white/10">{campusLabel(student.campus)}</Badge>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">{student.manager || '담당 코멘터'}</span>
                      {pending > 0 && (
                        <span className="rounded-full bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 text-[10px] font-black text-amber-700 dark:text-amber-400">대기 {pending}건</span>
                      )}
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">이번 달 사용 {approvedThisMonth}회</span>
                    </div>
                    {recentGrants.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {recentGrants.map((grant, index) => (
                          <span key={`${grant.grantedAt || grant.periodKey}_${index}`} className="inline-flex max-w-full items-center gap-1 rounded-full bg-[#0071E3]/[0.06] dark:bg-[#0071E3]/15 px-2 py-0.5 text-[10px] font-semibold text-[#0071E3]">
                            <Gift className="h-2.5 w-2.5 shrink-0" />
                            <span className="truncate">{grant.missionName}</span>
                            <span className="shrink-0">+{grant.coupons}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <span className="flex items-center gap-1 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                        <Ticket className="w-3.5 h-3.5" /> 쿠폰
                      </span>
                      <Button size="icon" variant="outline" disabled={busy[cpKey]} onClick={() => adjustCoupon(student, -1)} className="h-7 w-7 rounded-lg border-black/[0.08] dark:border-white/10" title="쿠폰 차감">
                        <Minus className="w-3.5 h-3.5" />
                      </Button>
                      {/* 텍스트로 직접 수정 */}
                      <input
                        type="number"
                        min={0}
                        value={couponDrafts[student.id] ?? String(student.leaveCoupons ?? 0)}
                        onChange={(e) => setCouponDrafts((d) => ({ ...d, [student.id]: e.target.value }))}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (Number.isFinite(v) && v >= 0 && v !== (student.leaveCoupons ?? 0)) setCouponAbsolute(student, v);
                        }}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                        disabled={busy[cpKey]}
                        className="h-7 w-14 rounded-lg border border-black/[0.08] dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-center text-sm font-black text-slate-900 dark:text-slate-100 focus:border-[#0071E3] focus:outline-none"
                        title="쿠폰 수 직접 입력 (Enter 또는 포커스 해제 시 저장)"
                      />
                      <Button size="icon" variant="outline" disabled={busy[cpKey]} onClick={() => adjustCoupon(student, 1)} className="h-7 w-7 rounded-lg border-black/[0.08] dark:border-white/10" title="쿠폰 지급">
                        <Plus className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </>)}

        {/* 리워드 지급내역 탭 */}
        {activeTab === 'rewards' && (
          loading && students.length === 0 ? (
            <div className="text-center py-20 bg-white dark:bg-[#1c1c1e] border border-black/[0.05] dark:border-white/10 rounded-3xl flex flex-col items-center">
              <Loader2 className="w-8 h-8 text-[#0071E3] animate-spin mb-4" />
              <p className="text-xs text-slate-500 dark:text-slate-400">불러오는 중...</p>
            </div>
          ) : redemptionRows.length === 0 ? (
            <div className="text-center py-20 bg-white dark:bg-[#1c1c1e] border border-dashed border-black/[0.08] dark:border-white/10 rounded-3xl text-xs text-slate-500 dark:text-slate-400">
              리워드 교환 내역이 없습니다.
            </div>
          ) : (
            <div className="space-y-2.5">
              {redemptionRows.map(({ student, r }) => {
                const meta = REWARD_CATALOG.find((x) => x.type === r.type);
                const isRequested = r.status === 'requested';
                const isPending = r.status === 'pending';
                const actionable = isRequested || isPending;
                const draft = fulfillDrafts[r.id] || { voucherCode: r.voucherCode || '', note: r.note || '' };
                return (
                  <div key={r.id} className={`bg-white dark:bg-[#1c1c1e] border rounded-2xl p-4 md:p-5 shadow-sm space-y-3 ${actionable ? 'border-amber-200/70 dark:border-amber-500/20' : 'border-black/[0.05] dark:border-white/10'}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-black text-sm text-slate-900 dark:text-slate-100">{student.name}</span>
                        <Badge className="rounded-md text-[9px] px-1.5 py-0.5 border bg-[#F5F5F7] dark:bg-white/10 text-slate-500 dark:text-slate-400 border-black/[0.06] dark:border-white/10">{campusLabel(student.campus)}</Badge>
                        <span className="flex items-center gap-1 rounded-lg bg-[#0071E3]/[0.08] dark:bg-[#0071E3]/15 text-[#0071E3] px-2 py-0.5 text-[11px] font-black">
                          <Gift className="w-3 h-3" /> {getRewardLabel(r.type)} <span className="text-slate-500 dark:text-slate-400 font-bold">(쿠폰 {r.cost})</span>
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">{(r.createdAt || '').slice(0, 10)}</span>
                      </div>
                      {isRequested ? (
                        <span className="flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-500/10 px-2 py-0.5 text-[10px] font-black text-blue-700 dark:text-blue-400"><Clock className="w-3 h-3" /> 승인 대기</span>
                      ) : isPending ? (
                        <span className="flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 text-[10px] font-black text-amber-700 dark:text-amber-400"><Clock className="w-3 h-3" /> 지급 대기</span>
                      ) : r.status === 'rejected' ? (
                        <span className="flex items-center gap-1 rounded-full bg-red-50 dark:bg-red-500/10 px-2 py-0.5 text-[10px] font-black text-red-600"><X className="w-3 h-3" /> 반려</span>
                      ) : (
                        <span className="flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 text-[10px] font-black text-emerald-700 dark:text-emerald-400"><Check className="w-3 h-3" /> 지급 완료</span>
                      )}
                    </div>

                    {/* 실물 없는 보상(반차/휴식권) 신청 — 승인 즉시 지급 / 반려 */}
                    {isRequested && !meta?.physical && (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          disabled={busy[`rev_${r.id}`]}
                          onClick={() => reviewReward(student.id, r, 'approve')}
                          className="h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-3"
                        >
                          {busy[`rev_${r.id}`] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}
                          승인·즉시 지급 (쿠폰 {r.cost}장 차감)
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy[`rev_${r.id}`]}
                          onClick={async () => { if (await confirm({ title: '이 교환 신청을 반려할까요?', description: '쿠폰은 차감되지 않습니다.', tone: 'danger', confirmText: '반려' })) reviewReward(student.id, r, 'reject'); }}
                          className="h-8 rounded-lg border-black/[0.08] dark:border-white/10 text-[11px] font-bold px-3 text-red-600"
                        >
                          <X className="w-3.5 h-3.5 mr-1" /> 반려
                        </Button>
                      </div>
                    )}

                    {/* 실물(상품권/플래너) — 쿠폰번호 입력 = 지급완료(한 번에). requested/pending 모두 여기서 처리 */}
                    {meta?.physical && (isRequested || isPending) && (
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          {r.type === 'voucher' && (
                            <Input
                              placeholder="쿠폰(상품권) 번호"
                              value={draft.voucherCode}
                              onChange={(e) => setFulfillDrafts((d) => ({ ...d, [r.id]: { ...draft, voucherCode: e.target.value } }))}
                              className="h-8 max-w-[200px] rounded-lg border-black/[0.08] dark:border-white/10 text-xs bg-white dark:bg-[#1c1c1e]"
                            />
                          )}
                          <Input
                            placeholder={r.type === 'planner' ? '플래너 지급일/메모' : '메모(선택)'}
                            value={draft.note}
                            onChange={(e) => setFulfillDrafts((d) => ({ ...d, [r.id]: { ...draft, note: e.target.value } }))}
                            className="h-8 flex-1 min-w-[160px] rounded-lg border-black/[0.08] dark:border-white/10 text-xs bg-white dark:bg-[#1c1c1e]"
                          />
                          <Button
                            size="sm"
                            disabled={busy[`ful_${r.id}`] || (r.type === 'voucher' && !draft.voucherCode.trim())}
                            onClick={() => fulfillReward(student.id, r)}
                            className="h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-3"
                          >
                            {busy[`ful_${r.id}`] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}
                            지급 완료{isRequested ? ` (쿠폰 ${r.cost}장 차감)` : ''}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy[`rev_${r.id}`]}
                            onClick={async () => { if (await confirm({ title: '이 교환 신청을 반려할까요?', description: '쿠폰은 차감되지 않습니다.', tone: 'danger', confirmText: '반려' })) reviewReward(student.id, r, 'reject'); }}
                            className="h-8 rounded-lg border-black/[0.08] text-[11px] font-bold px-3 text-red-600"
                          >
                            <X className="w-3.5 h-3.5 mr-1" /> 반려
                          </Button>
                        </div>
                        <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">쿠폰 번호를 입력하고 지급 완료를 누르면 학생 화면에 번호가 표시됩니다.</p>
                      </div>
                    )}

                    {/* 지급 완료/반려된 실물 — 번호·메모 표시 */}
                    {meta?.physical && !isRequested && !isPending && (
                      <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-4 gap-y-1">
                        {r.voucherCode && <span>상품권 번호: <b className="text-slate-900 dark:text-slate-100">{r.voucherCode}</b></span>}
                        {r.note && <span>메모: <b className="text-slate-900 dark:text-slate-100">{r.note}</b></span>}
                        {r.fulfilledAt && <span>지급: {(r.fulfilledAt || '').slice(0, 10)}</span>}
                        {r.handledBy && <span>처리: {r.handledBy}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}
      </main>
    </div>
  );
}
