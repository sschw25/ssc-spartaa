'use client';

import React, { useEffect, useState } from 'react';
import { Users, Loader2, TrendingUp } from 'lucide-react';

interface Data {
  configured: boolean;
  avgPercent?: number;
  studentCount?: number;
  checkedInCount?: number;
}

// 오늘 등원한 학생들의 계획 달성도 평균 — 함께 달리는 느낌을 주는 동기부여 카드.
export function DailyPlanAverageCard() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/daily-plan-average', { cache: 'no-store' });
        const json = await res.json();
        if (active && res.ok && json.success) setData(json);
      } catch { /* 무시 — 부가 정보 */ }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  if (loading) {
    return (
      <div className="rounded-3xl border border-black/[0.05] dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-6 md:p-8 shadow-sm flex items-center justify-center py-10">
        <Loader2 className="w-5 h-5 text-[#0071E3] animate-spin mr-2" />
        <span className="text-sm text-slate-500 dark:text-slate-400">오늘 등원 학생 평균 불러오는 중…</span>
      </div>
    );
  }
  if (!data || data.configured === false) return null;

  const studentCount = data.studentCount ?? 0;
  const checkedInCount = data.checkedInCount ?? 0;
  const pct = Math.max(0, Math.min(100, data.avgPercent ?? 0));
  const strong = pct >= 70;
  const hasAvg = studentCount > 0;

  const message = !hasAvg
    ? (checkedInCount > 0
        ? '오늘 등원한 학생들의 계획 데이터를 모으는 중이에요.'
        : '아직 오늘 등원한 학생이 없어요. 우리 캠퍼스 첫 주자가 되어보세요!')
    : pct >= 80
      ? '다들 오늘 계획을 거의 다 해내고 있어요. 나도 같이 달려요!'
      : pct >= 50
        ? '절반 넘게 채운 하루예요. 조금만 더 힘내요!'
        : '아직 하루가 남았어요. 지금 한 항목이 평균을 끌어올려요!';

  return (
    <div className="rounded-3xl border border-black/[0.05] dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-6 md:p-8 shadow-sm space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-[#0071E3]" />
          <h3 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100 break-keep">우리 캠퍼스 오늘 평균 달성도</h3>
        </div>
        {hasAvg && (
          <span className="shrink-0 inline-flex items-center gap-1.5 text-[11px] font-bold text-[#0071E3] bg-[#0071E3]/[0.06] dark:bg-[#0071E3]/15 border border-[#0071E3]/15 px-2.5 py-1 rounded-full">
            <TrendingUp className="w-3.5 h-3.5" /> {studentCount}명 평균
          </span>
        )}
      </div>

      <div className="rounded-2xl bg-[#0071E3]/[0.05] dark:bg-[#0071E3]/15 border border-[#0071E3]/15 p-5">
        {hasAvg ? (
          <>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">오늘 등원 학생 계획 달성률(평균)</p>
                <p className="text-3xl font-black text-slate-900 dark:text-slate-100 mt-0.5 tabular-nums">{pct}%</p>
              </div>
            </div>
            <div className="mt-4">
              <div className="h-2.5 rounded-full bg-black/[0.06] dark:bg-white/10 overflow-hidden">
                <div
                  className={`h-full rounded-full ${strong ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' : 'bg-[#0071E3]'}`}
                  style={{ width: `${Math.max(4, pct)}%` }}
                />
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm font-bold text-slate-600 dark:text-slate-300 break-keep">
            {checkedInCount > 0 ? `오늘 등원 ${checkedInCount}명 · 계획 집계 중` : '오늘 등원 기록 없음'}
          </p>
        )}
      </div>

      <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 leading-relaxed break-keep">{message}</p>
      <p className="text-[10px] text-slate-500 dark:text-slate-400 text-center break-keep">우리 캠퍼스에서 <b>오늘 등원한 학생들</b>의 오늘 계획 달성도 평균이에요. 개인 정보는 보이지 않아요.</p>
    </div>
  );
}
