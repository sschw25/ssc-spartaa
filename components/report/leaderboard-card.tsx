'use client';

import React, { useEffect, useState } from 'react';
import { Trophy, Flame, Users, Loader2 } from 'lucide-react';

interface Entry { rank: number; name: string; campus: string; minutes: number; isMe: boolean }
interface Data {
  configured: boolean;
  liveCount?: number;
  leaderboard?: { top: Entry[]; my: { rank: number; minutes: number; total: number } | null; total: number };
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
  if (!data || data.configured === false || !data.leaderboard || data.leaderboard.total === 0) return null;

  const { top, my } = data.leaderboard;

  return (
    <div className="rounded-3xl border border-black/[0.05] bg-white p-6 md:p-8 shadow-sm space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-[#F56300]" />
          <h3 className="text-base font-bold text-[#1D1D1F]">이번 주 순공 랭킹</h3>
        </div>
        {typeof data.liveCount === 'number' && data.liveCount > 0 && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full">
            <Flame className="w-3.5 h-3.5 text-emerald-600" /> 지금 {data.liveCount}명 몰입 중
          </span>
        )}
      </div>

      {my && (
        <div className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-[#0071E3]/[0.08] to-[#862BF7]/[0.06] border border-[#0071E3]/15 px-4 py-3">
          <span className="text-xs font-bold text-[#0071E3] flex items-center gap-1.5">
            <Users className="w-4 h-4" /> 내 등수
          </span>
          <span className="text-sm font-bold text-[#1D1D1F]">
            <span className="text-[#0071E3]">{my.rank}등</span> / {my.total}명 · {fmt(my.minutes)}
          </span>
        </div>
      )}

      <div className="space-y-1">
        {top.map((e) => (
          <div
            key={e.rank}
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

      <p className="text-[10px] text-[#86868B] text-center">QR 등하원으로 측정된 이번 주 순공 시간 기준입니다. 이름은 보호를 위해 일부 가려집니다.</p>
    </div>
  );
}
