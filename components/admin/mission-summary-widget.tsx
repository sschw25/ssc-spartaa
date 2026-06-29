'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Trophy, Ticket, Loader2, PlayCircle, ChevronRight, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface Bucket { key: string; coupons: number; students: number }
interface Summary {
  week: Bucket;
  month: Bucket;
  today: Bucket;
  byMission: Array<{ missionName: string; coupons: number; students: number }>;
}

export function MissionSummaryWidget() {
  const router = useRouter();
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [settling, setSettling] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/missions/summary', { cache: 'no-store', credentials: 'same-origin' });
      if (res.ok) {
        const json = await res.json();
        if (json.success) setData(json);
      }
    } catch { /* noop */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const settleNow = async () => {
    if (settling) return;
    if (!confirm('지금 미션을 정산할까요? (이번 달/주 조건 충족자에게 쿠폰 즉시 지급 — 멱등)')) return;
    setSettling(true);
    try {
      const res = await fetch('/api/admin/missions/settle', { method: 'POST', credentials: 'same-origin' });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success(`정산 완료 — ${json.totalStudents}명에게 ${json.totalCoupons}장 지급`);
        await load();
      } else {
        toast.error(json.message || '정산 실패');
      }
    } catch {
      toast.error('네트워크 오류로 정산에 실패했습니다.');
    } finally {
      setSettling(false);
    }
  };

  return (
    <div className="rounded-3xl border border-black/[0.04] bg-white p-5 shadow-[0_4px_12px_rgba(0,0,0,0.015)]">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold text-[#1D1D1F]">
          <Trophy className="w-4 h-4 text-amber-500" /> 쿠폰 미션 현황
        </h3>
        <div className="flex items-center gap-1">
          <button onClick={load} title="새로고침" className="rounded-lg p-1.5 text-[#86868B] hover:bg-[#F5F5F7] transition">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => router.push('/admin/missions')} className="flex items-center gap-0.5 rounded-lg px-2 py-1 text-[13px] font-medium text-[#0071E3] hover:bg-blue-50 transition">
            설정 <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-[#0071E3]" /></div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-3 gap-2.5">
            {([
              ['이번 달', data?.month, 'bg-black/[0.03] text-[#1d1d1f]'],
              ['이번 주', data?.week, 'bg-[#0071E3]/[0.08] text-[#0071E3]'],
              ['오늘', data?.today, 'bg-emerald-500/10 text-emerald-600'],
            ] as [string, Bucket | undefined, string][]).map(([label, b, cls]) => (
              <div key={label} className={`rounded-2xl px-3 py-3 ${cls}`}>
                <p className="text-[11px] font-medium text-[#86868B]">{label} 지급</p>
                <p className="mt-1 flex items-baseline gap-0.5">
                  <span className="text-[18px] leading-none font-semibold tracking-tight">{b?.coupons ?? 0}</span>
                  <span className="text-[11px] font-medium text-[#86868B]">장</span>
                </p>
                <p className="text-[11px] text-[#86868B]">{b?.students ?? 0}명 수령</p>
              </div>
            ))}
          </div>

          {data && data.byMission.length > 0 && (
            <div className="mt-3 space-y-1">
              {data.byMission.slice(0, 4).map((m) => (
                <div key={m.missionName} className="flex items-center justify-between text-[11px] font-semibold text-slate-600">
                  <span className="truncate">{m.missionName}</span>
                  <span className="flex items-center gap-1 shrink-0 text-amber-600 font-semibold">
                    <Ticket className="w-3 h-3" /> {m.coupons}장 · {m.students}명
                  </span>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={settleNow}
            disabled={settling}
            className="mt-4 w-full flex items-center justify-center gap-1.5 rounded-xl bg-[#1D1D1F] hover:bg-black text-white text-xs font-bold py-2.5 transition active:scale-[0.99] disabled:opacity-50"
          >
            {settling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
            지금 정산 (이번 달·주)
          </button>
          <p className="mt-1.5 text-[10px] font-semibold text-[#86868B] text-center">
            자동 정산: 주간 일요일 밤 · 월간 매월 1일(지난달 기준)
          </p>
        </>
      )}
    </div>
  );
}
