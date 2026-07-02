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
          ? { ...s, rewardRedemptions: (s.rewardRedemptions || []).map((r) => r.id === redemption.id ? json.redemption : r) }
          : s));
        toast.success('지급 완료로 기록했습니다.');
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
      <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center justify-center font-sans">
        <Loader2 className="w-8 h-8 text-[#0071E3] animate-spin mb-4" />
        <p className="text-sm text-[#86868B]">휴가 쿠폰 정보 로드 중...</p>
      </div>
    );
  }

  return (
    <div className="admin-fluid-ui ios-app-bg min-h-screen text-[#1D1D1F] font-sans">
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

        {/* 탭: 쿠폰 관리 / 리워드 지급내역 */}
        <div className="flex items-center gap-1 bg-[#F5F5F7] p-1 rounded-2xl border border-black/[0.02] w-fit">
          <button
            type="button"
            onClick={() => setActiveTab('coupons')}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${activeTab === 'coupons' ? 'bg-white text-black shadow-sm' : 'text-[#86868B] hover:text-[#1D1D1F]'}`}
          >
            쿠폰 관리
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('rewards')}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all ${activeTab === 'rewards' ? 'bg-white text-black shadow-sm' : 'text-[#86868B] hover:text-[#1D1D1F]'}`}
          >
            <Gift className="w-3.5 h-3.5" /> 리워드 지급내역
            {pendingRewardCount > 0 && (
              <span className="rounded-full bg-amber-500 text-white px-1.5 py-0.5 text-[9px] font-black">{pendingRewardCount}</span>
            )}
          </button>
        </div>

        {activeTab === 'coupons' && (<>
        {/* 리워드 교환 안내 */}
        <div className="rounded-2xl border border-[#0071E3]/15 bg-[#0071E3]/[0.03] p-4 text-[11px] font-semibold text-[#0071E3]">
          쿠폰 교환은 <b>학생이 본인 리포트에서 직접</b> 합니다 — 반차권/휴식권은 즉시 교환(쿠폰 즉시 차감), 상품권·플래너는 신청 시 통합 인박스로 알림이 와요. 이 화면은 쿠폰 지급/차감과 <b>리워드 지급내역</b> 관리 전용입니다.
        </div>

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
        {loading && students.length === 0 ? (
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
                    <span className="text-[10px] text-[#86868B] font-semibold">{student.manager || '담당 코멘터'}</span>
                    {pending > 0 && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-700">대기 {pending}건</span>
                    )}
                    <span className="text-[10px] text-[#86868B] font-semibold">이번 달 사용 {approvedThisMonth}회</span>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="flex items-center gap-1 text-[11px] font-bold text-[#86868B]">
                        <Ticket className="w-3.5 h-3.5" /> 쿠폰
                      </span>
                      <Button size="icon" variant="outline" disabled={busy[cpKey]} onClick={() => adjustCoupon(student, -1)} className="h-7 w-7 rounded-lg border-black/[0.08]" title="쿠폰 차감">
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
                        className="h-7 w-14 rounded-lg border border-black/[0.08] bg-white text-center text-sm font-black text-[#1D1D1F] focus:border-[#0071E3] focus:outline-none"
                        title="쿠폰 수 직접 입력 (Enter 또는 포커스 해제 시 저장)"
                      />
                      <Button size="icon" variant="outline" disabled={busy[cpKey]} onClick={() => adjustCoupon(student, 1)} className="h-7 w-7 rounded-lg border-black/[0.08]" title="쿠폰 지급">
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
            <div className="text-center py-20 bg-white border border-black/[0.05] rounded-3xl flex flex-col items-center">
              <Loader2 className="w-8 h-8 text-[#0071E3] animate-spin mb-4" />
              <p className="text-xs text-[#86868B]">불러오는 중...</p>
            </div>
          ) : redemptionRows.length === 0 ? (
            <div className="text-center py-20 bg-white border border-dashed border-black/[0.08] rounded-3xl text-xs text-[#86868B]">
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
                  <div key={r.id} className={`bg-white border rounded-2xl p-4 md:p-5 shadow-sm space-y-3 ${actionable ? 'border-amber-200/70' : 'border-black/[0.05]'}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-black text-sm text-[#1D1D1F]">{student.name}</span>
                        <Badge className="rounded-md text-[9px] px-1.5 py-0.5 border bg-[#F5F5F7] text-[#86868B] border-black/[0.06]">{campusLabel(student.campus)}</Badge>
                        <span className="flex items-center gap-1 rounded-lg bg-[#0071E3]/[0.08] text-[#0071E3] px-2 py-0.5 text-[11px] font-black">
                          <Gift className="w-3 h-3" /> {getRewardLabel(r.type)} <span className="text-[#86868B] font-bold">(쿠폰 {r.cost})</span>
                        </span>
                        <span className="text-[10px] text-[#86868B] font-semibold">{(r.createdAt || '').slice(0, 10)}</span>
                      </div>
                      {isRequested ? (
                        <span className="flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-700"><Clock className="w-3 h-3" /> 승인 대기</span>
                      ) : isPending ? (
                        <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-700"><Clock className="w-3 h-3" /> 지급 대기</span>
                      ) : r.status === 'rejected' ? (
                        <span className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-black text-red-600"><X className="w-3 h-3" /> 반려</span>
                      ) : (
                        <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700"><Check className="w-3 h-3" /> 지급 완료</span>
                      )}
                    </div>

                    {/* 학생 신청(requested) — 승인(쿠폰 차감)/반려 */}
                    {isRequested && (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          disabled={busy[`rev_${r.id}`]}
                          onClick={() => reviewReward(student.id, r, 'approve')}
                          className="h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-3"
                        >
                          {busy[`rev_${r.id}`] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}
                          승인 (쿠폰 {r.cost}장 차감)
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
                    )}

                    {/* 실물(상품권/플래너) 지급 처리 */}
                    {meta?.physical && !isRequested && (
                      isPending ? (
                        <div className="flex flex-wrap items-center gap-2">
                          {r.type === 'voucher' && (
                            <Input
                              placeholder="상품권 번호"
                              value={draft.voucherCode}
                              onChange={(e) => setFulfillDrafts((d) => ({ ...d, [r.id]: { ...draft, voucherCode: e.target.value } }))}
                              className="h-8 max-w-[180px] rounded-lg border-black/[0.08] text-xs bg-white"
                            />
                          )}
                          <Input
                            placeholder={r.type === 'planner' ? '플래너 지급일/메모' : '메모(선택)'}
                            value={draft.note}
                            onChange={(e) => setFulfillDrafts((d) => ({ ...d, [r.id]: { ...draft, note: e.target.value } }))}
                            className="h-8 flex-1 min-w-[160px] rounded-lg border-black/[0.08] text-xs bg-white"
                          />
                          <Button
                            size="sm"
                            disabled={busy[`ful_${r.id}`]}
                            onClick={() => fulfillReward(student.id, r)}
                            className="h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-3"
                          >
                            {busy[`ful_${r.id}`] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}
                            지급 완료
                          </Button>
                        </div>
                      ) : (
                        <div className="text-[11px] font-semibold text-[#86868B] flex flex-wrap gap-x-4 gap-y-1">
                          {r.voucherCode && <span>상품권 번호: <b className="text-[#1D1D1F]">{r.voucherCode}</b></span>}
                          {r.note && <span>메모: <b className="text-[#1D1D1F]">{r.note}</b></span>}
                          {r.fulfilledAt && <span>지급: {(r.fulfilledAt || '').slice(0, 10)}</span>}
                          {r.handledBy && <span>처리: {r.handledBy}</span>}
                        </div>
                      )
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
