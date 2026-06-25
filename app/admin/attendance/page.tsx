'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Loader2,
  RefreshCw,
  Save,
  Search,
  Trash2,
} from 'lucide-react';
import { WeeklyTardiness } from '@/components/admin/weekly-tardiness';
import { Button } from '@/components/ui/button';
import { AdminTopNav } from '@/components/admin/admin-top-nav';

type Arrival = '08:20' | '09:00';
type StatusFilter = 'all' | 'present' | 'left' | 'absent' | 'late';

interface Row {
  id: string;
  name: string;
  campus: string;
  checkIn: string;
  checkInMin: number;
  checkOut: string | null;
  checkOutMin: number | null;
  minutes: number | null;
  autoClosed?: boolean;
  isOpen: boolean;
  expectedArrival: Arrival;
  isLate: boolean;
  isAbsent?: boolean;
}

interface Data {
  configured: boolean;
  date?: string;
  total?: number;
  attended?: number;
  summary?: {
    ontime: number;
    late: number;
    group0820: { total: number; late: number };
    group0900: { total: number; late: number };
  };
  rows?: Row[];
}

type SortKey = 'name' | 'checkIn' | 'checkOut' | 'minutes' | 'arrival' | 'late';
type SortDir = 'asc' | 'desc';

const DEADLINE: Record<Arrival, number> = { '08:20': 500, '09:00': 540 };
const statusOptions: Array<{ key: StatusFilter; label: string }> = [
  { key: 'all', label: '전체' },
  { key: 'present', label: '등원 중' },
  { key: 'left', label: '하원' },
  { key: 'absent', label: '미등원' },
  { key: 'late', label: '지각' },
];

const campusLabel = (v: string) => ({ wonju: '원주', chuncheon: '춘천', chungju: '충주' } as Record<string, string>)[v] || '기타';
const fmtMin = (m?: number | null) => {
  if (m == null || m <= 0) return '-';
  const h = Math.floor(m / 60);
  const min = m % 60;
  return h > 0 ? `${h}시간 ${min}분` : `${min}분`;
};

const todayKST = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());

function shiftDate(date: string, delta: number) {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

export default function AdminAttendancePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]"><Loader2 className="w-8 h-8 text-[#0071E3] animate-spin" /></div>}>
      <AdminAttendanceContent />
    </Suspense>
  );
}

function AdminAttendanceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialStatus = (searchParams.get('status') || 'all') as StatusFilter;

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [date, setDate] = useState(todayKST());
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [error, setError] = useState('');
  const [campusFilter, setCampusFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(statusOptions.some((o) => o.key === initialStatus) ? initialStatus : 'all');
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'daily' | 'weekly'>('daily');
  const [sortKey, setSortKey] = useState<SortKey>('checkIn');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [reloadKey, setReloadKey] = useState(0);
  const [edits, setEdits] = useState<Record<string, { checkIn: string; checkOut: string }>>({});

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/auth/me');
        if (!res.ok) {
          router.replace('/admin');
          return;
        }
      } catch {
        router.replace('/admin');
        return;
      } finally {
        setCheckingAuth(false);
      }
    })();
  }, [router]);

  useEffect(() => {
    if (checkingAuth) return;
    let active = true;
    setLoading(true);
    setError('');
    (async () => {
      try {
        const res = await fetch(`/api/admin/attendance/log?date=${date}&includeAbsent=1`, { cache: 'no-store' });
        const json = await res.json();
        if (!active) return;
        if (res.ok && json.success) {
          setData(json);
          setEdits(Object.fromEntries((json.rows || []).map((r: Row) => [r.id, { checkIn: r.checkIn || '', checkOut: r.checkOut || '' }])));
        } else {
          setError(json.message || '출결 로그를 불러오지 못했습니다.');
        }
      } catch {
        if (active) setError('네트워크 오류로 출결 로그를 불러오지 못했습니다.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [date, checkingAuth, reloadKey]);

  const changeArrival = async (id: string, value: Arrival) => {
    setData((prev) => prev && {
      ...prev,
      rows: (prev.rows || []).map((r) => (r.id === id ? { ...r, expectedArrival: value, isLate: !r.isAbsent && r.checkInMin > DEADLINE[value] } : r)),
    });
    try {
      const res = await fetch(`/api/admin/students/${id}/arrival`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedArrival: value }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || '저장 실패');
      toast.success(`지각 기준을 ${value} 으로 저장했습니다.`);
    } catch (e: any) {
      toast.error(e?.message || '지각 기준 저장에 실패했습니다.');
      setReloadKey((k) => k + 1);
    }
  };

  const saveManual = async (row: Row, clear = false) => {
    const edit = edits[row.id] || { checkIn: '', checkOut: '' };
    setSavingId(row.id);
    try {
      const res = await fetch('/api/admin/attendance/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: row.id,
          date,
          checkIn: edit.checkIn,
          checkOut: edit.checkOut,
          clear,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || '저장 실패');
      toast.success(clear ? '출결 기록을 삭제하고 미등원 처리했습니다.' : '출결 시간이 저장되었습니다.');
      setReloadKey((k) => k + 1);
    } catch (e: any) {
      toast.error(e?.message || '출결 저장에 실패했습니다.');
    } finally {
      setSavingId('');
    }
  };

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = (data?.rows || [])
      .filter((r) => campusFilter === 'all' || r.campus === campusFilter)
      .filter((r) => !normalizedQuery || r.name.toLowerCase().includes(normalizedQuery))
      .filter((r) => {
        if (statusFilter === 'present') return r.isOpen;
        if (statusFilter === 'left') return !r.isAbsent && (!!r.checkOut || !!r.autoClosed);
        if (statusFilter === 'absent') return !!r.isAbsent;
        if (statusFilter === 'late') return r.isLate;
        return true;
      });

    const dir = sortDir === 'asc' ? 1 : -1;
    const val = (r: Row): number | string => {
      switch (sortKey) {
        case 'name': return r.name;
        case 'checkIn': return r.isAbsent ? Number.MAX_SAFE_INTEGER : r.checkInMin;
        case 'checkOut': return r.checkOutMin ?? Number.MAX_SAFE_INTEGER;
        case 'minutes': return r.minutes ?? -1;
        case 'arrival': return DEADLINE[r.expectedArrival];
        case 'late': return (r.isLate ? 1 : 0) * 100000 + (r.isAbsent ? Number.MAX_SAFE_INTEGER : r.checkInMin);
      }
    };
    return [...filtered].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (typeof va === 'string' || typeof vb === 'string') return String(va).localeCompare(String(vb), 'ko') * dir;
      return (va - vb) * dir;
    });
  }, [data, campusFilter, statusFilter, query, sortKey, sortDir]);

  const renderSortIcon = (k: SortKey) =>
    sortKey !== k ? <ChevronsUpDown className="w-3 h-3 text-[#C7C7CC]" />
      : sortDir === 'asc' ? <ChevronUp className="w-3 h-3 text-[#0071E3]" /> : <ChevronDown className="w-3 h-3 text-[#0071E3]" />;

  const renderTh = (k: SortKey, label: string, className = '') => (
    <th className={`px-4 py-3 ${className}`}>
      <button onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 font-bold text-[#1D1D1F] hover:text-[#0071E3]">
        {label} {renderSortIcon(k)}
      </button>
    </th>
  );

  if (checkingAuth) {
    return <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]"><Loader2 className="w-8 h-8 text-[#0071E3] animate-spin" /></div>;
  }

  const s = data?.summary;

  return (
    <div className="admin-fluid-ui min-h-screen bg-[#F8F9FA] font-sans text-[#1D1D1F]">
      <AdminTopNav
        title="출결 상세 표"
        campusOptions={['all', 'wonju', 'chuncheon', 'chungju'].map((c) => ({ value: c, label: c === 'all' ? '전체' : campusLabel(c) }))}
        campusValue={campusFilter}
        onCampusChange={setCampusFilter}
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={() => setReloadKey((k) => k + 1)}
            className="admin-fit-button rounded-2xl border-black/[0.05] hover:bg-[#F5F5F7] text-xs h-9.5 bg-white px-3 shadow-[0_2px_8px_rgba(0,0,0,0.01)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.04)] transition-premium"
            title="새로고침"
          >
            <RefreshCw className={`w-3.5 h-3.5 md:mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline font-bold">새로고침</span>
          </Button>
        }
      />

      <main className="max-w-6xl mx-auto p-4 md:p-8 space-y-5">
        <div className="bg-white border border-black/[0.05] rounded-2xl shadow-sm p-4 space-y-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="inline-flex p-0.5 rounded-lg bg-[#F5F5F7] border border-black/[0.05]">
                {([['daily', '일별'], ['weekly', '주간 지각']] as const).map(([k, label]) => (
                  <button key={k} onClick={() => setMode(k)} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${mode === k ? 'bg-white text-[#1D1D1F] shadow-sm' : 'text-[#86868B]'}`}>{label}</button>
                ))}
              </div>
              {mode === 'daily' && (
                <>
                  <button onClick={() => setDate((d) => shiftDate(d, -1))} className="px-2.5 py-1.5 rounded-lg border border-black/[0.08] text-xs font-bold hover:bg-[#F5F5F7]">이전</button>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F5F5F7] border border-black/[0.05]">
                    <CalendarDays className="w-3.5 h-3.5 text-[#86868B]" />
                    <input type="date" value={date} max={todayKST()} onChange={(e) => e.target.value && setDate(e.target.value)} className="bg-transparent text-xs font-bold outline-none" />
                  </div>
                  <button onClick={() => setDate((d) => shiftDate(d, 1))} disabled={date >= todayKST()} className="px-2.5 py-1.5 rounded-lg border border-black/[0.08] text-xs font-bold hover:bg-[#F5F5F7] disabled:opacity-40">다음</button>
                  <button onClick={() => setDate(todayKST())} className="px-2.5 py-1.5 rounded-lg bg-[#1D1D1F] text-white text-xs font-bold">오늘</button>
                </>
              )}
            </div>
          </div>

          {mode === 'daily' && (
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2">
                {statusOptions.map((option) => (
                  <button
                    key={option.key}
                    onClick={() => setStatusFilter(option.key)}
                    className={`rounded-lg px-3 py-1.5 text-[11px] font-black ${statusFilter === option.key ? 'bg-[#1D1D1F] text-white' : 'bg-[#F5F5F7] text-[#86868B]'}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <label className="flex min-w-0 items-center gap-2 rounded-xl border border-black/[0.06] bg-[#F5F5F7] px-3 py-2 lg:w-72">
                <Search className="h-4 w-4 shrink-0 text-[#86868B]" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="원생 이름 검색"
                  className="min-w-0 flex-1 bg-transparent text-xs font-bold outline-none"
                />
              </label>
            </div>
          )}
        </div>

        {mode === 'weekly' ? (
          <WeeklyTardiness campusFilter={campusFilter} />
        ) : (
          <>
            {s && (
              <div className="flex flex-wrap gap-3 text-xs font-bold">
                <span className="px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">정시 {s.ontime}</span>
                <span className="px-3 py-1.5 rounded-full bg-red-50 text-red-700 border border-red-100">지각 {s.late}</span>
                <span className="px-3 py-1.5 rounded-full bg-[#F5F5F7] text-[#86868B]">08:20 그룹 {s.group0820.total}명(지각 {s.group0820.late})</span>
                <span className="px-3 py-1.5 rounded-full bg-[#F5F5F7] text-[#86868B]">09:00 그룹 {s.group0900.total}명(지각 {s.group0900.late})</span>
                <span className="px-3 py-1.5 rounded-full bg-[#F5F5F7] text-[#86868B]">출석 {data?.attended ?? '-'} / {data?.total ?? '-'}</span>
              </div>
            )}

            <div className="bg-white border border-black/[0.05] rounded-2xl shadow-sm overflow-x-auto">
              {loading ? (
                <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-[#0071E3] animate-spin mr-2" /><span className="text-xs text-[#86868B]">불러오는 중...</span></div>
              ) : error ? (
                <div className="py-16 text-center text-sm text-red-600 font-semibold">{error}</div>
              ) : rows.length === 0 ? (
                <div className="py-16 text-center text-sm text-[#86868B]">조건에 맞는 출결 기록이 없습니다.</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-[#F5F5F7] text-left border-b border-black/[0.05]">
                    <tr>
                      {renderTh('name', '이름')}
                      {renderTh('checkIn', '등원시간')}
                      {renderTh('checkOut', '하원시간')}
                      {renderTh('minutes', '체류', 'hidden sm:table-cell')}
                      {renderTh('arrival', '지각기준')}
                      {renderTh('late', '상태')}
                      <th className="px-4 py-3 text-left font-bold text-[#1D1D1F]">수정</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const edit = edits[r.id] || { checkIn: r.checkIn || '', checkOut: r.checkOut || '' };
                      return (
                        <tr key={r.id} className="border-b border-black/[0.04] hover:bg-[#F5F5F7]/60">
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="font-bold text-[#1D1D1F]">{r.name}</span>
                            <span className="ml-2 text-[9px] font-bold text-[#86868B] bg-[#F5F5F7] px-1.5 py-0.5 rounded-full">{campusLabel(r.campus)}</span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <input
                              type="time"
                              value={edit.checkIn}
                              onChange={(e) => setEdits((prev) => ({ ...prev, [r.id]: { ...edit, checkIn: e.target.value } }))}
                              className="w-28 rounded-lg border border-black/[0.08] bg-white px-2 py-1 text-xs font-bold outline-none focus:border-[#0071E3]"
                            />
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <input
                              type="time"
                              value={edit.checkOut}
                              onChange={(e) => setEdits((prev) => ({ ...prev, [r.id]: { ...edit, checkOut: e.target.value } }))}
                              className="w-28 rounded-lg border border-black/[0.08] bg-white px-2 py-1 text-xs font-bold outline-none focus:border-[#0071E3]"
                            />
                          </td>
                          <td className="px-4 py-3 text-[#86868B] hidden sm:table-cell whitespace-nowrap">{r.isAbsent ? '-' : fmtMin(r.minutes)}</td>
                          <td className="px-4 py-3">
                            <select
                              value={r.expectedArrival}
                              onChange={(e) => changeArrival(r.id, e.target.value as Arrival)}
                              className="text-[11px] font-bold bg-white border border-black/[0.1] rounded-lg px-2 py-1 outline-none cursor-pointer hover:border-[#0071E3]"
                            >
                              <option value="08:20">08:20까지</option>
                              <option value="09:00">09:00까지</option>
                            </select>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {r.isAbsent ? (
                              <span className="px-2 py-0.5 rounded-full border text-[10px] font-bold text-slate-600 bg-slate-50 border-slate-200">미등원</span>
                            ) : r.isOpen ? (
                              <span className="px-2 py-0.5 rounded-full border text-[10px] font-bold text-emerald-700 bg-emerald-50 border-emerald-100">등원중</span>
                            ) : r.autoClosed ? (
                              <span className="px-2 py-0.5 rounded-full border text-[10px] font-bold text-amber-700 bg-amber-50 border-amber-100">자동 하원</span>
                            ) : r.isLate ? (
                              <span className="px-2 py-0.5 rounded-full border text-[10px] font-bold text-red-700 bg-red-50 border-red-100">지각 ({r.expectedArrival})</span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full border text-[10px] font-bold text-blue-700 bg-blue-50 border-blue-100">하원</span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => saveManual(r)}
                                disabled={savingId === r.id}
                                className="inline-flex items-center gap-1 rounded-lg bg-[#0071E3] px-2.5 py-1.5 text-[10px] font-black text-white disabled:opacity-50"
                              >
                                <Save className="h-3 w-3" />
                                저장
                              </button>
                              <button
                                onClick={() => saveManual(r, true)}
                                disabled={savingId === r.id}
                                className="inline-flex items-center gap-1 rounded-lg border border-red-100 bg-red-50 px-2.5 py-1.5 text-[10px] font-black text-red-700 disabled:opacity-50"
                              >
                                <Trash2 className="h-3 w-3" />
                                결석
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <p className="text-[10px] text-[#86868B] text-center">
              이름 검색, 상태 필터, 등·하원 시간 수정, 결석 처리를 한 화면에서 처리할 수 있습니다.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
