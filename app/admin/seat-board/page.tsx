'use client';

import React, { useCallback, useEffect, useRef, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminTopNav } from '@/components/admin/admin-top-nav';
import { Loader2, RefreshCw, LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { Student, LeaveRequest } from '@/lib/types/student';
import { CAMPUS_LAYOUTS, CAMPUS_LABELS, type CampusKey, type Cell } from '@/lib/seat-layouts';

// ── 교시 정의 (08:00~00:00, 2시간씩) ─────────────────────────────────────────

const PERIODS = [
  { label: '1', start: 8 * 60,  end: 10 * 60 },
  { label: '2', start: 10 * 60, end: 12 * 60 },
  { label: '3', start: 12 * 60, end: 14 * 60 },
  { label: '4', start: 14 * 60, end: 16 * 60 },
  { label: '5', start: 16 * 60, end: 18 * 60 },
  { label: '6', start: 18 * 60, end: 20 * 60 },
  { label: '7', start: 20 * 60, end: 22 * 60 },
  { label: '8', start: 22 * 60, end: 24 * 60 },
] as const;

interface StudySession {
  id: string;
  student_id: string;
  date: string;
  check_in: string;
  check_out: string | null;
  minutes: number | null;
}

function kstMin(iso: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso));
  let h = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  const m = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
  if (h === 24) h = 0;
  return h * 60 + m;
}

function nowKst(): { dateStr: string; minOfDay: number } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0';
  const dateStr = `${get('year')}-${get('month')}-${get('day')}`;
  let h = parseInt(get('hour'), 10);
  if (h === 24) h = 0;
  return { dateStr, minOfDay: h * 60 + parseInt(get('minute'), 10) };
}

type PeriodStatus = 'present' | 'absent' | 'future';

// 교시 상태 (computed + 수동 override 여부)
interface PeriodState {
  status: PeriodStatus;
  isOverridden: boolean;
}

function computePeriods(
  sessions: StudySession[],
  todayStr: string,
  nowDateStr: string,
  nowMin: number,
): PeriodStatus[] {
  const cmp = todayStr.localeCompare(nowDateStr);
  const effectiveNow = cmp === 0 ? nowMin : cmp < 0 ? 24 * 60 : 0;
  return PERIODS.map((period) => {
    if (cmp > 0 || (cmp === 0 && period.start >= nowMin)) return 'future';
    const covered = sessions.some((s) => {
      const inM = kstMin(s.check_in);
      let outM = s.check_out ? kstMin(s.check_out) : effectiveNow;
      if (outM < inM) outM += 1440;
      return inM < period.end && outM > period.start;
    });
    return covered ? 'present' : 'absent';
  });
}

function hasApprovedLeaveToday(student: Student, today: string): boolean {
  return (student.leaveRequests || []).some(
    (r: LeaveRequest) => r.date === today && r.status === 'approved',
  );
}

// ── 교시 셀 ───────────────────────────────────────────────────────────────────

function PeriodCell({
  status,
  label,
  isOverridden,
  onClick,
}: {
  status: PeriodStatus;
  label: string;
  isOverridden?: boolean;
  onClick?: () => void;
}) {
  const clickable = !!onClick && status !== 'future';
  const hoverCls = clickable ? 'cursor-pointer hover:brightness-95 active:scale-90 transition-all' : '';

  if (status === 'future') {
    return (
      <div className={`w-[17px] h-[17px] border border-slate-200 rounded-[3px] flex items-center justify-center bg-white ${onClick ? 'cursor-pointer hover:bg-slate-50 active:scale-90 transition-all' : ''}`}
        onClick={onClick}
      >
        <span className="text-[7px] text-slate-300 font-bold leading-none">{label}</span>
      </div>
    );
  }
  if (status === 'present') {
    return (
      <div
        onClick={onClick}
        className={`w-[17px] h-[17px] border rounded-[3px] flex items-center justify-center ${hoverCls} ${
          isOverridden
            ? 'bg-amber-50 border-amber-300'
            : 'bg-[#1D1D1F]/[0.06] border-[#1D1D1F]/[0.12]'
        }`}
      >
        <span className={`text-[11px] font-black leading-none ${isOverridden ? 'text-amber-600' : 'text-[#1D1D1F]/70'}`}>/</span>
      </div>
    );
  }
  // absent
  return (
    <div
      onClick={onClick}
      className={`w-[17px] h-[17px] border rounded-[3px] flex items-center justify-center ${hoverCls} ${
        isOverridden
          ? 'bg-amber-50 border-amber-300'
          : 'bg-red-50 border-red-200/60'
      }`}
    >
      <span className={`text-[10px] font-black leading-none ${isOverridden ? 'text-amber-600' : 'text-red-400'}`}>X</span>
    </div>
  );
}

