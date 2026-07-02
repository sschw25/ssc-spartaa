'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Trophy, Ticket, Loader2, CheckCircle2, CalendarClock, Gift, X } from 'lucide-react';
import { useConfirm } from '@/components/ui/confirm-dialog';

interface Mission {
  id: string;
  name: string;
  period: 'weekly' | 'monthly' | 'event' | 'daily';
  coupons: number;
  describe: string;
  earned: boolean;
  progress: string | null;
}
interface RecentReward { missionName: string; rewardGranted: number; date: string }
type RewardType = 'halfday' | 'restpass' | 'voucher' | 'planner';
interface RewardCatalogItem { type: RewardType; label: string; cost: number; physical: boolean }
interface Redemption { id: string; type: RewardType; cost: number; status: 'requested' | 'pending' | 'fulfilled' | 'rejected'; createdAt: string }
interface MissionsData {
  missions: Mission[];
  coupons: number;
  couponsAvailable: number;
  couponsPerHalfday: number;
  recent: RecentReward[];
  rewardCatalog: RewardCatalogItem[];
  redemptions: Redemption[];
}

const REDEMPTION_STATUS: Record<Redemption['status'], { label: string; cls: string }> = {
  requested: { label: '승인 대기', cls: 'bg-amber-100 text-amber-700' },
  pending: { label: '지급 대기', cls: 'bg-blue-100 text-blue-700' },
  fulfilled: { label: '완료', cls: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: '반려', cls: 'bg-slate-200 text-slate-500' },
};

const periodLabel = (p: Mission['period']) => (p === 'weekly' ? '매주' : p === 'monthly' ? '매월' : p === 'daily' ? '매일' : 'OT');
const periodCls = (p: Mission['period']) =>
  p === 'weekly' ? 'bg-blue-50 text-blue-600'
  : p === 'monthly' ? 'bg-slate-100 text-slate-600'
  : p === 'daily' ? 'bg-emerald-50 text-emerald-600'
  : 'bg-slate-100 text-slate-600';

