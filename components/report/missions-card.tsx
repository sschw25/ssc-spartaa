'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Trophy, Ticket, Loader2, CheckCircle2, CalendarClock, ArrowRight } from 'lucide-react';

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
interface MissionsData {
  missions: Mission[];
  coupons: number;
  couponsPerHalfday: number;
  recent: RecentReward[];
}

const periodLabel = (p: Mission['period']) => (p === 'weekly' ? '매주' : p === 'monthly' ? '매월' : p === 'daily' ? '매일' : 'OT');
const periodCls = (p: Mission['period']) =>
  p === 'weekly' ? 'bg-blue-50 text-blue-600'
  : p === 'monthly' ? 'bg-slate-100 text-slate-600'
  : p === 'daily' ? 'bg-emerald-50 text-emerald-600'
  : 'bg-slate-100 text-slate-600';

// 쿠폰 적립(미션) 현황 카드. 쿠폰 '교환'은 별도 '쿠폰 교환소' 탭으로 분리 — onGoToExchange 로 이동.
export function MissionsCard({ onGoToExchange }: { onGoToExchange?: () => void }) {
  const [data, setData] = useState<MissionsData | null>(null);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return (
      <div className="rounded-xl border border-black/5 bg-white p-6 shadow-sm flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-[#0071E3]" />
      </div>
    );
  }
  if (!data) return null;

  const toRestRequest = data.couponsPerHalfday > 0 ? Math.floor(data.coupons / data.couponsPerHalfday) : 0;

  return (
    <div className="no-print rounded-xl border border-black/5 bg-white p-5 shadow-sm space-y-4 sm:p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Trophy className="w-4 h-4 text-[#0071E3]" /> 쿠폰 미션
        </h2>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#0071E3]/20 bg-[#0071E3]/[0.06] px-3 py-1 text-xs font-semibold text-[#0071E3] shadow-sm">
            <Ticket className="w-3.5 h-3.5" /> 내 쿠폰 {data.coupons}장
          </span>
          {toRestRequest > 0 && (
            <span className="text-[10px] font-semibold text-slate-400">= 반차권 {toRestRequest}회</span>
          )}
        </div>
      </div>

      {data.missions.length > 0 && (
      <p className="text-[11px] font-semibold text-slate-500 -mt-1">
        아래 미션을 달성하면 쿠폰이 자동 적립돼요. 모은 쿠폰은 <b className="text-[#0071E3]">쿠폰 교환소</b>에서 반차권·휴식권·상품권으로 바꿀 수 있어요.
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

      {/* 교환소로 이동 */}
      {onGoToExchange && (
        <button
          type="button"
          onClick={onGoToExchange}
          className="flex w-full items-center justify-between rounded-lg border border-[#0071E3]/20 bg-[#0071E3]/[0.04] px-4 py-3 text-left transition active:scale-[0.99] hover:bg-[#0071E3]/[0.08]"
        >
          <span className="flex items-center gap-2">
            <Ticket className="w-4 h-4 text-[#0071E3]" />
            <span className="text-xs font-semibold text-slate-800">쿠폰 교환소에서 보상 바꾸기</span>
          </span>
          <ArrowRight className="w-4 h-4 text-[#0071E3]" />
        </button>
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
