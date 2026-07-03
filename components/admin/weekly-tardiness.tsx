'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, Loader2, TriangleAlert } from 'lucide-react';

interface Row { id: string; name: string; campus: string; expectedArrival: string; attendedDays: number; lateDays: number; lateRate: number }
interface Data {
  configured: boolean;
  weekStart?: string;
  today?: string;
  summary?: { lateStudents: number; totalLateDays: number };
  rows?: Row[];
}
type SortKey = 'name' | 'arrival' | 'attended' | 'late' | 'rate';
type SortDir = 'asc' | 'desc';

const campusLabel = (v: string) => ({ wonju: '원주', chuncheon: '춘천', chungju: '충주' } as Record<string, string>)[v] || '기타';

// 렌더 중에 컴포넌트를 새로 만들면 매 렌더마다 트리가 재생성되므로, 정렬 헤더 컴포넌트는 모듈 스코프로 분리한다.
function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ChevronsUpDown className="w-3 h-3 text-[#C7C7CC]" />;
  return dir === 'asc' ? <ChevronUp className="w-3 h-3 text-[#0071E3]" /> : <ChevronDown className="w-3 h-3 text-[#0071E3]" />;
}

function Th({ k, label, className = '', sortKey, sortDir, onSort }: { k: SortKey; label: string; className?: string; sortKey: SortKey; sortDir: SortDir; onSort: (k: SortKey) => void }) {
  return (
    <th className={`px-4 py-3 ${className}`}>
      <button onClick={() => onSort(k)} className="inline-flex items-center gap-1 font-bold text-slate-900 hover:text-[#0071E3]">{label} <SortIcon active={sortKey === k} dir={sortDir} /></button>
    </th>
  );
}

export function WeeklyTardiness({ campusFilter }: { campusFilter: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('late');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    (async () => {
      try {
        const res = await fetch('/api/admin/attendance/tardiness', { cache: 'no-store' });
        const json = await res.json();
        if (!active) return;
        if (res.ok && json.success) setData(json);
        else setError(json.message || '주간 지각 현황을 불러오지 못했습니다.');
      } catch { if (active) setError('네트워크 오류로 불러오지 못했습니다.'); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir(k === 'name' ? 'asc' : 'desc'); }
  };

  const rows = useMemo(() => {
    const filtered = (data?.rows || []).filter((r) => campusFilter === 'all' || r.campus === campusFilter);
    const dir = sortDir === 'asc' ? 1 : -1;
    const val = (r: Row): number | string => {
      switch (sortKey) {
        case 'name': return r.name;
        case 'arrival': { const [h, m] = (r.expectedArrival || '08:20').split(':').map(Number); return (h || 8) * 60 + (m || 0); }
        case 'attended': return r.attendedDays;
        case 'late': return r.lateDays * 1000 + r.lateRate;
        case 'rate': return r.lateRate;
      }
    };
    return [...filtered].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (typeof va === 'string' || typeof vb === 'string') return String(va).localeCompare(String(vb), 'ko') * dir;
      return (va - vb) * dir;
    });
  }, [data, campusFilter, sortKey, sortDir]);

  if (loading) return <div className="flex items-center justify-center py-16 bg-white rounded-2xl border border-black/[0.05]"><Loader2 className="w-6 h-6 text-[#0071E3] animate-spin mr-2" /><span className="text-xs text-slate-500">불러오는 중…</span></div>;
  if (error) return <div className="py-16 text-center text-sm text-red-600 font-semibold bg-white rounded-2xl border border-black/[0.05]">{error}</div>;

  return (
    <div className="space-y-3">
      {data?.summary && (
        <div className="flex flex-wrap gap-3 text-xs font-bold">
          <span className="px-3 py-1.5 rounded-full bg-red-50 text-red-700 border border-red-100">이번 주 지각 학생 {data.summary.lateStudents}명</span>
          <span className="px-3 py-1.5 rounded-full bg-[#FF9500]/10 text-[#FF9500] border border-[#FF9500]/15">누적 지각 {data.summary.totalLateDays}일</span>
          <span className="px-3 py-1.5 rounded-full bg-[#F5F5F7] text-slate-500">기준: {data?.weekStart} ~ {data?.today}</span>
        </div>
      )}
      <div className="bg-white border border-black/[0.05] rounded-2xl shadow-sm overflow-x-auto">
        {rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-500">이번 주 출결 기록이 없습니다.</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-[#F5F5F7] text-left border-b border-black/[0.05]">
              <tr>
                <Th k="name" label="이름" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <Th k="arrival" label="지각기준" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <Th k="attended" label="출석일" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <Th k="late" label="지각일" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <Th k="rate" label="지각률" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={`border-b border-black/[0.04] hover:bg-[#F5F5F7]/60 ${r.lateDays >= 3 ? 'bg-red-50/40' : ''}`}>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="font-bold text-slate-900">{r.name}</span>
                    <span className="ml-2 text-[9px] font-bold text-slate-500 bg-[#F5F5F7] px-1.5 py-0.5 rounded-full">{campusLabel(r.campus)}</span>
                  </td>
                  <td className="px-4 py-3 font-bold tabular-nums">{r.expectedArrival}</td>
                  <td className="px-4 py-3 tabular-nums">{r.attendedDays}일</td>
                  <td className="px-4 py-3">
                    {r.lateDays > 0
                      ? <span className={`font-bold tabular-nums inline-flex items-center gap-0.5 ${r.lateDays >= 3 ? 'text-red-700' : 'text-[#FF9500]'}`}>{r.lateDays}일{r.lateDays >= 3 && <TriangleAlert className="w-3 h-3 shrink-0" />}</span>
                      : <span className="text-emerald-700 font-bold">0일</span>}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-slate-500">{r.lateRate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-[10px] text-slate-500 text-center">이번 주 학생별 지각 누적(본인 기준 대비). 지각 3일 이상은 <TriangleAlert className="inline w-2.5 h-2.5 -mt-0.5" /> 강조됩니다. 컬럼 머리글로 정렬하세요.</p>
    </div>
  );
}