export function MissionsCard() {
  const confirm = useConfirm();
  const [data, setData] = useState<MissionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exchanging, setExchanging] = useState<RewardType | null>(null);
  const [exchangeError, setExchangeError] = useState('');

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

  const requestExchange = async (type: RewardType) => {
    if (exchanging) return;
    setExchanging(type);
    setExchangeError('');
    try {
      const res = await fetch('/api/student/reward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ rewardType: type }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success) {
        await load();
        toast.success('교환 신청이 접수되었어요.', { description: '실물 보상은 관리자 승인 후 지급돼요.' });
      } else {
        setExchangeError(json.message || '교환 신청에 실패했습니다.');
        toast.error(json.message || '교환 신청에 실패했어요.');
      }
    } catch {
      setExchangeError('네트워크 오류가 발생했습니다.');
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
  if (data.missions.length === 0 && (data.rewardCatalog?.length ?? 0) === 0) return null;

  const toRestRequest = data.couponsPerHalfday > 0 ? Math.floor(data.coupons / data.couponsPerHalfday) : 0;
  const available = data.couponsAvailable ?? data.coupons;
  const activeRedemptions = (data.redemptions || []).filter((r) => r.status === 'requested' || r.status === 'pending');

  return (
    <div className="no-print rounded-xl border border-black/5 bg-white p-5 shadow-sm space-y-4 sm:p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Trophy className="w-4 h-4 text-[#0071E3]" /> 쿠폰 보상
        </h2>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#0071E3]/20 bg-[#0071E3]/[0.06] px-3 py-1 text-xs font-semibold text-[#0071E3] shadow-sm">
            <Ticket className="w-3.5 h-3.5" /> 내 쿠폰 {data.coupons}장
          </span>
          {toRestRequest > 0 && (
            <span className="text-[10px] font-semibold text-slate-400">= 휴식신청 {toRestRequest}회</span>
          )}
        </div>
      </div>

      {data.missions.length > 0 && (
      <p className="text-[11px] font-semibold text-slate-500 -mt-1">
        아래 미션을 달성하면 쿠폰이 자동 적립돼요. 쿠폰 {data.couponsPerHalfday}장이면 휴식신청에 사용할 수 있어요.
      </p>
      )}

      {data.missions.length > 0 && (
      <div className="space-y-2.5">
        {data.missions.map((m) => (
          <div key={m.id} className={`rounded-lg border p-3.5 flex items-start gap-3 ${m.earned ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-100 bg-white'}`}>
            <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg ${m.earned ? 'bg-emerald-100 text-emerald-700' : 'bg-[#0071E3]/10 text-[#0071E3]'}`}>
              {m.earned ? <CheckCircle2 className="w-4 h-4" /> : m.period === 'event' ? <CalendarClock className="w-4 h-4" /> : <Trophy className="w-4 h-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-semibold text-slate-800">{m.name}</span>
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${periodCls(m.period)}`}>{periodLabel(m.period)}</span>
                <span className="inline-flex items-center gap-0.5 rounded-full bg-[#0071E3]/10 text-[#0071E3] px-1.5 py-0.5 text-[10px] font-semibold">
                  <Ticket className="w-2.5 h-2.5" /> +{m.coupons}
                </span>
                {m.earned && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 text-emerald-700 px-1.5 py-0.5 text-[10px] font-semibold">
                    <CheckCircle2 className="w-2.5 h-2.5" /> 달성
                  </span>
                )}
              </div>
              <p className="text-[11px] font-semibold text-slate-500 mt-1 leading-relaxed">{m.describe}</p>
              {!m.earned && m.progress && (
                <p className="text-[11px] font-semibold text-[#0071E3] mt-1">{m.progress}</p>
              )}
            </div>
          </div>
        ))}
      </div>
      )}

      {/* 쿠폰 교환 신청 — 관리자 승인 후 차감/지급 */}
      {(data.rewardCatalog?.length ?? 0) > 0 && (
        <div className="border-t border-slate-100 pt-3 space-y-2.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[#0071E3]">
              <Gift className="w-3.5 h-3.5" /> 쿠폰 교환
            </p>
            <span className="text-[10px] font-semibold text-slate-400">교환 가능 쿠폰 {available}장 · 휴식권 즉시 · 실물은 승인 후</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {data.rewardCatalog.map((r) => {
              const affordable = available >= r.cost;
              const busy = exchanging === r.type;
              return (
                <button
                  key={r.type}
                  type="button"
                  disabled={!affordable || busy}
                  onClick={() => requestExchange(r.type)}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-left transition active:scale-[0.97] ${affordable ? 'border-slate-200 bg-white hover:border-[#0071E3]/40' : 'border-slate-100 bg-slate-50 opacity-60'}`}
                >
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-slate-700">{r.label}</span>
                    <span className="block text-[10px] font-semibold text-[#0071E3]">쿠폰 {r.cost}장{r.physical ? ' · 신청 후 지급' : ' · 즉시 교환'}</span>
                  </span>
                  {busy
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0071E3] shrink-0" />
                    : <Ticket className="w-3.5 h-3.5 text-[#0071E3] shrink-0" />}
                </button>
              );
            })}
          </div>
          {exchangeError && <p className="text-[10px] font-semibold text-red-500">{exchangeError}</p>}

          {activeRedemptions.length > 0 && (
            <div className="space-y-1.5 pt-1">
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
        </div>
      )}

      {data.recent.length > 0 && (
        <div className="border-t border-slate-100 pt-3 space-y-1.5">
          <p className="text-[10px] font-semibold text-[#0071E3] uppercase tracking-wider">최근 적립</p>
          {data.recent.filter((r) => r.rewardGranted > 0).slice(0, 4).map((r, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px] font-semibold text-slate-600">
              <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
              <span className="font-semibold text-slate-700">{r.missionName}</span>
              <span className="text-[#0071E3] font-semibold">+{r.rewardGranted}장</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
