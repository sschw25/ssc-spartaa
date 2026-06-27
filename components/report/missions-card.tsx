'use client';

import React, { useEffect, useState } from 'react';
import { Trophy, Ticket, Loader2, CheckCircle2, CalendarClock } from 'lucide-react';

interface Mission {
  id: string;
  name: string;
  period: 'weekly' | 'monthly' | 'event';
  coupons: number;
  describe: string;
}
interface RecentReward { missionName: string; rewardGranted: number; date: string }
interface MissionsData {
  missions: Mission[];
  coupons: number;
  couponsPerHalfday: number;
  recent: RecentReward[];
}

const periodLabel = (p: Mission['period']) => (p === 'weekly' ? '매주' : p === 'monthly' ? '매월' : 'OT');
const periodCls = (p: Mission['period']) =>
  p === 'weekly' ? 'bg-blue-50 text-blue-600' : p === 'monthly' ? 'bg-purple-50 text-purple-600' : 'bg-amber-50 text-amber-600';

export function MissionsCard() {
  const [data, setData] = useState<MissionsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/student/missions', { credentials: 'same-origin' });
        if (res.ok) {
          const json = await res.json();
          if (!cancelled && json.success) setData(json);
        }
      } catch { /* noop */ } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-[#0071E3]" />
      </div>
    );
  }
  if (!data || data.missions.length === 0) return null;

  const toHalfday = data.couponsPerHalfday > 0 ? Math.floor(data.coupons / data.couponsPerHalfday) : 0;

  return (
    <div className="no-print rounded-3xl border border-amber-200/60 bg-gradient-to-br from-amber-50/60 to-white p-5 md:p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="flex items-center gap-2 text-sm font-black text-amber-700">
          <Trophy className="w-4 h-4" /> 쿠폰 미션
        </h3>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-amber-200 px-3 py-1 text-xs font-black text-amber-700 shadow-sm">
            <Ticket className="w-3.5 h-3.5" /> 내 쿠폰 {data.coupons}장
          </span>
          {toHalfday > 0 && (
            <span className="text-[10px] font-bold text-amber-600/80">= 반차권 {toHalfday}회</span>
          )}
        </div>
      </div>

      <p className="text-[11px] font-semibold text-slate-500 -mt-1">
        아래 미션을 달성하면 쿠폰이 자동 적립돼요. 쿠폰 {data.couponsPerHalfday}장이면 반차/휴식을 추가로 신청할 수 있어요.
      </p>

      <div className="space-y-2.5">
        {data.missions.map((m) => (
          <div key={m.id} className="rounded-2xl border border-slate-100 bg-white p-3.5 flex items-start gap-3">
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700">
              {m.period === 'event' ? <CalendarClock className="w-4 h-4" /> : <Trophy className="w-4 h-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-black text-slate-800">{m.name}</span>
                <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-black ${periodCls(m.period)}`}>{periodLabel(m.period)}</span>
                <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 text-amber-600 px-1.5 py-0.5 text-[9px] font-black">
                  <Ticket className="w-2.5 h-2.5" /> +{m.coupons}
                </span>
              </div>
              <p className="text-[11px] font-semibold text-slate-500 mt-1 leading-relaxed">{m.describe}</p>
            </div>
          </div>
        ))}
      </div>

      {data.recent.length > 0 && (
        <div className="border-t border-amber-100 pt-3 space-y-1.5">
          <p className="text-[10px] font-black text-amber-600/80 uppercase tracking-wider">최근 적립</p>
          {data.recent.filter((r) => r.rewardGranted > 0).slice(0, 4).map((r, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px] font-semibold text-slate-600">
              <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
              <span className="font-bold text-slate-700">{r.missionName}</span>
              <span className="text-amber-600 font-black">+{r.rewardGranted}장</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
