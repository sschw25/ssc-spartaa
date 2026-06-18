'use client';

import React, { useEffect, useState } from 'react';
import { Trophy, Flame, Loader2, Target, Sparkles, TrendingUp } from 'lucide-react';

interface Standing {
  hasRecord: boolean;
  myMinutes: number;
  inTop10: boolean;
  rank: number | null;
  topPercent: number | null;
  toTop10: number;
  nextUpGap: number | null;
  cutline: number;
  top1: number;
}
interface Data {
  configured: boolean;
  liveCount?: number;
  week?: Standing;
  day?: Standing;
}

const fmt = (m: number) => {
  const total = Math.max(0, Math.round(m || 0));
  const h = Math.floor(total / 60);
  const min = total % 60;
  return h > 0 ? `${h}시간 ${min}분` : `${min}분`;
};

export function LeaderboardCard({ studentId }: { studentId?: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'week' | 'day'>('week');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const qs = studentId ? `?studentId=${encodeURIComponent(studentId)}` : '';
        const res = await fetch(`/api/leaderboard${qs}`, { cache: 'no-store' });
        const json = await res.json();
        if (active && res.ok && json.success) setData(json);
      } catch { /* 무시 — 랭킹은 부가 정보 */ }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [studentId]);

  if (loading) {
    return (
      <div className="rounded-3xl border border-black/[0.05] bg-white p-6 md:p-8 shadow-sm flex items-center justify-center py-10">
        <Loader2 className="w-5 h-5 text-[#0071E3] animate-spin mr-2" />
        <span className="text-sm text-[#86868B]">내 순공 위치 불러오는 중…</span>
      </div>
    );
  }
  if (!data || data.configured === false || !data.week) return null;
  // 전체적으로 순공 데이터가 없으면 숨김
  if (data.week.cutline === 0 && !data.week.hasRecord) return null;

  const st: Standing = period === 'day' ? (data.day || data.week) : data.week;
  const periodLabel = period === 'day' ? '오늘' : '이번 주';

  // 진척 바: 밖이면 커트라인 대비, 안이면 1위 대비
  const target = st.inTop10 ? Math.max(st.top1, st.myMinutes, 1) : Math.max(st.cutline, 1);
  const pct = Math.max(4, Math.min(100, Math.round((st.myMinutes / target) * 100)));

  return (
    <div className="rounded-3xl border border-black/[0.05] bg-white p-6 md:p-8 shadow-sm space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-[#F56300]" />
          <h3 className="text-base font-bold text-[#1D1D1F]">나의 순공 랭킹</h3>
        </div>
        {typeof data.liveCount === 'number' && data.liveCount > 0 && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full">
            <Flame className="w-3.5 h-3.5 text-emerald-600" /> 지금 {data.liveCount}명 몰입 중
          </span>
        )}
      </div>

      {/* 주간 / 오늘 토글 */}
      <div className="inline-flex p-0.5 rounded-xl bg-[#F5F5F7] border border-black/[0.05]">
        {([['week', '주간'], ['day', '오늘']] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setPeriod(key)}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
              period === key ? 'bg-white text-[#1D1D1F] shadow-sm' : 'text-[#86868B]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 내 순공 (대표 숫자) */}
      <div className="rounded-2xl bg-gradient-to-br from-[#0071E3]/[0.06] to-[#862BF7]/[0.05] border border-[#0071E3]/15 p-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold text-[#86868B]">{periodLabel} 나의 순공</p>
            <p className="text-3xl font-black text-[#1D1D1F] mt-0.5">{fmt(st.myMinutes)}</p>
          </div>
          {st.hasRecord && st.topPercent != null && (
            <span className="inline-flex items-center gap-1 text-sm font-black text-[#F56300] bg-[#F56300]/10 border border-[#F56300]/15 px-3 py-1.5 rounded-full">
              <Trophy className="w-4 h-4" /> 상위 {st.topPercent}%
            </span>
          )}
        </div>

        {/* 진척 바 */}
        {st.hasRecord && (
          <div className="mt-4">
            <div className="h-2.5 rounded-full bg-black/[0.06] overflow-hidden">
              <div
                className={`h-full rounded-full ${st.inTop10 ? 'bg-gradient-to-r from-[#F56300] to-[#F5A623]' : 'bg-gradient-to-r from-[#0071E3] to-[#862BF7]'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex justify-between mt-1.5 text-[10px] font-bold text-[#86868B]">
              <span>나 {fmt(st.myMinutes)}</span>
              <span>{st.inTop10 ? `1위 ${fmt(st.top1)}` : `TOP 10 ${fmt(st.cutline)}`}</span>
            </div>
          </div>
        )}
      </div>

      {/* 동기부여 메시지 */}
      <MotivationBanner st={st} periodLabel={periodLabel} />

      <p className="text-[10px] text-[#86868B] text-center">QR 등하원으로 측정된 {periodLabel} 순공 시간 기준입니다. 다른 학생의 정보는 보이지 않습니다.</p>
    </div>
  );
}

function MotivationBanner({ st, periodLabel }: { st: Standing; periodLabel: string }) {
  // 기록 없음
  if (!st.hasRecord) {
    return (
      <div className="flex items-center gap-2.5 rounded-2xl bg-[#0071E3]/[0.05] border border-[#0071E3]/15 px-4 py-3">
        <Target className="w-4 h-4 text-[#0071E3] shrink-0" />
        <span className="text-xs font-bold text-[#1D1D1F]">
          {periodLabel} 첫 순공을 기록해 보세요!{st.cutline > 0 && <> TOP 10 커트라인은 <span className="text-[#0071E3]">{fmt(st.cutline)}</span> 입니다.</>}
        </span>
      </div>
    );
  }
  // TOP 10 안
  if (st.inTop10) {
    return (
      <div className="flex items-center gap-2.5 rounded-2xl bg-gradient-to-r from-[#F56300]/[0.1] to-[#F5A623]/[0.06] border border-[#F56300]/15 px-4 py-3">
        <Sparkles className="w-4 h-4 text-[#F56300] shrink-0" />
        <span className="text-xs font-bold text-[#1D1D1F]">
          {st.rank === 1
            ? <>🏆 {periodLabel} <span className="text-[#F56300]">1위</span>! 최고의 몰입이에요. 이 페이스를 지켜요!</>
            : st.nextUpGap != null
              ? <>🎉 TOP 10 진입! <span className="text-[#F56300]">{fmt(st.nextUpGap)}</span> 만 더 채우면 한 단계 상승해요.</>
              : <>🎉 {periodLabel} TOP 10 안에 들었어요!</>}
        </span>
      </div>
    );
  }
  // TOP 10 밖
  return (
    <div className="flex items-center gap-2.5 rounded-2xl bg-gradient-to-r from-[#0071E3]/[0.08] to-[#862BF7]/[0.06] border border-[#0071E3]/15 px-4 py-3">
      <TrendingUp className="w-4 h-4 text-[#0071E3] shrink-0" />
      <span className="text-xs font-bold text-[#1D1D1F]">
        {st.toTop10 > 0
          ? <>TOP 10까지 <span className="text-[#0071E3]">{fmt(st.toTop10)}</span> 더 채우면 진입!{st.nextUpGap != null && <span className="text-[#86868B] font-semibold"> · 한 칸 위까지 {fmt(st.nextUpGap)}</span>}</>
          : <>TOP 10 진입까지 한 걸음! 조금만 더 몰입해 보세요.</>}
      </span>
    </div>
  );
}
