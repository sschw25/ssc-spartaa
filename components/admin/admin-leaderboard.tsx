'use client';

import React, { useCallback, useEffect, useState } from 'react';
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

  const wrap = 'admin-fit-box bg-white border border-black/[0.05] rounded-2xl shadow-sm p-4.5';

  if (loading && !data) {
    return <div className={`${wrap} flex items-center justify-center py-8`}><Loader2 className="w-5 h-5 text-[#0071E3] animate-spin mr-2" /><span className="text-xs text-[#86868B]">순공 랭킹 불러오는 중…</span></div>;
  }
  if (error) {
    return <div className={`${wrap} flex items-center justify-between gap-3`}><p className="text-xs text-red-600 font-semibold">{error}</p><button onClick={load} className="text-[11px] font-bold text-[#0071E3] hover:underline shrink-0">다시 시도</button></div>;
  }
  if (data && data.configured === false) {
    return <div className={`${wrap} flex items-center gap-3`}><Clock className="w-4 h-4 text-[#86868B] shrink-0" /><p className="text-[11px] text-[#86868B] font-semibold">출결 연동(Supabase) 미설정 — 순공 랭킹을 표시할 수 없습니다.</p></div>;
  }

  const rows = (data?.rows || []).filter((r) => campusFilter === 'all' || r.campus === campusFilter);
  const s = data?.summary;

  return (
    <div className={wrap}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <Trophy className="w-4 h-4 text-[#F56300]" />
          <h3 className="admin-fit-text text-sm font-bold text-[#1D1D1F]">주간 순공 랭킹 <span className="text-[#86868B] font-semibold">(전체)</span></h3>
          {campusFilter !== 'all' && <span className="text-[10px] font-bold text-[#0071E3] bg-blue-50 px-1.5 py-0.5 rounded-full">{campusLabel(campusFilter)}</span>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {typeof data?.liveCount === 'number' && data.liveCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full"><Flame className="w-3 h-3 text-emerald-600" />{data.liveCount} 몰입</span>
          )}
          <button onClick={load} disabled={loading} className="text-[#86868B] hover:text-[#1D1D1F] disabled:opacity-50" title="랭킹 새로고침"><RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>
      </div>

      {s && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 text-[10px] font-bold text-[#86868B]">
          <span>학습 <span className="text-emerald-600">{rows.filter((r) => r.weekMinutes > 0).length}</span></span>
          <span>미학습 <span className="text-[#F56300]">{rows.filter((r) => r.weekMinutes === 0).length}</span></span>
          {campusFilter === 'all' && <span>평균 순공 {fmt(s.avgWeekMin)}</span>}
        </div>
      )}

      <div className="max-h-96 overflow-y-auto -mx-1 px-1 space-y-0.5">
        {rows.length === 0 ? (
          <p className="text-[11px] text-[#86868B] font-semibold text-center py-6">표시할 학생이 없습니다.</p>
        ) : rows.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => onSelectStudentId(r.id)}
            className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-[#F5F5F7] transition-colors text-left ${r.weekMinutes === 0 ? 'opacity-60' : ''}`}
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <span className={`w-7 text-center text-xs font-black shrink-0 ${r.rank <= 3 && r.weekMinutes > 0 ? '' : 'text-[#86868B]'}`}>{r.weekMinutes > 0 ? medal(r.rank) : '–'}</span>
              <span className="text-xs font-bold text-[#1D1D1F] truncate">{r.name}</span>
              <span className="text-[9px] font-bold text-[#86868B] bg-[#F5F5F7] px-1.5 py-0.5 rounded-full shrink-0">{campusLabel(r.campus)}</span>
              {r.isOpen && <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full shrink-0">등원중</span>}
            </span>
            <span className="flex items-center gap-2.5 shrink-0">
              {r.dayMinutes > 0 && <span className="text-[10px] font-bold text-[#86868B]">오늘 {fmt(r.dayMinutes)}</span>}
              <span className={`text-xs font-bold ${r.weekMinutes === 0 ? 'text-[#F56300]' : 'text-[#1D1D1F]'}`}>{r.weekMinutes === 0 ? '미학습' : fmt(r.weekMinutes)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
