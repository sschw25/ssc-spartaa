'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Ticket, Loader2, CheckCircle2, Gift, X, Sparkles } from 'lucide-react';
import { useConfirm } from '@/components/ui/confirm-dialog';

type RewardType = 'halfday' | 'restpass' | 'voucher' | 'planner';
interface RewardCatalogItem { type: RewardType; label: string; cost: number; physical: boolean }
interface Redemption {
  id: string;
  type: RewardType;
  cost: number;
  status: 'requested' | 'pending' | 'fulfilled' | 'rejected';
  createdAt: string;
  voucherCode?: string;
  note?: string;
  fulfilledAt?: string;
}
interface MissionsData {
  coupons: number;
  couponsAvailable: number;
  couponsPerHalfday: number;
  rewardCatalog: RewardCatalogItem[];
  redemptions: Redemption[];
}

const REDEMPTION_STATUS: Record<Redemption['status'], { label: string; cls: string }> = {
  requested: { label: '승인 대기', cls: 'bg-amber-100 text-amber-700' },
  pending: { label: '지급 대기', cls: 'bg-[#0071E3]/10 text-[#0071E3]' },
  fulfilled: { label: '지급 완료', cls: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: '반려', cls: 'bg-slate-200 text-slate-500' },
};

// 쿠폰 교환소 — 미션에서 모은 쿠폰을 반차권/휴식권/상품권 등으로 교환하는 독립 탭.
// 미션(적립 조건)과 분리해 "교환"에만 집중하도록 별도 화면으로 뺐다.
export function CouponExchangeCard() {
  const confirm = useConfirm();
  const [data, setData] = useState<MissionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exchanging, setExchanging] = useState<RewardType | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/student/missions', { credentials: 'same-origin' });
      if (res.ok) {
        const json = await res.json();
        if (json.success) setData(json);
      }
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [load]);

  const requestExchange = async (item: RewardCatalogItem) => {
    if (exchanging) return;
    const ok = await confirm({
      title: `${item.label} 교환을 신청할까요?`,
      description: `쿠폰 ${item.cost}장이 사용돼요.${item.physical ? ' 실물 보상은 관리자 승인 후 지급돼요.' : ' 반차권/휴식권은 신청 즉시 사용할 수 있어요.'}`,
      confirmText: '교환 신청',
    });
    if (!ok) return;
    setExchanging(item.type);
    try {
      const res = await fetch('/api/student/reward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ rewardType: item.type }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success) {
        await load();
        toast.success('교환 신청이 접수되었어요.', { description: item.physical ? '관리자 승인·지급 후 알림으로 알려드릴게요.' : '신청 내역에서 확인할 수 있어요.' });
      } else {
        toast.error(json.message || '교환 신청에 실패했어요.');
      }
    } catch {
      toast.error('네트워크 오류가 발생했어요.');
    } finally {
      setExchanging(null);
    }
  };

  const cancelExchange = async (id: string) => {
    if (!(await confirm({ title: '교환 신청을 취소할까요?', tone: 'danger', confirmText: '신청 취소' }))) return;
    try {
      const res = await fetch(`/api/student/reward?id=${id}`, { method: 'DELETE', credentials: 'same-origin' });
      if (res.ok) {
        await load();
        toast.success('교환 신청을 취소했어요.');
      }
    } catch { /* noop */ }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-black/5 bg-white p-6 shadow-sm flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-[#0071E3]" />
      </div>
    );
  }
  if (!data) return null;

  const available = data.couponsAvailable ?? data.coupons;
  const activeRedemptions = (data.redemptions || []).filter((r) => r.status === 'requested' || r.status === 'pending');
  const doneRedemptions = (data.redemptions || []).filter((r) => r.status === 'fulfilled').slice(0, 6);

  return (
    <div className="mx-auto w-full max-w-[680px] px-4 sm:px-5 space-y-4">
      {/* 헤더 — 다른 탭과 동일 패턴 */}
      <div className="rounded-3xl border border-[#0071E3]/15 bg-[#0071E3]/[0.03] p-5 shadow-sm md:p-6">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-[#0071E3]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#0071E3]">
          <Ticket className="h-3.5 w-3.5" /> Coupon Shop
        </div>
        <h3 className="mt-2 text-xl font-black text-slate-900">쿠폰 교환소</h3>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] font-semibold leading-5 text-slate-500">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-[#0071E3]/20 px-2.5 py-1 text-xs font-black text-[#0071E3] shadow-sm">
            <Ticket className="w-3.5 h-3.5" /> 교환 가능 쿠폰 {available}장
          </span>
          <span className="text-slate-400">미션에서 모은 쿠폰을 아래 보상으로 교환해요</span>
        </p>
      </div>

      {/* 교환 카탈로그 */}
      <div className="rounded-xl border border-black/5 bg-white p-5 shadow-sm sm:p-6 space-y-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          <Gift className="w-4 h-4 text-[#0071E3]" /> 교환 가능 보상
        </p>
        {(data.rewardCatalog?.length ?? 0) === 0 ? (
          <p className="text-xs font-semibold text-slate-400">현재 교환 가능한 보상이 없어요.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {data.rewardCatalog.map((r) => {
              const affordable = available >= r.cost;
              const busy = exchanging === r.type;
              return (
                <button
                  key={r.type}
                  type="button"
                  disabled={!affordable || busy}
                  onClick={() => requestExchange(r)}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-left transition active:scale-[0.97] ${affordable ? 'border-slate-200 bg-white hover:border-[#0071E3]/40' : 'border-slate-100 bg-slate-50 opacity-60'}`}
                >
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-slate-700">{r.label}</span>
                    <span className="block text-[10px] font-semibold text-[#0071E3]">쿠폰 {r.cost}장{r.physical ? ' · 승인 후 지급' : ' · 즉시 사용'}</span>
                  </span>
                  {busy
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0071E3] shrink-0" />
                    : <Ticket className="w-3.5 h-3.5 text-[#0071E3] shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
        <p className="text-[10px] font-semibold text-slate-400">쿠폰 {data.couponsPerHalfday}장이면 반차권 1회로 교환할 수 있어요.</p>
      </div>

      {/* 진행 중 교환 */}
      {activeRedemptions.length > 0 && (
        <div className="rounded-xl border border-black/5 bg-white p-5 shadow-sm sm:p-6 space-y-2">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">진행 중 교환</p>
          {activeRedemptions.map((r) => {
            const meta = data.rewardCatalog.find((c) => c.type === r.type);
            const st = REDEMPTION_STATUS[r.status];
            return (
              <div key={r.id} className="flex items-center gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2 text-[11px]">
                <span className="font-semibold text-slate-700">{meta?.label || r.type}</span>
                <span className="text-[10px] font-semibold text-[#0071E3]">{r.cost}장</span>
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${st.cls}`}>{st.label}</span>
                {r.status === 'requested' && (
                  <button
                    type="button"
                    onClick={() => cancelExchange(r.id)}
                    className="ml-auto shrink-0 text-slate-300 transition-colors hover:text-red-500"
                    aria-label="교환 신청 취소"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 지급 완료 — 상품권 번호/메모를 학생이 확인 */}
      {doneRedemptions.length > 0 && (
        <div className="rounded-xl border border-black/5 bg-white p-5 shadow-sm sm:p-6 space-y-2">
          <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider">지급 완료</p>
          {doneRedemptions.map((r) => {
            const meta = data.rewardCatalog.find((c) => c.type === r.type);
            return (
              <div key={r.id} className="rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2.5 text-[11px]">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span className="font-semibold text-slate-800">{meta?.label || r.type}</span>
                  {r.fulfilledAt && <span className="text-[10px] font-semibold text-slate-400">{r.fulfilledAt.slice(0, 10)}</span>}
                </div>
                {r.voucherCode && (
                  <div className="mt-1.5 flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5">
                    <Sparkles className="w-3 h-3 text-emerald-500 shrink-0" />
                    <span className="text-[10px] font-semibold text-slate-500">교환 번호</span>
                    <span className="ml-auto select-all font-mono text-xs font-black tracking-wider text-slate-900">{r.voucherCode}</span>
                  </div>
                )}
                {r.note && <p className="mt-1 font-semibold text-slate-500">{r.note}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
