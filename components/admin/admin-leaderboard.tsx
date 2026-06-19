'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trophy, Flame, RefreshCw, Loader2, Clock } from 'lucide-react';

interface Row { rank: number; id: string; name: string; campus: string; weekMinutes: number; dayMinutes: number; isOpen: boolean }
interface Data {
  configured: boolean;
  liveCount?: number;
  summary?: { total: number; studied: number; notStudied: number; avgWeekMin: number };
  rows?: Row[];
}

interface Props {
  campusFilter: string;
  refreshSignal?: number;
  onSelectStudentId: (id: string) => void;
}

const campusLabel = (v: string) => ({ wonju: '원주', chuncheon: '춘천', chungju: '충주' } as Record<string, string>)[v] || '기타';
const fmt = (m: number) => {
  if (!m || m <= 0) return '0분';
  const h = Math.floor(m / 60);
  const min = m % 60;
  return h > 0 ? `${h}시간 ${min}분` : `${min}분`;
};
const medal = (rank: number) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}`);

export function AdminLeaderboard({ campusFilter, refreshSignal, onSelectStudentId }: Props) {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/admin/leaderboard', { cache: 'no-store' });
      const json = await res.json();
      if (res.ok && json.success) setData(json);
      else setError(json.message || '랭킹을 불러오지 못했습니다.');
    } catch { setError('네트워크 오류로 랭킹을 불러오지 못했습니다.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load, refreshSignal]);

  const wrap = 'admin-fit-box bg-white/95 border border-black/[0.04] rounded-3xl shadow-premium backdrop-blur-md p-5 transition-premium hover:shadow-premium-hover';

  if (loading && !data) {
    return (
      <div className={`${wrap} flex flex-col items-center justify-center py-12`}>
        <Loader2 className="w-6 h-6 text-[#0071E3] animate-spin mb-2" />
        <span className="text-xs text-[#86868B] font-semibold">순공 랭킹 불러오는 중…</span>
      </div>
    );
  }
  if (error) {
    return (
      <div className={`${wrap} flex items-center justify-between gap-3 py-6`}>
        <p className="text-xs text-red-600 font-semibold">{error}</p>
        <button onClick={load} className="text-xs font-bold text-[#0071E3] hover:underline shrink-0">다시 시도</button>
      </div>
    );
  }
  if (data && data.configured === false) {
    return (
      <div className={`${wrap} flex items-center gap-3 py-6`}>
        <Clock className="w-5 h-5 text-[#86868B] shrink-0" />
        <p className="text-xs text-[#86868B] font-semibold">출결 연동(Supabase) 미설정 — 순공 랭킹을 표시할 수 없습니다.</p>
      </div>
    );
  }

  const scopedRows = (data?.rows || []).filter((r) => campusFilter === 'all' || r.campus === campusFilter);
  const rows = scopedRows.map((r, index) => ({ ...r, rank: index + 1 }));
  const studiedCount = rows.filter((r) => r.weekMinutes > 0).length;
  const notStudiedCount = rows.filter((r) => r.weekMinutes === 0).length;
  const avgWeekMin = rows.length > 0 ? Math.round(rows.reduce((sum, r) => sum + r.weekMinutes, 0) / rows.length) : 0;
  const liveCount = rows.filter((r) => r.isOpen).length;
  const selectedCampusLabel = campusFilter === 'all' ? '전체' : campusLabel(campusFilter);

  // 랭킹 뱃지 스타일 헬퍼
  const getRankBadgeStyle = (rank: number, hasMinutes: boolean) => {
    if (!hasMinutes) return 'bg-[#F5F5F7] text-[#86868B] border border-black/[0.03]';
    switch (rank) {
      case 1:
        return 'bg-amber-100 text-amber-800 border border-amber-200 font-black shadow-sm';
      case 2:
        return 'bg-slate-100 text-slate-800 border border-slate-200 font-black shadow-sm';
      case 3:
        return 'bg-orange-100 text-orange-800 border border-orange-200 font-black shadow-sm';
      default:
        return 'bg-[#F5F5F7] text-[#434345] font-bold border border-black/[0.02]';
    }
  };

  return (
    <div className={wrap}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <Trophy className="w-4 h-4 text-[#F56300]" />
          <h3 className="admin-fit-text text-sm font-black text-[#1D1D1F] tracking-tight">주간 순공 랭킹 <span className="text-[#86868B] font-semibold">({selectedCampusLabel})</span></h3>
          {campusFilter !== 'all' && (
            <span className="text-[10px] font-extrabold text-[#0071E3] bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-md">{campusLabel(campusFilter)}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {liveCount > 0 && (
            <span className="inline-flex items-center gap-1.5 text-[9px] font-black text-emerald-800 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full mr-1">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
              </span>
              {liveCount}명 몰입 중
            </span>
          )}
          <button
            onClick={() => router.push('/admin/leaderboard')}
            className="text-[11px] font-bold text-[#86868B] hover:text-[#1D1D1F] transition-colors px-2 py-1 rounded-lg hover:bg-[#F5F5F7]"
          >
            자세히
          </button>
          <button onClick={load} disabled={loading} className="text-[#86868B] hover:text-[#1D1D1F] transition-colors disabled:opacity-50 p-1 rounded-lg hover:bg-[#F5F5F7]" title="랭킹 새로고침">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-4 text-[10px] font-extrabold text-[#86868B] bg-[#F5F5F7]/80 rounded-xl px-3.5 py-2.5 border border-black/[0.02]">
        <span>누적 학습 <span className="text-emerald-700">{studiedCount}명</span></span>
        <span className="w-px h-3 bg-black/[0.08] self-center"></span>
        <span>미학습 <span className="text-amber-600">{notStudiedCount}명</span></span>
        <span className="w-px h-3 bg-black/[0.08] self-center"></span>
        <span>평균 순공 <span className="text-[#1D1D1F]">{fmt(avgWeekMin)}</span></span>
      </div>

      <div className="max-h-[250px] overflow-y-auto custom-scrollbar -mx-1 px-1 space-y-1">
        {rows.length === 0 ? (
          <p className="text-[11px] text-[#86868B] font-semibold text-center py-8">표시할 학생이 없습니다.</p>
        ) : rows.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => onSelectStudentId(r.id)}
            className={`w-full flex items-center justify-between gap-3 px-3 py-3 rounded-xl hover:bg-[#F5F5F7]/85 hover:translate-x-0.5 active:translate-x-0 transition-premium text-left ${
              r.weekMinutes === 0 ? 'opacity-55' : ''
            }`}
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] shrink-0 ${getRankBadgeStyle(r.rank, r.weekMinutes > 0)}`}>
                {r.weekMinutes > 0 ? (r.rank <= 3 ? medal(r.rank) : r.rank) : '–'}
              </span>
              <span className="text-xs font-semibold text-[#1D1D1F] truncate">{r.name}</span>
              <span className="text-[9px] font-extrabold text-[#86868B] bg-[#F5F5F7] px-2 py-0.5 rounded-md border border-black/[0.03] shrink-0">{campusLabel(r.campus)}</span>
              {r.isOpen && (
                <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100/80 px-1.5 py-0.5 rounded-md shrink-0">
                  <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse"></span>
                  등원중
                </span>
              )}
            </span>
            <span className="flex items-center gap-2 shrink-0">
              {r.dayMinutes > 0 && (
                <span className="text-[9px] font-medium text-[#86868B] bg-black/[0.02] px-1.5 py-0.5 rounded-md border border-black/[0.01]">
                  오늘 {fmt(r.dayMinutes)}
                </span>
              )}
              <span className={`text-xs font-extrabold ${r.weekMinutes === 0 ? 'text-amber-600' : 'text-[#1D1D1F]'}`}>
                {r.weekMinutes === 0 ? '미학습' : fmt(r.weekMinutes)}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
