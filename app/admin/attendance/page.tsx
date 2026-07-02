'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useState, useRef } from 'react';
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
import { ScheduledJobsPanel } from '@/components/admin/scheduled-jobs-panel';
import { Button } from '@/components/ui/button';
import { AdminTopNav } from '@/components/admin/admin-top-nav';
import { Student, PhoneSubmission } from '@/lib/types/student';
import { useAdminGlobalSheet } from '@/components/admin/admin-global-context';
import { arrivalDeadlineMin, normalizeArrival } from '@/lib/attendance-time';

type Arrival = string;
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

interface SaturdayExcuseRow {
  studentId: string;
  name: string;
  campus: string;
  manager?: string;
  excuseId: string | null;
  status: 'not_requested' | 'pending' | 'submitted' | 'excused' | 'unexcused_late';
  requestedAt: string | null;
  reason: string | null;
  submittedAt: string | null;
  resolvedAt: string | null;
  demeritPoint: number | null;
}

type SortKey = 'name' | 'checkIn' | 'checkOut' | 'minutes' | 'arrival' | 'late';
type SortDir = 'asc' | 'desc';

interface AbsenceRankRow {
  studentId: string;
  name: string;
  campus: string;
  absentDays: number;
  leftDays: number;
  totalMarks: number;
  lastDate: string;
}

