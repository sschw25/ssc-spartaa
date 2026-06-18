'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronUp, ChevronDown, ChevronsUpDown, Loader2, RefreshCw, CalendarDays } from 'lucide-react';

interface Row {
  id: string; name: string; campus: string;
  checkIn: string; checkInMin: number;
  checkOut: string | null; checkOutMin: number | null;
  minutes: number; isOpen: boolean;
  late: 'ontime' | 'late0820' | 'late0900';
}
interface Data {
  configured: boolean;
  date?: string;
  total?: number;
  attended?: number;
  lateCount?: { late0820: number; late0900: number; ontime: number };
  rows?: Row[];
}

type SortKey = 'name' | 'checkIn' | 'checkOut' | 'minutes' | 'late';
type SortDir = 'asc' | 'desc';

const campusLabel = (v: string) => ({ wonju: '원주', chuncheon: '춘천', chungju: '충주' } as Record<string, string>)[v] || '기타';
const fmtMin = (m: number) => {
  if (!m || m <= 0) return '-';
  const h = Math.floor(m / 60); const min = m % 60;
  return h > 0 ? `${h}시간 ${min}분` : `${min}분`;
};
const lateBadge = (late: Row['late']) => {
  if (late === 'late0900') return { text: '09:00 지각', cls: 'text-red-700 bg-red-50 border-red-100' };
  if (late === 'late0820') return { text: '08:20 지각', cls: 'text-[#F56300] bg-[#F56300]/10 border-[#F56300]/15' };
  return { text: '정시', cls: 'text-emerald-700 bg-emerald-50 border-emerald-100' };
};