// ── 좌석 카드 ─────────────────────────────────────────────────────────────────

interface SeatCardProps {
  seatNum: number;
  student: Student | null;
  periods: PeriodState[];
  isOnLeave: boolean;
  isCheckedIn: boolean;
  onTogglePeriod?: (periodIdx: number) => void;
}

function SeatCard({ seatNum, student, periods, isOnLeave, isCheckedIn, onTogglePeriod }: SeatCardProps) {
  if (!student) {
    return (
      <div className="w-[80px] h-[86px] rounded-lg border border-dashed border-slate-200 bg-slate-50/40 p-1.5 flex flex-col shrink-0">
        <span className="text-[9px] font-black text-slate-300">{seatNum}</span>
      </div>
    );
  }
  const ring = isCheckedIn
    ? 'border-emerald-300 ring-1 ring-emerald-200'
    : isOnLeave
    ? 'border-blue-200'
    : 'border-slate-200/80';
  const bg = isCheckedIn ? 'bg-emerald-50/60' : isOnLeave ? 'bg-blue-50/60' : 'bg-white';
  return (
    <div className={`w-[80px] h-[86px] rounded-lg border ${ring} ${bg} p-1.5 shadow-sm flex flex-col gap-0.5 shrink-0`}>
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-black text-slate-400">{seatNum}</span>
        {isOnLeave && (
          <span className="text-[7px] font-black text-blue-500 bg-blue-100 px-1 py-0.5 rounded-full leading-none">휴가</span>
        )}
        {isCheckedIn && !isOnLeave && (
          <span className="w-[7px] h-[7px] rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)] animate-pulse shrink-0" />
        )}
      </div>
      <p className="text-[11px] font-black text-[#1D1D1F] leading-tight truncate">{student.name}</p>
      <div className="flex flex-col gap-[3px] mt-auto">
        <div className="flex gap-[3px]">
          {periods.slice(0, 4).map(({ status, isOverridden }, i) => (
            <PeriodCell
              key={i}
              status={status}
              label={String(i + 1)}
              isOverridden={isOverridden}
              onClick={onTogglePeriod ? () => onTogglePeriod(i) : undefined}
            />
          ))}
        </div>
        <div className="flex gap-[3px]">
          {periods.slice(4).map(({ status, isOverridden }, i) => (
            <PeriodCell
              key={i + 4}
              status={status}
              label={String(i + 5)}
              isOverridden={isOverridden}
              onClick={onTogglePeriod ? () => onTogglePeriod(i + 4) : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── 행 렌더 ───────────────────────────────────────────────────────────────────

interface RowProps {
  seats: Cell[];
  seatMap: Map<number, Student>;
  sessionMap: Map<string, StudySession[]>;
  openIds: Set<string>;
  today: string;
  nowDateStr: string;
  nowMin: number;
  periodOverrides: Map<string, PeriodStatus>;
  onTogglePeriod: (key: string, current: PeriodStatus) => void;
}

function SeatRow({ seats, seatMap, sessionMap, openIds, today, nowDateStr, nowMin, periodOverrides, onTogglePeriod }: RowProps) {
  return (
    <div className="flex gap-[6px]">
      {seats.map((n, i) => {
        if (n === null) {
          return <div key={`g${i}`} className="w-[80px] shrink-0" />;
        }
        const student = seatMap.get(n) ?? null;
        const isOnLeave = student ? hasApprovedLeaveToday(student, today) : false;
        const isCheckedIn = student ? openIds.has(student.id) : false;
        const sessions = student ? (sessionMap.get(student.id) ?? []) : [];
        const raw = computePeriods(sessions, today, nowDateStr, nowMin);
        const periods: PeriodState[] = raw.map((s, idx) => {
          const key = student ? `${student.id}:${idx}` : '';
          const override = student ? periodOverrides.get(key) : undefined;
          return { status: override ?? s, isOverridden: override !== undefined };
        });
        return (
          <SeatCard
            key={n}
            seatNum={n}
            student={student}
            periods={periods}
            isOnLeave={isOnLeave}
            isCheckedIn={isCheckedIn}
            onTogglePeriod={
              student
                ? (idx) => onTogglePeriod(`${student.id}:${idx}`, periods[idx].status)
                : undefined
            }
          />
        );
      })}
    </div>
  );
}

// ── 복도 구분선 ───────────────────────────────────────────────────────────────

function HallwayDivider({ left, center, right }: { left: string; center: string; right: string }) {
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="w-8 h-8 rounded-lg border-2 border-slate-300 bg-slate-50 flex items-center justify-center shrink-0">
        <span className="text-[9px] font-black text-slate-500 leading-tight text-center whitespace-pre-line">
          {left.split('').join('\n')}
        </span>
      </div>
      <div className="flex-1 border-t-2 border-dashed border-slate-200 relative">
        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-2 text-[10px] font-black text-slate-400 tracking-widest whitespace-nowrap">
          {center}
        </span>
      </div>
      <div className="w-8 h-8 rounded-lg border-2 border-slate-300 bg-slate-50 flex items-center justify-center shrink-0">
        <span className="text-[9px] font-black text-slate-500 leading-tight text-center whitespace-pre-line">
          {right.split('').join('\n')}
        </span>
      </div>
    </div>
  );
}

// ── 메인 페이지 ───────────────────────────────────────────────────────────────

const CAMPUS_KEYS: CampusKey[] = ['wonju', 'chungju', 'chuncheon'];

export default function SeatBoardPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [campus, setCampus] = useState<CampusKey>('wonju');
  const [pageIdx, setPageIdx] = useState(0);
  // 수동 교시 override: key = "{studentId}:{periodIdx}"
  const [periodOverrides, setPeriodOverrides] = useState<Map<string, PeriodStatus>>(new Map());

  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());

  function handleCampusChange(c: CampusKey) {
    setCampus(c);
    setPageIdx(0);
  }

  // 교시 클릭 → 상태 토글 (absent ↔ present)
  async function handleTogglePeriod(key: string, current: PeriodStatus) {
    const nextStatus: PeriodStatus = current === 'present' ? 'absent' : 'present';
    const previous = new Map(periodOverrides);
    const next = new Map(previous);
    next.set(key, nextStatus);
    setPeriodOverrides(next);

    try {
      const response = await fetch('/api/admin/seat-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ date: today, seatKey: key, status: nextStatus }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.message || 'save failed');
    } catch {
      setPeriodOverrides(previous);
      toast.error('수동 변경 저장에 실패했습니다.');
    }
  }

  async function clearPeriodOverrides() {
    const previous = new Map(periodOverrides);
    setPeriodOverrides(new Map());

    try {
      const response = await fetch(`/api/admin/seat-status?date=${today}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.message || 'delete failed');
    } catch {
      setPeriodOverrides(previous);
      toast.error('수동 변경 초기화에 실패했습니다.');
    }
  }

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [stuRes, sesRes, statusRes] = await Promise.all([
        fetch('/api/admin/students', { cache: 'no-store', credentials: 'same-origin' }),
        fetch(`/api/admin/seat-board?date=${today}`, { credentials: 'same-origin' }),
        fetch(`/api/admin/seat-status?date=${today}`, { cache: 'no-store', credentials: 'same-origin' }),
      ]);
      if (stuRes.ok) {
        const j = await stuRes.json();
        if (j.success) setStudents(j.data || []);
      }
      if (sesRes.ok) {
        const j = await sesRes.json();
        if (j.success) setSessions(j.sessions || []);
      }
      if (statusRes.ok) {
        const j = await statusRes.json();
        if (j.success) {
          const next = new Map<string, PeriodStatus>();
          for (const [key, value] of Object.entries(j.statuses || {})) {
            if (value === 'present' || value === 'absent') next.set(key, value);
          }
          setPeriodOverrides(next);
        }
      }
    } catch {
      toast.error('데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => {
    async function verifyAuth() {
      try {
        const res = await fetch('/api/admin/auth/me');
        if (!res.ok) { router.replace('/admin'); return; }
        loadData();
      } catch {
        router.replace('/admin');
      } finally {
        setCheckingAuth(false);
      }
    }
    verifyAuth();
  }, [router, loadData]);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    timerRef.current = setInterval(() => {
      fetch(`/api/admin/seat-board?date=${today}`, { credentials: 'same-origin' })
        .then((r) => r.json())
        .then((j) => { if (j.success) setSessions(j.sessions || []); })
        .catch(() => {});
    }, 60_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [today]);

  const seatMap = useMemo(() => {
    const m = new Map<number, Student>();
    for (const s of students) {
      if (s.campus === campus && s.seatNumber != null) m.set(s.seatNumber, s);
    }
    return m;
  }, [students, campus]);

  const sessionMap = useMemo(() => {
    const m = new Map<string, StudySession[]>();
    for (const s of sessions) {
      const arr = m.get(s.student_id) ?? [];
      arr.push(s);
      m.set(s.student_id, arr);
    }
    return m;
  }, [sessions]);

  const openIds = useMemo(
    () => new Set(sessions.filter((s) => !s.check_out).map((s) => s.student_id)),
    [sessions],
  );

  const campusStudents = useMemo(
    () => students.filter((s) => s.campus === campus && s.seatNumber != null),
    [students, campus],
  );

  const stats = useMemo(() => {
    const onLeave = campusStudents.filter((s) => hasApprovedLeaveToday(s, today)).length;
    const present = campusStudents.filter((s) => openIds.has(s.id)).length;
    return { total: campusStudents.length, present, onLeave };
  }, [campusStudents, openIds, today]);

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center">
        <Loader2 className="w-7 h-7 text-[#0071E3] animate-spin" />
      </div>
    );
  }

  const { dateStr: nowDateStr, minOfDay: nowMin } = nowKst();
  const rowProps: Omit<RowProps, 'seats'> = {
    seatMap, sessionMap, openIds, today, nowDateStr, nowMin,
    periodOverrides, onTogglePeriod: handleTogglePeriod,
  };

  const layoutPages = CAMPUS_LAYOUTS[campus];
  const layout = layoutPages[pageIdx] ?? layoutPages[0];
  const rows = layout.rows;
  const hallwayAfter = layout.hallwayAfterRow;
  const hallwayLabels = layout.hallwayLabels;
  const separatorAfter = layout.separatorAfterRow;

  function renderRows(from: number, to: number) {
    return rows.slice(from, to + 1).map((row, i) => (
      <SeatRow key={from + i} seats={row} {...rowProps} />
    ));
  }

  const hasOverrides = periodOverrides.size > 0;

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1D1D1F]">
      <AdminTopNav
        title="출결판"
        titleIcon={<LayoutGrid className="w-4 h-4" />}
        onLogout={async () => {
          try { await fetch('/api/admin/auth/logout', { method: 'POST' }); } catch {}
          router.replace('/admin');
        }}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="rounded-2xl border-black/[0.05] text-xs h-9 bg-white px-3"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline ml-1.5 font-bold">새로고침</span>
          </Button>
        }
      />

      <main className="px-4 pt-4 pb-10">
        {/* ── 캠퍼스 선택 + 통계 ── */}
        <div className="flex items-center gap-6 mb-4 flex-wrap">
          <div className="flex bg-white border border-black/[0.05] rounded-2xl p-1 gap-1 shadow-sm">
            {CAMPUS_KEYS.map((k) => (
              <button
                key={k}
                onClick={() => handleCampusChange(k)}
                className={`px-4 py-1.5 rounded-xl text-xs font-black transition-all ${
                  campus === k
                    ? 'bg-[#1D1D1F] text-white shadow-sm'
                    : 'text-slate-500 hover:text-[#1D1D1F]'
                }`}
              >
                {CAMPUS_LABELS[k]}
              </button>
            ))}
          </div>

          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">SSC 스파르타</p>
            <p className="text-sm font-black text-[#1D1D1F]">{today}</p>
          </div>

          <div className="flex gap-4 ml-auto sm:ml-0">
            {[
              { label: '등원중', val: stats.present,                               color: 'text-emerald-600' },
              { label: '미등원', val: stats.total - stats.present - stats.onLeave, color: 'text-slate-500' },
              { label: '휴가',   val: stats.onLeave,                               color: 'text-blue-500' },
            ].map(({ label, val, color }) => (
              <div key={label} className="text-center">
                <p className={`text-xl font-black leading-none ${color}`}>{val}</p>
                <p className="text-[10px] font-bold text-slate-400 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── 페이지(구역) 탭 ── */}
        <div className="flex items-center gap-2 mb-4">
          {layoutPages.map((p, i) => (
            <button
              key={i}
              onClick={() => setPageIdx(i)}
              className={`px-3 py-1.5 rounded-xl text-xs font-black border transition-all ${
                pageIdx === i
                  ? 'bg-[#1D1D1F] text-white border-transparent'
                  : 'bg-white text-slate-500 border-black/[0.06] hover:text-[#1D1D1F]'
              }`}
            >
              {p.label}
            </button>
          ))}
          {/* 수동 override 리셋 */}
          {hasOverrides && (
            <button
              onClick={clearPeriodOverrides}
              className="ml-2 px-3 py-1.5 rounded-xl text-xs font-black border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-all"
            >
              수동변경 초기화
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-7 h-7 text-[#0071E3] animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto pb-4">
            <div className="bg-white rounded-3xl border border-black/[0.04] shadow-sm p-6 inline-block min-w-max">

              {hallwayAfter != null ? (
                <>
                  <div className="flex flex-col gap-[6px]">
                    {renderRows(0, hallwayAfter)}
                  </div>
                  <HallwayDivider
                    left={hallwayLabels?.left ?? ''}
                    center={hallwayLabels?.center ?? '복도'}
                    right={hallwayLabels?.right ?? ''}
                  />
                  <div className="flex flex-col gap-[6px]">
                    {renderRows(hallwayAfter + 1, rows.length - 1)}
                  </div>
                </>
              ) : separatorAfter != null ? (
                <>
                  <div className="flex flex-col gap-[6px]">
                    {renderRows(0, separatorAfter)}
                  </div>
                  <div className="h-7" />
                  <div className="flex flex-col gap-[6px]">
                    {renderRows(separatorAfter + 1, rows.length - 1)}
                  </div>
                </>
              ) : (
                <div className="flex flex-col gap-[6px]">
                  {rows.map((row, i) => <SeatRow key={i} seats={row} {...rowProps} />)}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 범례 */}
        <div className="mt-3 flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-1.5">
            <div className="w-[17px] h-[17px] bg-[#1D1D1F]/[0.06] border border-[#1D1D1F]/[0.12] rounded-[3px] flex items-center justify-center">
              <span className="text-[10px] font-black text-[#1D1D1F]/70">/</span>
            </div>
            <span className="text-[11px] font-bold text-slate-500">출석</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-[17px] h-[17px] bg-red-50 border border-red-200/60 rounded-[3px] flex items-center justify-center">
              <span className="text-[10px] font-black text-red-400">X</span>
            </div>
            <span className="text-[11px] font-bold text-slate-500">결석</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-[17px] h-[17px] bg-amber-50 border border-amber-300 rounded-[3px] flex items-center justify-center">
              <span className="text-[10px] font-black text-amber-600">/</span>
            </div>
            <span className="text-[11px] font-bold text-slate-500">수동 변경</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-[17px] h-[17px] border border-slate-200 rounded-[3px]" />
            <span className="text-[11px] font-bold text-slate-500">미래교시</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
            <span className="text-[11px] font-bold text-slate-500">현재 등원중</span>
          </div>
          <span className="text-[10px] text-slate-400">
            1(08~10) · 2(10~12) · 3(12~14) · 4(14~16) · 5(16~18) · 6(18~20) · 7(20~22) · 8(22~00)
          </span>
          <span className="text-[10px] text-slate-400">· 60초마다 자동 갱신 · 교시 셀 클릭 시 수동 변경</span>
        </div>
      </main>
    </div>
  );
}