function rangeFor(p: 'week' | 'month' | 'last30'): { from: string; to: string } {
  const fmt = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(d);
  const to = fmt(new Date());
  if (p === 'month') return { from: to.slice(0, 8) + '01', to };
  const days = p === 'week' ? 6 : 29;
  const fromD = new Date(Date.now() - days * 86400000);
  return { from: fmt(fromD), to };
}

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;
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
  const { openStudent } = useAdminGlobalSheet();
  const [students, setStudents] = useState<Student[]>([]);
  const [date, setDate] = useState(todayKST());
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [error, setError] = useState('');
  const [campusFilter, setCampusFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(statusOptions.some((o) => o.key === initialStatus) ? initialStatus : 'all');
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'daily' | 'weekly' | 'saturday-late'>('daily');
  const [sortKey, setSortKey] = useState<SortKey>('checkIn');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [reloadKey, setReloadKey] = useState(0);
  const [edits, setEdits] = useState<Record<string, { checkIn: string; checkOut: string }>>({});

  // 이탈·결석 순위 탭 상태
  const [tab, setTab] = useState<'detail' | 'ranking'>('detail');
  const [period, setPeriod] = useState<'week' | 'month' | 'last30'>('month');
  const [ranking, setRanking] = useState<AbsenceRankRow[]>([]);
  const [rankingLoading, setRankingLoading] = useState(false);

  // 토요 지각 증빙용 상태
  const [satDate, setSatDate] = useState('');
  const [satData, setSatData] = useState<SaturdayExcuseRow[]>([]);
  const [satLoading, setSatLoading] = useState(false);
  const [selectedSatStudents, setSelectedSatStudents] = useState<string[]>([]);
  const [demeritModal, setDemeritModal] = useState<{ studentId: string; name: string } | null>(null);
  const [demeritPoints, setDemeritPoints] = useState(1);

  // 휴대폰 제출 신청 관련 상태
  type PhoneSubmissionWithStudent = PhoneSubmission & { studentId: string; studentName: string; campus: string };
  const [phoneSubmissions, setPhoneSubmissions] = useState<PhoneSubmissionWithStudent[]>([]);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneReviewing, setPhoneReviewing] = useState<string | null>(null);

  // 토요 지각 증빙 초기 날짜 계산 (직전 토요일)
  useEffect(() => {
    const today = new Date();
    const day = today.getDay();
    const diff = day === 6 ? 0 : -(day + 1);
    const sat = new Date(today);
    sat.setDate(today.getDate() + diff);
    setSatDate(sat.toISOString().slice(0, 10));
  }, []);

  const loadSatData = useCallback(async (dateStr: string) => {
    if (!dateStr) return;
    setSatLoading(true);
    try {
      const res = await fetch(`/api/admin/attendance/saturday-excuse?date=${dateStr}`);
      const json = await res.json();
      if (res.ok && json.success) {
        setSatData(json.rows || []);
        setSelectedSatStudents([]);
      } else {
        toast.error(json.message || '토요 지각 대상자 조회 실패');
      }
    } catch {
      toast.error('네트워크 오류로 토요 지각 대상자를 조회할 수 없습니다.');
    } finally {
      setSatLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mode === 'saturday-late' && satDate) {
      loadSatData(satDate);
    }
  }, [mode, satDate, reloadKey, loadSatData]);

  const loadPhoneSubmissions = async (forDate: string) => {
    setPhoneLoading(true);
    try {
      const res = await fetch(`/api/admin/phone-submissions?date=${forDate}`);
      const json = await res.json();
      if (res.ok && json.success) {
        setPhoneSubmissions(json.submissions || []);
      }
    } catch {}
    finally { setPhoneLoading(false); }
  };

  const handlePhoneReview = async (studentId: string, submissionId: string, status: 'approved' | 'rejected', adminReply?: string) => {
    setPhoneReviewing(submissionId);
    try {
      const res = await fetch('/api/admin/phone-submissions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, submissionId, status, adminReply }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setPhoneSubmissions((prev) =>
          prev.map((s) => (s.id === submissionId ? { ...s, status, adminReply } : s)),
        );
      } else {
        toast.error(json.message || '처리 실패');
      }
    } catch {
      toast.error('네트워크 오류가 발생했습니다.');
    } finally {
      setPhoneReviewing(null);
    }
  };

  useEffect(() => {
    if (mode === 'daily') {
      loadPhoneSubmissions(date);
    }
  }, [mode, date, reloadKey]);

  const handleRequestSatExcuse = async (overrideIds?: string[]) => {
    const targets = overrideIds ?? (selectedSatStudents.length > 0 ? selectedSatStudents : []);
    if (targets.length === 0) return;
    try {
      const res = await fetch('/api/admin/attendance/saturday-excuse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'request',
          date: satDate,
          studentIds: targets,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success(json.message);
        loadSatData(satDate);
      } else {
        toast.error(json.message || '요청 실패');
      }
    } catch {
      toast.error('네트워크 오류가 발생했습니다.');
    }
  };

  const handleResolveSatExcuse = async (studentId: string, decision: 'excused' | 'unexcused_late', demeritPoint?: number) => {
    try {
      const res = await fetch('/api/admin/attendance/saturday-excuse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'resolve',
          date: satDate,
          studentId,
          decision,
          demeritPoint,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success(json.message);
        setDemeritModal(null);
        setDemeritPoints(1);
        loadSatData(satDate);
      } else {
        toast.error(json.message || '처리 실패');
      }
    } catch {
      toast.error('네트워크 오류가 발생했습니다.');
    }
  };

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
    (async () => {
      try {
        const res = await fetch('/api/admin/students', { cache: 'no-store', credentials: 'same-origin' });
        const json = await res.json();
        if (res.ok && json.success) {
          setStudents(json.data || []);
        }
      } catch (err) {
        console.error('Failed to load students list:', err);
      }
    })();
  }, [checkingAuth, reloadKey]);

  const handleOpenStudentInfo = (studentId: string) => {
    const target = students.find((s) => s.id === studentId);
    if (target) {
      openStudent(target, {
        onUpdate: (updated) => {
          setStudents((prev) => prev.map((s) => s.id === updated.id ? updated : s));
          setReloadKey((k) => k + 1);
        },
        onDelete: (sid) => {
          setStudents((prev) => prev.filter((s) => s.id !== sid));
          setReloadKey((k) => k + 1);
        },
        allStudents: students,
        defaultTab: 'info',
      });
    } else {
      toast.error('학생 상세 정보를 찾을 수 없습니다.');
    }
  };

  const prevDateRef = useRef<string | null>(null);

  useEffect(() => {
    if (checkingAuth) return;
    let active = true;
    const isDateOrFirstChange = prevDateRef.current !== date;
    prevDateRef.current = date;
    if (isDateOrFirstChange) {
      setLoading(true);
    }
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

  const changeArrival = async (id: string, raw: string) => {
    const value = normalizeArrival(raw);
    setData((prev) => prev && {
      ...prev,
      rows: (prev.rows || []).map((r) => (r.id === id ? { ...r, expectedArrival: value, isLate: !r.isAbsent && r.checkInMin > arrivalDeadlineMin(value) } : r)),
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
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, '지각 기준 저장에 실패했습니다.'));
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
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, '출결 저장에 실패했습니다.'));
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
        case 'arrival': return arrivalDeadlineMin(r.expectedArrival);
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

  // 휴대폰 미제출(임시보관함/소지) 신청을 학생별로 매핑 — 출결판 '휴대폰' 칸 v표시용
  const phoneFlagByStudent = useMemo(() => {
    const m = new Map<string, PhoneSubmissionWithStudent>();
    for (const s of phoneSubmissions) {
      if (s.status === 'rejected') continue;
      m.set(s.studentId, s); // 같은 학생 다건이면 최신 항목으로 덮어씀
    }
    return m;
  }, [phoneSubmissions]);
  const phoneTypeLabel = (t: PhoneSubmission['type']) => (t === 'locker' ? '임시보관함' : '전원끄고 소지');

  const renderSortIcon = (k: SortKey) =>
    sortKey !== k ? <ChevronsUpDown className="w-3 h-3 text-[#C7C7CC]" />
      : sortDir === 'asc' ? <ChevronUp className="w-3 h-3 text-[#0071E3]" /> : <ChevronDown className="w-3 h-3 text-[#0071E3]" />;

  const loadRanking = useCallback(async () => {
    setRankingLoading(true);
    try {
      const { from, to } = rangeFor(period);
      const c = campusFilter !== 'all' ? `&campus=${campusFilter}` : '';
      const res = await fetch(`/api/admin/attendance/absence-ranking?from=${from}&to=${to}${c}`);
      const json = await res.json();
      if (json.success) setRanking(json.rows as AbsenceRankRow[]);
      else { setRanking([]); toast.error(json.message || '집계 실패'); }
    } finally {
      setRankingLoading(false);
    }
  }, [period, campusFilter]);

  useEffect(() => { if (tab === 'ranking') loadRanking(); }, [tab, loadRanking]);

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
    <div className="admin-fluid-ui ios-app-bg min-h-screen font-sans text-[#1D1D1F]">
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

      <main className="max-w-6xl mx-auto p-4 md:p-8 pb-28 space-y-5">
        <div className="bg-white border border-black/[0.05] rounded-3xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_6px_20px_rgba(0,0,0,0.04)] p-4 space-y-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="glass-capsule inline-flex p-0.5 rounded-full">
                {([['daily', '일별'], ['weekly', '주간 지각'], ['saturday-late', '토요 지각 증빙']] as const).map(([k, label]) => (
                  <button key={k} onClick={() => setMode(k)} className={`px-3.5 py-1.5 rounded-full text-[13px] transition-all ${mode === k ? 'bg-white text-[#1D1D1F] shadow-sm font-semibold' : 'text-[#86868B] font-medium'}`}>{label}</button>
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
              {mode === 'saturday-late' && (
                <>
                  <button onClick={() => setSatDate((d) => shiftDate(d, -7))} className="px-2.5 py-1.5 rounded-lg border border-black/[0.08] text-xs font-bold hover:bg-[#F5F5F7]">이전 주</button>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F5F5F7] border border-black/[0.05]">
                    <CalendarDays className="w-3.5 h-3.5 text-[#86868B]" />
                    <input type="date" value={satDate} onChange={(e) => e.target.value && setSatDate(e.target.value)} className="bg-transparent text-xs font-bold outline-none" />
                  </div>
                  <button onClick={() => setSatDate((d) => shiftDate(d, 7))} className="px-2.5 py-1.5 rounded-lg border border-black/[0.08] text-xs font-bold hover:bg-[#F5F5F7]">다음 주</button>
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
                    className={`rounded-full px-3.5 py-1.5 text-[13px] transition-all ${statusFilter === option.key ? 'bg-[#1D1D1F] text-white font-semibold' : 'bg-black/[0.04] text-[#6e6e73] font-medium hover:bg-black/[0.07]'}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <label className="flex min-w-0 items-center gap-2 rounded-2xl bg-black/[0.04] px-3.5 py-2.5 lg:w-72">
                <Search className="h-4 w-4 shrink-0 text-[#86868B]" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="원생 이름 검색"
                  className="min-w-0 flex-1 bg-transparent text-[13px] font-medium outline-none"
                />
              </label>
            </div>
          )}
        </div>

        {/* 탭 토글 (일별 모드에서만 표시) */}
        {mode === 'daily' && (
          <div className="glass-capsule inline-flex p-0.5 rounded-full">
            {([['detail', '상세'], ['ranking', '이탈·결석 순위']] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`px-3.5 py-1.5 rounded-full text-[13px] transition-all ${tab === k ? 'bg-white text-[#1D1D1F] shadow-sm font-semibold' : 'text-[#86868B] font-medium'}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {mode === 'weekly' ? (
          <WeeklyTardiness campusFilter={campusFilter} />
        ) : mode === 'saturday-late' ? (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs font-bold text-[#86868B]">
                토요 지각 증빙 대상자: 총 {satData.length}명 (결석 상태 & 반차/휴가 미승인 학생)
              </span>
              <button
                onClick={() => handleRequestSatExcuse()}
                disabled={selectedSatStudents.length === 0}
                className="rounded-xl bg-[#0071E3] px-3.5 py-2 text-xs font-black text-white hover:bg-[#0077ED] transition active:scale-[0.98] disabled:opacity-50"
              >
                선택 학생 {selectedSatStudents.length}명 일괄 증빙 요청 전송
              </button>
            </div>

            <div className="bg-white border border-black/[0.05] rounded-2xl shadow-sm overflow-x-auto">
              {satLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 text-[#0071E3] animate-spin mr-2" />
                  <span className="text-xs text-[#86868B]">불러오는 중...</span>
                </div>
              ) : satData.length === 0 ? (
                <div className="py-16 text-center text-sm text-[#86868B]">
                  해당 토요일에 증빙 대상 학생이 없습니다.
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-[#F5F5F7] text-left border-b border-black/[0.05]">
                    <tr>
                      <th className="px-4 py-3 w-10">
                        <input
                          type="checkbox"
                          checked={satData.length > 0 && selectedSatStudents.length === satData.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedSatStudents(satData.map((r) => r.studentId));
                            } else {
                              setSelectedSatStudents([]);
                            }
                          }}
                          className="rounded border-black/[0.1] text-[#0071E3] focus:ring-[#0071E3]/20"
                        />
                      </th>
                      <th className="px-4 py-3 text-[12px] font-semibold text-[#6e6e73]">이름</th>
                      <th className="px-4 py-3 text-[12px] font-semibold text-[#6e6e73]">캠퍼스</th>
                      <th className="px-4 py-3 text-[12px] font-semibold text-[#6e6e73]">담당 코멘터</th>
                      <th className="px-4 py-3 text-[12px] font-semibold text-[#6e6e73]">증빙 상태</th>
                      <th className="px-4 py-3 text-[12px] font-semibold text-[#6e6e73]">지각 사유 회신</th>
                      <th className="px-4 py-3 text-[12px] font-semibold text-[#6e6e73] text-right">처리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {satData.map((r) => {
                      const isSelected = selectedSatStudents.includes(r.studentId);
                      return (
                        <tr key={r.studentId} className="border-b border-black/[0.04] hover:bg-[#F5F5F7]/60">
                          <td className="px-4 py-3 w-10">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedSatStudents([...selectedSatStudents, r.studentId]);
                                } else {
                                  setSelectedSatStudents(selectedSatStudents.filter((id) => id !== r.studentId));
                                }
                              }}
                              className="rounded border-black/[0.1] text-[#0071E3] focus:ring-[#0071E3]/20"
                            />
                          </td>
                          <td
                            onClick={() => handleOpenStudentInfo(r.studentId)}
                            className="px-4 py-3 whitespace-nowrap cursor-pointer hover:bg-black/[0.02] transition-colors"
                          >
                            <span className="font-bold text-[#1D1D1F] hover:text-[#0071E3] transition-colors">{r.name}</span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap font-bold text-[#86868B]">{campusLabel(r.campus)}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-slate-500 font-semibold">{r.manager || '-'}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {r.status === 'not_requested' && (
                              <span className="px-2 py-0.5 rounded-full border text-[10px] font-bold text-slate-500 bg-slate-100 border-slate-200">요청 전</span>
                            )}
                            {r.status === 'pending' && (
                              <span className="px-2 py-0.5 rounded-full border text-[10px] font-bold text-amber-700 bg-amber-50 border-amber-100 animate-pulse">회신 대기</span>
                            )}
                            {r.status === 'submitted' && (
                              <span className="px-2 py-0.5 rounded-full border text-[10px] font-bold text-blue-700 bg-blue-50 border-blue-100 animate-pulse">회신 완료</span>
                            )}
                            {r.status === 'excused' && (
                              <span className="px-2 py-0.5 rounded-full border text-[10px] font-bold text-emerald-700 bg-emerald-50 border-emerald-100">참작 완료</span>
                            )}
                            {r.status === 'unexcused_late' && (
                              <span className="px-2 py-0.5 rounded-full border text-[10px] font-bold text-red-700 bg-red-50 border-red-100">벌점 부여 ({r.demeritPoint}점)</span>
                            )}
                          </td>
                          <td className="px-4 py-3 max-w-xs truncate font-semibold text-slate-600" title={r.reason || ''}>
                            {r.reason ? (
                              <span className="text-slate-800 font-bold">{r.reason}</span>
                            ) : (
                              <span className="text-slate-300 italic">회신 없음</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            {r.status === 'submitted' && (
                              <div className="inline-flex gap-1.5 justify-end">
                                <button
                                  onClick={() => handleResolveSatExcuse(r.studentId, 'excused')}
                                  className="rounded-lg bg-emerald-50 border border-emerald-100 px-2.5 py-1 text-[10px] font-black text-emerald-700 hover:bg-emerald-100 transition"
                                >
                                  참작 (Pass)
                                </button>
                                <button
                                  onClick={() => setDemeritModal({ studentId: r.studentId, name: r.name })}
                                  className="rounded-lg bg-red-50 border border-red-100 px-2.5 py-1 text-[10px] font-black text-red-700 hover:bg-red-100 transition"
                                >
                                  벌점 부여
                                </button>
                              </div>
                            )}
                            {r.status === 'pending' && (
                              <button
                                onClick={() => handleRequestSatExcuse([r.studentId])}
                                className="rounded-lg border border-black/[0.08] px-2.5 py-1 text-[10px] font-bold text-[#1D1D1F] hover:bg-[#F5F5F7] transition"
                              >
                                재요청
                              </button>
                            )}
                            {r.status === 'not_requested' && (
                              <button
                                onClick={() => handleRequestSatExcuse([r.studentId])}
                                className="rounded-lg bg-[#0071E3] px-2.5 py-1 text-[10px] font-black text-white hover:bg-[#0077ED] transition"
                              >
                                증빙 요청
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        ) : (
          <>
            {tab === 'ranking' ? (
              <div className="space-y-3">
                {/* 기간 프리셋 */}
                <div className="flex gap-2 flex-wrap">
                  {(['week', 'month', 'last30'] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPeriod(p)}
                      className={`rounded-full px-3.5 py-1.5 text-[13px] transition-all ${period === p ? 'bg-[#1D1D1F] text-white font-semibold' : 'bg-black/[0.04] text-[#6e6e73] font-medium hover:bg-black/[0.07]'}`}
                    >
                      {p === 'week' ? '이번주' : p === 'month' ? '이번달' : '지난 30일'}
                    </button>
                  ))}
                  {rankingLoading && <Loader2 className="w-4 h-4 text-[#0071E3] animate-spin self-center" />}
                </div>
                {/* 요약 */}
                <div className="text-sm text-[#86868B] font-medium">
                  대상 {ranking.length}명 · 총 결석 <span className="text-rose-600 font-semibold">{ranking.reduce((s, r) => s + r.absentDays, 0)}</span>일 · 총 이탈 <span className="text-amber-600 font-semibold">{ranking.reduce((s, r) => s + r.leftDays, 0)}</span>일
                </div>
                {/* 표 */}
                <div className="bg-white border border-black/[0.05] rounded-2xl shadow-sm overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-[#F5F5F7] text-left border-b border-black/[0.05]">
                      <tr>
                        <th className="px-4 py-3 font-bold text-[#1D1D1F] w-10">#</th>
                        <th className="px-4 py-3 font-bold text-[#1D1D1F]">학생</th>
                        <th className="px-4 py-3 font-bold text-rose-600">결석일</th>
                        <th className="px-4 py-3 font-bold text-amber-600">이탈일</th>
                        <th className="px-4 py-3 font-bold text-[#1D1D1F]">총X</th>
                        <th className="px-4 py-3 font-bold text-[#1D1D1F]">최근</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ranking.map((r, i) => (
                        <tr
                          key={r.studentId}
                          onClick={() => handleOpenStudentInfo(r.studentId)}
                          className="border-b border-black/[0.04] hover:bg-[#F5F5F7]/60 cursor-pointer"
                        >
                          <td className="px-4 py-3 text-[#86868B] font-semibold">{i + 1}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="font-bold text-[#1D1D1F] hover:text-[#0071E3] transition-colors">{r.name}</span>
                            <span className="ml-2 text-[9px] font-bold text-[#86868B] bg-[#F5F5F7] px-1.5 py-0.5 rounded-full">{campusLabel(r.campus)}</span>
                          </td>
                          <td className="px-4 py-3 text-rose-600 font-semibold">{r.absentDays}</td>
                          <td className="px-4 py-3 text-amber-600 font-semibold">{r.leftDays}</td>
                          <td className="px-4 py-3 text-[#1D1D1F] font-medium">{r.totalMarks}</td>
                          <td className="px-4 py-3 text-[#86868B]">{r.lastDate || '-'}</td>
                        </tr>
                      ))}
                      {!rankingLoading && ranking.length === 0 && (
                        <tr>
                          <td colSpan={6} className="text-center text-[#86868B] py-10 text-sm">해당 기간 기록 없음</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
            <>
            {s && (
              <div className="flex flex-wrap gap-2 text-[13px] font-medium">
                <span className="px-3 py-1.5 rounded-full bg-emerald-500/12 text-emerald-700">정시 {s.ontime}</span>
                <span className="px-3 py-1.5 rounded-full bg-red-500/12 text-red-700">지각 {s.late}</span>
                <span className="px-3 py-1.5 rounded-full bg-black/[0.04] text-[#6e6e73]">08:20 그룹 {s.group0820.total}명(지각 {s.group0820.late})</span>
                <span className="px-3 py-1.5 rounded-full bg-black/[0.04] text-[#6e6e73]">09:00 그룹 {s.group0900.total}명(지각 {s.group0900.late})</span>
                <span className="px-3 py-1.5 rounded-full bg-black/[0.04] text-[#1d1d1f]">출석 {data?.attended ?? '-'} / {data?.total ?? '-'}</span>
              </div>
            )}

            {/* 📱 휴대폰 제출 신청 현황 */}
            {phoneSubmissions.length > 0 && (
              <div className="bg-white border border-black/[0.05] rounded-2xl shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-black/[0.05] flex items-center justify-between">
                  <span className="text-xs font-black text-[#1D1D1F]">휴대폰 제출 방식 신청<span className="text-[#86868B] font-bold">({phoneSubmissions.filter(s => s.status === 'pending').length}건 검토 대기)</span></span>
                  {phoneLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#86868B]" />}
                </div>
                <div className="divide-y divide-black/[0.04]">
                  {phoneSubmissions.map((sub) => (
                    <div key={sub.id} className="flex items-center gap-3 px-4 py-3 flex-wrap">
                      <span className="text-xs font-bold text-[#1D1D1F] min-w-[80px]">{sub.studentName}</span>
                      <span className="text-[10px] font-bold text-[#86868B] bg-[#F5F5F7] px-2 py-0.5 rounded-full">{campusLabel(sub.campus)}</span>
                      <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border ${sub.type === 'keep' ? 'bg-amber-50 border-amber-100 text-amber-700' : 'bg-blue-50 border-blue-100 text-blue-700'}`}>
                        {sub.type === 'keep' ? '소지' : '임시보관함'}
                      </span>
                      {sub.reason && <span className="text-[10px] text-[#86868B] truncate max-w-[180px]">사유: {sub.reason}</span>}
                      <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border ml-auto ${
                        sub.status === 'approved' ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                        : sub.status === 'rejected' ? 'bg-red-50 border-red-100 text-red-700'
                        : 'bg-slate-50 border-slate-100 text-slate-500'
                      }`}>
                        {sub.status === 'approved' ? '승인' : sub.status === 'rejected' ? '반려' : '검토 중'}
                      </span>
                      {sub.status === 'pending' && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => handlePhoneReview(sub.studentId, sub.id, 'approved')}
                            disabled={phoneReviewing === sub.id}
                            className="rounded-lg bg-emerald-600 text-white text-[10px] font-black px-2.5 py-1 hover:bg-emerald-700 transition disabled:opacity-50"
                          >
                            승인
                          </button>
                          <button
                            onClick={() => handlePhoneReview(sub.studentId, sub.id, 'rejected', '관리자 반려')}
                            disabled={phoneReviewing === sub.id}
                            className="rounded-lg bg-red-600 text-white text-[10px] font-black px-2.5 py-1 hover:bg-red-700 transition disabled:opacity-50"
                          >
                            반려
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white border border-black/[0.05] rounded-2xl shadow-sm overflow-x-auto">
              {loading && !data ? (
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
                      <th className="px-4 py-3 text-center font-bold text-[#1D1D1F]" title="휴대폰 미제출(임시보관함/소지) 신청 시 자동 체크">휴대폰</th>
                      <th className="px-4 py-3 text-left font-bold text-[#1D1D1F]">수정</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const edit = edits[r.id] || { checkIn: r.checkIn || '', checkOut: r.checkOut || '' };
                      return (
                        <tr key={r.id} className="border-b border-black/[0.04] hover:bg-[#F5F5F7]/60">
                          <td
                            onClick={() => handleOpenStudentInfo(r.id)}
                            className="px-4 py-3 whitespace-nowrap cursor-pointer hover:bg-black/[0.02] transition-colors"
                          >
                            <span className="font-bold text-[#1D1D1F] hover:text-[#0071E3] transition-colors">{r.name}</span>
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
                            <div className="flex items-center gap-1">
                              {['08:20', '09:00'].map((preset) => (
                                <button
                                  key={preset}
                                  type="button"
                                  onClick={() => changeArrival(r.id, preset)}
                                  className={`text-[10px] font-bold rounded-md px-1.5 py-1 border transition-colors ${
                                    r.expectedArrival === preset
                                      ? 'bg-[#0071E3] text-white border-[#0071E3]'
                                      : 'bg-white text-[#86868B] border-black/[0.1] hover:border-[#0071E3]'
                                  }`}
                                >
                                  {preset}
                                </button>
                              ))}
                              <input
                                type="time"
                                value={r.expectedArrival}
                                onChange={(e) => { if (e.target.value) changeArrival(r.id, e.target.value); }}
                                title="수동 지각 기준 시각 (예: 09:40)"
                                className={`w-[88px] text-[11px] font-bold bg-white border rounded-md px-1.5 py-1 outline-none focus:border-[#0071E3] ${
                                  r.expectedArrival !== '08:20' && r.expectedArrival !== '09:00'
                                    ? 'border-[#0071E3] text-[#0071E3]'
                                    : 'border-black/[0.1]'
                                }`}
                              />
                            </div>
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
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            {(() => {
                              const sub = phoneFlagByStudent.get(r.id);
                              if (!sub) return <span className="text-[#C7C7CC]">—</span>;
                              return (
                                <span
                                  className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-700"
                                  title={`${phoneTypeLabel(sub.type)}${sub.reason ? ` · ${sub.reason}` : ''}`}
                                >
                                  ✓ {phoneTypeLabel(sub.type)}
                                </span>
                              );
                            })()}
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
          </>
        )}

        {/* 출결 자동마감(sweep) 예약 설정 — 전체 잡은 /admin/schedules 에서 관리 */}
        <ScheduledJobsPanel jobIds={['sweep']} compact collapsible />

        {/* 벌점 부여 모달 */}
        {demeritModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-3xl border border-black/[0.05] bg-white p-6 shadow-2xl space-y-4">
              <div>
                <h3 className="text-base font-black text-[#1D1D1F]">지각 벌점 부여</h3>
                <p className="text-xs text-[#86868B] mt-0.5">
                  <b>{demeritModal.name}</b> 학생의 증빙 사유를 기각하고 단순 지각 벌점을 부여합니다.
                </p>
              </div>
              
              <div className="space-y-1.5">
                <label className="text-[11px] font-black text-[#86868B]">벌점 점수</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={demeritPoints}
                  onChange={(e) => setDemeritPoints(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-xs font-bold outline-none focus:border-[#0071E3]"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setDemeritModal(null);
                    setDemeritPoints(1);
                  }}
                  className="flex-1 rounded-xl border border-black/[0.08] py-2.5 text-xs font-bold text-[#86868B] hover:bg-[#F5F5F7] transition"
                >
                  취소
                </button>
                <button
                  onClick={() => handleResolveSatExcuse(demeritModal.studentId, 'unexcused_late', demeritPoints)}
                  className="flex-1 rounded-xl bg-red-600 py-2.5 text-xs font-bold text-white hover:bg-red-700 transition"
                >
                  벌점 부여 및 완료
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