function todayKST() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
}
function shiftDate(date: string, delta: number) {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

export default function AdminAttendancePage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [date, setDate] = useState(todayKST());
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [campusFilter, setCampusFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('checkIn');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/auth/me');
        if (!res.ok) { router.replace('/admin'); return; }
      } catch { router.replace('/admin'); return; }
      finally { setCheckingAuth(false); }
    })();
  }, [router]);

  useEffect(() => {
    if (checkingAuth) return;
    let active = true;
    setLoading(true); setError('');
    (async () => {
      try {
        const res = await fetch(`/api/admin/attendance/log?date=${date}`, { cache: 'no-store' });
        const json = await res.json();
        if (!active) return;
        if (res.ok && json.success) setData(json);
        else setError(json.message || '출결 로그를 불러오지 못했습니다.');
      } catch { if (active) setError('네트워크 오류로 출결 로그를 불러오지 못했습니다.'); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [date, checkingAuth]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const rows = useMemo(() => {
    const filtered = (data?.rows || []).filter((r) => campusFilter === 'all' || r.campus === campusFilter);
    const lateOrder = { ontime: 0, late0820: 1, late0900: 2 };
    const dir = sortDir === 'asc' ? 1 : -1;
    const val = (r: Row): number | string => {
      switch (sortKey) {
        case 'name': return r.name;
        case 'checkIn': return r.checkInMin;
        case 'checkOut': return r.checkOutMin ?? Number.MAX_SAFE_INTEGER; // 미하원은 뒤로
        case 'minutes': return r.minutes;
        case 'late': return lateOrder[r.late];
      }
    };
    return [...filtered].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (typeof va === 'string' || typeof vb === 'string') return String(va).localeCompare(String(vb), 'ko') * dir;
      return (va - vb) * dir;
    });
  }, [data, campusFilter, sortKey, sortDir]);

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey !== k ? <ChevronsUpDown className="w-3 h-3 text-[#C7C7CC]" />
      : sortDir === 'asc' ? <ChevronUp className="w-3 h-3 text-[#0071E3]" /> : <ChevronDown className="w-3 h-3 text-[#0071E3]" />;

  const Th = ({ k, label, className = '' }: { k: SortKey; label: string; className?: string }) => (
    <th className={`px-4 py-3 ${className}`}>
      <button onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 font-bold text-[#1D1D1F] hover:text-[#0071E3]">
        {label} <SortIcon k={k} />
      </button>
    </th>
  );

  if (checkingAuth) {
    return <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7]"><Loader2 className="w-8 h-8 text-[#0071E3] animate-spin" /></div>;
  }

  return (
    <div className="min-h-screen bg-[#F5F5F7] font-sans text-[#1D1D1F]">
      <nav className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-black/[0.05] px-4 md:px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/admin/dashboard')} className="flex items-center gap-1.5 text-xs font-bold text-[#86868B] hover:text-[#1D1D1F]">
            <ArrowLeft className="w-4 h-4" /> 대시보드
          </button>
          <h1 className="text-sm font-bold">출결 상세 표</h1>
        </div>
        <button onClick={() => setDate((d) => d)} className="text-[#86868B] hover:text-[#1D1D1F]" title="새로고침">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </nav>

      <main className="max-w-5xl mx-auto p-4 md:p-8 space-y-5">
        {/* 날짜 + 캠퍼스 + 지각 요약 */}
        <div className="bg-white border border-black/[0.05] rounded-2xl shadow-sm p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button onClick={() => setDate((d) => shiftDate(d, -1))} className="px-2.5 py-1.5 rounded-lg border border-black/[0.08] text-xs font-bold hover:bg-[#F5F5F7]">◀ 어제</button>
            <div className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F5F5F7] border border-black/[0.05]">
              <CalendarDays className="w-3.5 h-3.5 text-[#86868B]" />
              <input type="date" value={date} max={todayKST()} onChange={(e) => e.target.value && setDate(e.target.value)} className="bg-transparent text-xs font-bold outline-none" />
            </div>
            <button onClick={() => setDate((d) => shiftDate(d, 1))} disabled={date >= todayKST()} className="px-2.5 py-1.5 rounded-lg border border-black/[0.08] text-xs font-bold hover:bg-[#F5F5F7] disabled:opacity-40">내일 ▶</button>
            <button onClick={() => setDate(todayKST())} className="px-2.5 py-1.5 rounded-lg bg-[#1D1D1F] text-white text-xs font-bold">오늘</button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {['all', 'wonju', 'chuncheon', 'chungju'].map((c) => (
              <button key={c} onClick={() => setCampusFilter(c)} className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold ${campusFilter === c ? 'bg-[#0071E3] text-white' : 'bg-[#F5F5F7] text-[#86868B]'}`}>
                {c === 'all' ? '전체' : campusLabel(c)}
              </button>
            ))}
          </div>
        </div>

        {data?.lateCount && (
          <div className="flex flex-wrap gap-3 text-xs font-bold">
            <span className="px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">정시 {data.lateCount.ontime}</span>
            <span className="px-3 py-1.5 rounded-full bg-[#F56300]/10 text-[#F56300] border border-[#F56300]/15">08:20 지각 {data.lateCount.late0820}</span>
            <span className="px-3 py-1.5 rounded-full bg-red-50 text-red-700 border border-red-100">09:00 지각 {data.lateCount.late0900}</span>
            <span className="px-3 py-1.5 rounded-full bg-[#F5F5F7] text-[#86868B]">출석 {data.attended ?? rows.length} / {data.total ?? '-'}</span>
          </div>
        )}

        {/* 표 */}
        <div className="bg-white border border-black/[0.05] rounded-2xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-[#0071E3] animate-spin mr-2" /><span className="text-xs text-[#86868B]">불러오는 중…</span></div>
          ) : error ? (
            <div className="py-16 text-center text-sm text-red-600 font-semibold">{error}</div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-sm text-[#86868B]">이 날짜에 출결 기록이 없습니다.</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-[#F5F5F7] text-left border-b border-black/[0.05]">
                <tr>
                  <Th k="name" label="이름" />
                  <Th k="checkIn" label="등원시간" />
                  <Th k="checkOut" label="하원시간" />
                  <Th k="minutes" label="체류" className="hidden sm:table-cell" />
                  <Th k="late" label="지각" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const b = lateBadge(r.late);
                  return (
                    <tr key={r.id} className="border-b border-black/[0.04] hover:bg-[#F5F5F7]/60">
                      <td className="px-4 py-3">
                        <span className="font-bold text-[#1D1D1F]">{r.name}</span>
                        <span className="ml-2 text-[9px] font-bold text-[#86868B] bg-[#F5F5F7] px-1.5 py-0.5 rounded-full">{campusLabel(r.campus)}</span>
                      </td>
                      <td className="px-4 py-3 font-bold tabular-nums">{r.checkIn}</td>
                      <td className="px-4 py-3 font-bold tabular-nums">
                        {r.checkOut ? r.checkOut : <span className="text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-full text-[10px]">등원중</span>}
                      </td>
                      <td className="px-4 py-3 text-[#86868B] hidden sm:table-cell">{fmtMin(r.minutes)}</td>
                      <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${b.cls}`}>{b.text}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <p className="text-[10px] text-[#86868B] text-center">지각 기준: 08:20 이후 등원 = 08:20 지각, 09:00 이후 등원 = 09:00 지각. 컬럼 머리글을 누르면 정렬됩니다.</p>
      </main>
    </div>
  );
}
