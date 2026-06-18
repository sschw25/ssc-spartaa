'use client';

import React, { useEffect, useState } from 'react';
import { Trophy, Flame, Loader2, Target, Sparkles } from 'lucide-react';

interface Entry { rank: number; name: string; campus: string; minutes: number; isMe: boolean }
interface MeInfo { inTop: boolean; rank: number | null; myMinutes: number; hasRecord: boolean; minutesToEnterTop: number }
interface Board { top: Entry[]; me: MeInfo }
interface Data {
  configured: boolean;
  liveCount?: number;
  week?: Board;
  day?: Board;
}

const fmt = (m: number) => {
  const h = Math.floor(m / 60);
  const min = Math.round(m % 60);
  return h > 0 ? `${h}시간 ${min}분` : `${min}분`;
};
const campusLabel = (v: string) => ({ wonju: '원주', chuncheon: '춘천', chungju: '충주' } as Record<string, string>)[v] || '기타';
const medal = (rank: number) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}`);

export function LeaderboardCard() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'week' | 'day'>('week');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/leaderboard', { cache: 'no-store' });
        const json = await res.json();
        if (active && res.ok && json.success) setData(json);
      } catch { /* 무시 — 랭킹은 부가 정보 */ }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  if (loading) {
    return (
      <div className="rounded-3xl border border-black/[0.05] bg-white p-6 md:p-8 shadow-sm flex items-center justify-center py-10">
        <Loader2 className="w-5 h-5 text-[#0071E3] animate-spin mr-2" />
        <span className="text-sm text-[#86868B]">랭킹 불러오는 중…</span>
      </div>
    );
  }
  if (!data || data.configured === false || !data.week) return null;
  // 이번 주에 아무도 기록이 없으면 숨김
  if (data.week.top.length === 0 && !data.week.me.hasRecord) return null;

  const board: Board = period === 'day' ? (data.day || data.week) : data.week;
  const top = board.top;
  const me = board.me;
  const periodLabel = period === 'day' ? '오늘' : '이번 주';

  return (
    <div className="rounded-3xl border border-black/[0.05] bg-white p-6 md:p-8 shadow-sm space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-[#F56300]" />
          <h3 className="text-base font-bold text-[#1D1D1F]">{periodLabel} 순공 랭킹 <span className="text-[#F56300]">TOP 10</span></h3>
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

      {/* 내 위치 — 동기부여 배너 (절대 등수/총원은 노출하지 않음) */}
      <MeBanner me={me} periodLabel={periodLabel} />

      <div className="space-y-1">
        {top.length === 0 && (
          <p className="text-[11px] text-[#86868B] font-semibold text-center py-6">
            {period === 'day' ? '오늘은 아직 순공 기록이 없어요. 등하원을 체크하면 랭킹에 반영됩니다.' : '아직 이번 주 순공 기록이 없어요.'}
          </p>
        )}
        {top.map((e, i) => (
          <div
            key={`${period}-${i}`}
            className={`flex items-center justify-between px-3 py-2.5 rounded-xl ${
              e.isMe ? 'bg-[#0071E3]/[0.06] border border-[#0071E3]/15' : 'hover:bg-[#F5F5F7]'
            }`}
          >
            <span className="flex items-center gap-3 min-w-0">
              <span className={`w-7 text-center text-sm font-black ${e.rank <= 3 ? '' : 'text-[#86868B]'}`}>{medal(e.rank)}</span>
              <span className="text-sm font-bold text-[#1D1D1F] truncate">{e.name}{e.isMe && <span className="text-[#0071E3]"> (나)</span>}</span>
              <span className="text-[9px] font-bold text-[#86868B] bg-[#F5F5F7] px-1.5 py-0.5 rounded-full shrink-0">{campusLabel(e.campus)}</span>
            </span>
            <span className="text-xs font-bold text-[#1D1D1F] shrink-0">{fmt(e.minutes)}</span>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-[#86868B] text-center">QR 등하원으로 측정된 {periodLabel} 순공 시간 기준입니다. 이름은 보호를 위해 일부 가려집니다.</p>
    </div>
  );
}

// 내 위치 배너 — 절대 등수/총원 비노출, "얼마나 더 채우면 TOP10" 중심
function MeBanner({ me, periodLabel }: { me: MeInfo; periodLabel: string }) {
  if (me.inTop && me.rank) {
    return (
      <div className="flex items-center gap-2.5 rounded-2xl bg-gradient-to-r from-[#F56300]/[0.1] to-[#F5A623]/[0.06] border border-[#F56300]/15 px-4 py-3">
        <Sparkles className="w-4 h-4 text-[#F56300] shrink-0" />
        <span className="text-xs font-bold text-[#1D1D1F]">
          🎉 현재 <span className="text-[#F56300]">{periodLabel} {me.rank}등</span> · TOP 10 유지 중! ({fmt(me.myMinutes)})
        </span>
      </div>
    );
  }
  if (!me.hasRecord) {
    return (
      <div className="flex items-center gap-2.5 rounded-2xl bg-[#0071E3]/[0.05] border border-[#0071E3]/15 px-4 py-3">
        <Target className="w-4 h-4 text-[#0071E3] shrink-0" />
        <span className="text-xs font-bold text-[#1D1D1F]">{periodLabel} 첫 순공을 기록하고 TOP 10에 도전해 보세요!</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2.5 rounded-2xl bg-gradient-to-r from-[#0071E3]/[0.08] to-[#862BF7]/[0.06] border border-[#0071E3]/15 px-4 py-3">
      <Target className="w-4 h-4 text-[#0071E3] shrink-0" />
      <span className="text-xs font-bold text-[#1D1D1F]">
        {me.minutesToEnterTop > 0 ? (
          <>TOP 10까지 <span className="text-[#0071E3]">{fmt(me.minutesToEnterTop)}</span> 더 채우면 진입! <span className="text-[#86868B] font-semibold">(현재 {fmt(me.myMinutes)})</span></>
        ) : (
          <>TOP 10 진입까지 한 걸음! 조금만 더 몰입해 보세요. <span className="text-[#86868B] font-semibold">(현재 {fmt(me.myMinutes)})</span></>
        )}
      </span>
    </div>
  );
}
