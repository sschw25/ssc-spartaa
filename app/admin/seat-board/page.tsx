'use client';

import React, { useCallback, useEffect, useRef, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminTopNav } from '@/components/admin/admin-top-nav';
import { Loader2, RefreshCw, LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { Student, LeaveRequest } from '@/lib/types/student';
import { CAMPUS_LAYOUTS, CAMPUS_LABELS, type CampusKey, type Cell } from '@/lib/seat-layouts';
import { useAdminGlobalSheet } from '@/components/admin/admin-global-context';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

// ── 수강만료일 D-Day 헬퍼 함수 ───────────────────────────────────────────────
function getEnrollmentDDay(enrollmentEndDate?: string, todayStr?: string): { status: 'expired' | 'warning' | 'normal'; daysLeft?: number } {
  if (!enrollmentEndDate) return { status: 'normal' };
  
  try {
    const todayStrClean = todayStr || new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
    const [tY, tM, tD] = todayStrClean.split('-').map(Number);
    const [eY, eM, eD] = enrollmentEndDate.split('-').map(Number);
    
    if (isNaN(tY) || isNaN(eY)) {
      const todayFallback = new Date();
      todayFallback.setHours(0, 0, 0, 0);
      const endDateFallback = new Date(enrollmentEndDate);
      endDateFallback.setHours(0, 0, 0, 0);
      const diff = endDateFallback.getTime() - todayFallback.getTime();
      const days = Math.round(diff / (1000 * 60 * 60 * 24));
      if (isNaN(days)) return { status: 'normal' };
      if (days < 0) return { status: 'expired' };
      if (days <= 3) return { status: 'warning', daysLeft: days };
      return { status: 'normal' };
    }
    
    const today = new Date(tY, tM - 1, tD);
    const endDate = new Date(eY, eM - 1, eD);
    
    const diffTime = endDate.getTime() - today.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
      return { status: 'expired' };
    } else if (diffDays <= 3) {
      return { status: 'warning', daysLeft: diffDays };
    }
    return { status: 'normal' };
  } catch {
    return { status: 'normal' };
  }
}

// ── 교시 정의 (08:00~00:00, 2시간씩) ─────────────────────────────────────────

const PERIODS = [
  { label: '1', start:  9 * 60,        end: 10 * 60 + 50 },  // 09:00~10:50
  { label: '2', start: 11 * 60 + 10,   end: 12 * 60 + 30 },  // 11:10~12:30
  { label: '3', start: 13 * 60 + 50,   end: 15 * 60      },  // 13:50~15:00
  { label: '4', start: 15 * 60 + 10,   end: 16 * 60 + 20 },  // 15:10~16:20
  { label: '5', start: 16 * 60 + 30,   end: 17 * 60 + 40 },  // 16:30~17:40
  { label: '6', start: 18 * 60 + 50,   end: 20 * 60 + 20 },  // 18:50~20:20
  { label: '7', start: 20 * 60 + 30,   end: 22 * 60      },  // 20:30~22:00
  { label: '8', start: 22 * 60 + 10,   end: 23 * 60 + 20 },  // 22:10~23:20 심야
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

function kstTimeStr(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso));
  const h = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const m = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${h}:${m}`;
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

type PeriodStatus = 'present' | 'absent' | 'future' | 'A';
type ManualLeaveType = 'fullday' | 'morning' | 'afternoon' | 'night' | 'sick';
const MANUAL_LEAVE_TYPES: ManualLeaveType[] = ['fullday', 'morning', 'afternoon', 'night', 'sick'];

function isManualLeaveType(value: string): value is ManualLeaveType {
  return MANUAL_LEAVE_TYPES.includes(value as ManualLeaveType);
}

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

function timeStringToMin(timeStr: string): number {
  if (!timeStr || !timeStr.includes(':')) return -1;
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return -1;
  return h * 60 + m;
}

// 교시 상태 (computed + 수동 override 여부)
interface PeriodState {
  status: PeriodStatus;
  isOverridden: boolean;
  awayTime?: string;       // 정기 외출 예정 시각 (HH:MM) → 셀 내부 표시
  checkInTime?: string;    // 실제 등원 시각 (HH:MM) → 등원한 교시 셀 내부
  checkOutTime?: string;   // 실제 하원 시각 (HH:MM) → 하원한 교시 셀 내부
  isAwayAbsent?: boolean;  // 외출 후 미복귀로 간주되는 교시 → X 표시
}

function computePeriods(
  student: Student | null,
  sessions: StudySession[],
  todayStr: string,
  nowDateStr: string,
  nowMin: number,
): PeriodStatus[] {
  const cmp = todayStr.localeCompare(nowDateStr);
  const effectiveNow = cmp === 0 ? nowMin : cmp < 0 ? 24 * 60 : 0;
  
  // 당일 승인된 휴가 신청 목록 필터링
  const approvedLeaves = student
    ? (student.leaveRequests || []).filter((r) => r.date === todayStr && r.status === 'approved')
    : [];

  const isLeavePeriod = (idx: number) =>
    approvedLeaves.some((leave) => {
      const type = leave.type;
      return (
        type === 'fullday' ||
        type === 'sick' ||
        (type === 'morning' && idx < 2) ||
        (type === 'afternoon' && idx >= 2 && idx <= 4) ||
        (type === 'night' && idx >= 5 && idx <= 6)
      );
    });

  return PERIODS.map((period, idx) => {
    const covered = sessions.some((session) => {
      const inM = kstMin(session.check_in);
      let outM = session.check_out ? kstMin(session.check_out) : effectiveNow;
      if (outM < inM) outM += 1440;
      return inM < period.end && outM > period.start;
    });
    if (covered) return 'present';

    const leavePeriod = isLeavePeriod(idx);
    if (leavePeriod) return 'absent';
    if (cmp > 0 || (cmp === 0 && period.start >= nowMin)) return 'future';
    return 'absent';
  });
}

function hasApprovedLeaveToday(student: Student, today: string): boolean {
  return (student.leaveRequests || []).some(
    (r: LeaveRequest) => r.date === today && r.status === 'approved',
  );
}

// ── 교시 셀 ───────────────────────────────────────────────────────────────────

function TimeHM({ hm, cls }: { hm: string; cls: string }) {
  const [h, m] = hm.split(':');
  return (
    <div className={`flex flex-col items-center -space-y-[2px] leading-none select-none ${cls}`}>
      <span className="text-[7px] font-black tracking-tighter">{h}</span>
      <span className="text-[7px] font-black tracking-tighter">{m}</span>
    </div>
  );
}

function PeriodCell({
  status, label, isOverridden, awayTime, checkInTime, checkOutTime, isAwayAbsent, onClick,
}: {
  status: PeriodStatus; label: string; isOverridden?: boolean;
  awayTime?: string; checkInTime?: string; checkOutTime?: string;
  isAwayAbsent?: boolean; onClick?: () => void;
}) {
  const hoverCls = onClick ? 'cursor-pointer hover:brightness-95 active:scale-90 transition-all' : '';

  // 8교시 (심야 A 라벨)
  if (label === '8') {
    return (
      <div onClick={onClick} className={`w-[17px] h-[17px] border rounded-[3px] flex items-center justify-center ${hoverCls} ${isOverridden ? 'bg-amber-50 border-amber-300 text-amber-600' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
        <span className="text-[10px] font-bold leading-none">A</span>
      </div>
    );
  }

  // 정기외출 이후 미복귀 — 세션 유무/미래 여부 불문하고 최우선 (8교시 제외)
  if (isAwayAbsent) {
    return (
      <div onClick={onClick} className={`w-[17px] h-[17px] border border-slate-300 rounded-[3px] bg-slate-50 flex items-center justify-center ${hoverCls}`}>
        <span className="text-[8px] font-black leading-none text-slate-400">x</span>
      </div>
    );
  }

  // 미래 교시
  if (status === 'future') {
    return (
      <div onClick={onClick} className={`w-[17px] h-[17px] border border-slate-200 rounded-[3px] bg-white flex items-center justify-center ${hoverCls}`}>
        <span className="text-[7px] text-slate-300 font-bold leading-none">{label}</span>
      </div>
    );
  }

  // 출석 교시 — 우선순위: 정기외출시간 > 실제하원시간 > 실제등원시간 > 슬래시
  if (status === 'present') {
    let inner: React.ReactNode;
    if (awayTime?.includes(':'))      inner = <TimeHM hm={awayTime} cls="text-amber-500" />;
    else if (checkOutTime?.includes(':')) inner = <TimeHM hm={checkOutTime} cls="text-[#0071E3]" />;
    else if (checkInTime?.includes(':'))  inner = <TimeHM hm={checkInTime} cls="text-emerald-600" />;
    else inner = <span className={`text-[11px] font-black leading-none ${isOverridden ? 'text-amber-600' : 'text-[#1D1D1F]/70'}`}>/</span>;

    return (
      <div onClick={onClick} className={`w-[17px] h-[17px] border rounded-[3px] flex items-center justify-center ${hoverCls} ${isOverridden ? 'bg-amber-50 border-amber-300' : 'bg-[#1D1D1F]/[0.06] border-[#1D1D1F]/[0.12]'}`}>
        {inner}
      </div>
    );
  }

  // 결석 — 수동 override
  if (isOverridden) {
    return (
      <div onClick={onClick} className={`w-[17px] h-[17px] border rounded-[3px] flex items-center justify-center ${hoverCls} bg-amber-50 border-amber-300`}>
        <span className="text-[10px] font-black leading-none text-amber-600">X</span>
      </div>
    );
  }

  // 결석 — 일반 (교시 번호 흐리게)
  return (
    <div onClick={onClick} className={`w-[17px] h-[17px] border border-slate-200 rounded-[3px] bg-white flex items-center justify-center ${hoverCls}`}>
      <span className="text-[7px] leading-none text-slate-200 font-bold">{label}</span>
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
  phoneNoSubmit?: Set<'D' | 'E' | 'N'>;
  onTogglePhone?: (block: 'D' | 'E' | 'N') => void;
  isLeftToday: boolean;
  todayStr: string;
  onTogglePeriod?: (periodIdx: number) => void;
  onClick?: () => void;
  onNameClick?: () => void;
}

function SeatCard({ seatNum, student, periods, isOnLeave, isCheckedIn, isLeftToday, todayStr, onTogglePeriod, onClick, onNameClick, phoneNoSubmit, onTogglePhone }: SeatCardProps) {
  if (!student) {
    return (
      <div className="w-[80px] h-[100px] rounded-lg border border-dashed border-slate-200 bg-slate-50/40 p-1.5 flex flex-col shrink-0">
        <span className="text-[9px] font-black text-slate-300">{seatNum}</span>
      </div>
    );
  }

  const dday = getEnrollmentDDay(student.enrollmentEndDate, todayStr);

  const ring = isCheckedIn
    ? 'border-emerald-300 ring-1 ring-emerald-200'
    : isOnLeave
    ? 'border-blue-200'
    : isLeftToday
    ? 'border-slate-300'
    : 'border-slate-200/80';
  const bg = isCheckedIn 
    ? 'bg-emerald-50/60' 
    : isOnLeave 
    ? 'bg-blue-50/60' 
    : isLeftToday 
    ? 'bg-slate-50/80' 
    : 'bg-white';

  return (
    <div
      onClick={onClick}
      className={`w-[80px] h-[100px] rounded-lg border ${ring} ${bg} p-1.5 shadow-sm flex flex-col shrink-0 cursor-pointer hover:border-slate-400 active:scale-[0.98] transition-all`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-black text-slate-400">{seatNum}</span>
        <div className="flex gap-[2px]">
          {isOnLeave && (
            <span className="text-[7px] font-black text-blue-500 bg-blue-100 px-1 py-0.5 rounded-[3px] leading-none shrink-0">휴가</span>
          )}
          {isLeftToday && (
            <span className="text-[7px] font-black text-slate-500 bg-slate-100 px-1 py-0.5 rounded-[3px] leading-none shrink-0">하원</span>
          )}
          {!isCheckedIn && !isLeftToday && !isOnLeave && (
            <span className="text-[7px] font-black text-red-500 bg-red-50 border border-red-100 px-1 py-0.5 rounded-[3px] leading-none shrink-0">미등원</span>
          )}
        </div>
      </div>
      
      <div className="flex flex-col gap-[1px] my-0.5">
        <div className="flex items-center gap-1 min-w-0">
          <p 
            onClick={(e) => {
              if (onNameClick) {
                e.stopPropagation();
                onNameClick();
              }
            }}
            className="text-[11px] font-black text-[#1D1D1F] leading-tight truncate shrink-0 max-w-[50px] hover:underline decoration-[#1D1D1F]/50 decoration-1"
          >
            {student.name}
          </p>
          {isCheckedIn && !isOnLeave && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)] animate-pulse shrink-0" />
          )}
          {isLeftToday && !isOnLeave && (
            <span className="w-1.5 h-1.5 rounded-full bg-[#0071E3] shrink-0" />
          )}
        </div>
        
        {/* 만료 관련 작은 뱃지 */}
        {dday.status === 'expired' && (
          <span className="text-[7px] font-black text-red-600 bg-red-50 border border-red-200 px-1 py-0.5 rounded-[3px] w-fit leading-none shrink-0">
            만료
          </span>
        )}
        {dday.status === 'warning' && (
          <span className="text-[7px] font-black text-amber-600 bg-amber-50 border border-amber-200 px-1 py-0.5 rounded-[3px] w-fit leading-none shrink-0">
            {dday.daysLeft === 0 ? '만료 D-Day' : `만료 D-${dday.daysLeft}`}
          </span>
        )}
      </div>

      {/* 휴대폰 보관 상태 박스 (D/E/N) — 클릭으로 미제출 토글 */}
      <div className="flex gap-[3px] mt-0.5" onClick={(e) => e.stopPropagation()}>
        {([
          { label: 'D', indices: [0, 1] },
          { label: 'E', indices: [2, 3, 4] },
          { label: 'N', indices: [5, 6] },
        ] as const).map(({ label, indices }) => {
          const allAbsent = indices.every((i) =>
            periods[i]?.status === 'absent' || periods[i]?.status === 'future' || periods[i]?.isAwayAbsent
          );
          const manualNoSubmit = phoneNoSubmit?.has(label) ?? false;
          const showX = allAbsent || manualNoSubmit;
          return (
            <div
              key={label}
              onClick={onTogglePhone ? () => onTogglePhone(label) : undefined}
              title={manualNoSubmit ? `${label} 미제출 (클릭해 해제)` : `${label} 미제출 표시`}
              className={`flex-1 h-[10px] rounded-[2px] flex items-center justify-center border transition-all ${
                onTogglePhone ? 'cursor-pointer active:scale-90' : ''
              } ${
                manualNoSubmit
                  ? 'bg-red-50 border-red-200'
                  : allAbsent
                  ? 'bg-slate-100 border-slate-200'
                  : 'bg-[#0071E3]/[0.06] border-[#0071E3]/20'
              }`}
            >
              <span className={`text-[6px] font-black leading-none ${
                manualNoSubmit ? 'text-red-400' : allAbsent ? 'text-slate-300' : 'text-[#0071E3]/60'
              }`}>
                {showX ? 'x' : label}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-[3px] mt-[3px]" onClick={(e) => e.stopPropagation()}>
        <div className="flex gap-[3px]">
          {periods.slice(0, 4).map(({ status, isOverridden, awayTime, checkInTime, checkOutTime, isAwayAbsent }, i) => (
            <PeriodCell
              key={i}
              status={status}
              label={String(i + 1)}
              isOverridden={isOverridden}
              awayTime={awayTime}
              checkInTime={checkInTime}
              checkOutTime={checkOutTime}
              isAwayAbsent={isAwayAbsent}
              onClick={onTogglePeriod ? () => onTogglePeriod(i) : undefined}
            />
          ))}
        </div>
        <div className="flex gap-[3px]">
          {periods.slice(4).map(({ status, isOverridden, awayTime, checkInTime, checkOutTime, isAwayAbsent }, i) => (
            <PeriodCell
              key={i + 4}
              status={status}
              label={String(i + 5)}
              isOverridden={isOverridden}
              awayTime={awayTime}
              checkInTime={checkInTime}
              checkOutTime={checkOutTime}
              isAwayAbsent={isAwayAbsent}
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
  phoneNoSubmitMap: Map<string, Set<'D' | 'E' | 'N'>>;
  onTogglePeriod: (key: string, current: PeriodStatus) => void;
  onTogglePhone: (studentId: string, block: 'D' | 'E' | 'N') => void;
  onCardClick: (student: Student) => void;
  onNameClick: (student: Student) => void;
}

function SeatRow({ seats, seatMap, sessionMap, openIds, today, nowDateStr, nowMin, periodOverrides, phoneNoSubmitMap, onTogglePeriod, onTogglePhone, onCardClick, onNameClick }: RowProps) {
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
        const isLeftToday = student ? (sessions.length > 0 && sessions.every((s) => s.check_out)) : false;
        const raw = computePeriods(student, sessions, today, nowDateStr, nowMin);

        // ── 정기 외출 이탈 시각 (복귀 없는 항목 중 오늘 적용되는 것) ─────────
        const todayDow = new Date(today + 'T00:00:00').getDay();
        let awayDepartureMin = -1;
        if (student && student.awaySchedules && student.awaySchedules.length > 0) {
          const noReturn = student.awaySchedules.find((sc) => {
            if (sc.returnTime) return false;
            if (sc.days && sc.days.length > 0 && !sc.days.includes(todayDow)) return false;
            if (sc.until && sc.until !== 'forever' && sc.until < today) return false;
            return true;
          });
          if (noReturn) awayDepartureMin = timeStringToMin(noReturn.awayTime);
        }

        // ── 실제 등원/하원 시각 (첫 세션 등원, 마지막 세션 하원) ─────────────
        const firstCheckInIso = sessions.length > 0 ? sessions[0].check_in : null;
        const lastCheckOutIso = sessions.reduce((latest: string | null, s) =>
          s.check_out && (!latest || s.check_out > latest) ? s.check_out : latest, null);
        const firstCheckInMin = firstCheckInIso ? kstMin(firstCheckInIso) : -1;
        const lastCheckOutMin = lastCheckOutIso ? kstMin(lastCheckOutIso) : -1;
        const checkInTimeStr = firstCheckInIso ? kstTimeStr(firstCheckInIso) : undefined;
        const checkOutTimeStr = lastCheckOutIso ? kstTimeStr(lastCheckOutIso) : undefined;
        const checkInPeriodIdx = firstCheckInMin >= 0
          ? PERIODS.findIndex((p) => firstCheckInMin >= p.start && firstCheckInMin < p.end) : -1;
        const checkOutPeriodIdx = lastCheckOutMin >= 0
          ? PERIODS.findIndex((p) => lastCheckOutMin >= p.start && lastCheckOutMin < p.end) : -1;

        const periods: PeriodState[] = raw.map((s, idx) => {
          const key = student ? `${student.id}:${idx}` : '';
          const override = student ? periodOverrides.get(key) : undefined;

          // 정기 외출 시각 — 해당 교시에 이탈 예정
          let awayTime: string | undefined = undefined;
          if (student && student.awaySchedules && student.awaySchedules.length > 0) {
            const period = PERIODS[idx];
            const matched = student.awaySchedules.find((schedule) => {
              if (schedule.days && schedule.days.length > 0 && !schedule.days.includes(todayDow)) return false;
              if (schedule.until && schedule.until !== 'forever' && schedule.until < today) return false;
              const min = timeStringToMin(schedule.awayTime);
              return min >= period.start && min < period.end;
            });
            if (matched) awayTime = matched.awayTime;
          }

          // 정기 외출 이탈 이후 미복귀 교시 — 세션이 덮더라도 x 표시
          const isAwayAbsent =
            awayDepartureMin > 0 &&
            PERIODS[idx].start >= awayDepartureMin;

          return {
            status: override ?? s,
            isOverridden: override !== undefined,
            awayTime,
            checkInTime: idx === checkInPeriodIdx ? checkInTimeStr : undefined,
            checkOutTime: idx === checkOutPeriodIdx ? checkOutTimeStr : undefined,
            isAwayAbsent,
          };
        });
        return (
          <SeatCard
            key={n}
            seatNum={n}
            student={student}
            periods={periods}
            isOnLeave={isOnLeave}
            isCheckedIn={isCheckedIn}
            isLeftToday={isLeftToday}
            todayStr={today}
            onTogglePeriod={
              student
                ? (idx) => onTogglePeriod(`${student.id}:${idx}`, periods[idx].status)
                : undefined
            }
            onClick={student ? () => onCardClick(student) : undefined}
            onNameClick={student ? () => onNameClick(student) : undefined}
            phoneNoSubmit={student ? phoneNoSubmitMap.get(student.id) : undefined}
            onTogglePhone={student ? (block) => onTogglePhone(student.id, block) : undefined}
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
  const { openStudent } = useAdminGlobalSheet();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [campus, setCampus] = useState<CampusKey>('wonju');
  const [pageIdx, setPageIdx] = useState(0);
  // 수동 교시 override: key = "{studentId}:{periodIdx}"
  const [periodOverrides, setPeriodOverrides] = useState<Map<string, PeriodStatus>>(new Map());
  // 폰 미제출 수동 표시: studentId → Set<'D'|'E'|'N'>
  const [phoneNoSubmitMap, setPhoneNoSubmitMap] = useState<Map<string, Set<'D' | 'E' | 'N'>>>(new Map());

  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [checkInTime, setCheckInTime] = useState('');
  const [checkOutTime, setCheckOutTime] = useState('');
  const [leaveType, setLeaveType] = useState<ManualLeaveType>('fullday');
  const [leaveReason, setLeaveReason] = useState('관리자 수동 등록');
  const [submittingAttendance, setSubmittingAttendance] = useState(false);
  const [submittingLeave, setSubmittingLeave] = useState(false);

  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());

  function handleCampusChange(c: CampusKey) {
    setCampus(c);
    setPageIdx(0);
  }

  // 교시 클릭 → 상태 토글 (absent ↔ present)
  async function handleTogglePeriod(key: string, current: PeriodStatus) {
    const parts = key.split(':');
    const studentId = parts[0];
    const periodIdx = parseInt(parts[parts.length - 1], 10);
    const is8th = periodIdx === 7;

    if (is8th) {
      let hasNonAbsentOverride = false;
      for (let i = 0; i < 7; i++) {
        const k = `${studentId}:${i}`;
        const ov = periodOverrides.get(k);
        if (ov !== 'absent') {
          hasNonAbsentOverride = true;
          break;
        }
      }

      const previous = new Map(periodOverrides);
      const next = new Map(previous);

      if (hasNonAbsentOverride) {
        for (let i = 0; i < 8; i++) {
          next.set(`${studentId}:${i}`, 'absent');
        }
        setPeriodOverrides(next);

        try {
          await Promise.all(
            Array.from({ length: 8 }).map((_, i) =>
              fetch('/api/admin/seat-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ date: today, seatKey: `${studentId}:${i}`, status: 'absent' }),
              })
            )
          );
          toast.success('1~7교시 전체 결석 처리가 저장되었습니다.');
        } catch {
          setPeriodOverrides(previous);
          toast.error('수동 변경 저장에 실패했습니다.');
        }
      } else {
        for (let i = 0; i < 8; i++) {
          next.delete(`${studentId}:${i}`);
        }
        setPeriodOverrides(next);

        try {
          await Promise.all(
            Array.from({ length: 8 }).map((_, i) =>
              fetch(`/api/admin/seat-status?date=${today}&seatKey=${studentId}:${i}`, {
                method: 'DELETE',
                credentials: 'same-origin',
              })
            )
          );
          toast.success('수동 변경이 초기화되었습니다.');
        } catch {
          setPeriodOverrides(previous);
          toast.error('수동 변경 초기화에 실패했습니다.');
        }
      }
      return;
    }

    let nextStatus: PeriodStatus | 'delete' = 'present';
    if (current === 'present') {
      nextStatus = 'absent';
    } else if (current === 'absent') {
      nextStatus = 'delete';
    } else {
      nextStatus = 'present';
    }

    const previous = new Map(periodOverrides);
    const next = new Map(previous);
    
    if (nextStatus === 'delete') {
      next.delete(key);
    } else {
      next.set(key, nextStatus);
    }
    setPeriodOverrides(next);

    try {
      if (nextStatus === 'delete') {
        const response = await fetch(`/api/admin/seat-status?date=${today}&seatKey=${key}`, {
          method: 'DELETE',
          credentials: 'same-origin',
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok || !json.success) throw new Error(json.message || 'delete failed');
      } else {
        const response = await fetch('/api/admin/seat-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ date: today, seatKey: key, status: nextStatus }),
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok || !json.success) throw new Error(json.message || 'save failed');
      }
    } catch {
      setPeriodOverrides(previous);
      toast.error('수동 변경 저장에 실패했습니다.');
    }
  }

  async function handleTogglePhone(studentId: string, block: 'D' | 'E' | 'N') {
    const previous = new Map(phoneNoSubmitMap);
    const next = new Map(phoneNoSubmitMap);
    const set = new Set(next.get(studentId) || []);
    const seatKey = `${studentId}:phone_${block}`;
    const isMarked = set.has(block);

    if (isMarked) {
      set.delete(block);
    } else {
      set.add(block);
    }
    if (set.size === 0) next.delete(studentId); else next.set(studentId, set);
    setPhoneNoSubmitMap(next);

    try {
      if (isMarked) {
        await fetch(`/api/admin/seat-status?date=${today}&seatKey=${encodeURIComponent(seatKey)}`, {
          method: 'DELETE', credentials: 'same-origin',
        });
      } else {
        await fetch('/api/admin/seat-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ date: today, seatKey, status: 'absent' }),
        });
      }
    } catch {
      setPhoneNoSubmitMap(previous);
      toast.error('휴대폰 미제출 저장에 실패했습니다.');
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
          const phoneNext = new Map<string, Set<'D' | 'E' | 'N'>>();
          for (const [key, value] of Object.entries(j.statuses || {})) {
            const phoneMatch = key.match(/^(.+):phone_(D|E|N)$/);
            if (phoneMatch && value === 'absent') {
              const sid = phoneMatch[1];
              const block = phoneMatch[2] as 'D' | 'E' | 'N';
              if (!phoneNext.has(sid)) phoneNext.set(sid, new Set());
              phoneNext.get(sid)!.add(block);
            } else if (value === 'present' || value === 'absent') {
              next.set(key, value);
            }
          }
          setPeriodOverrides(next);
          setPhoneNoSubmitMap(phoneNext);
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
    for (const arr of m.values()) {
      arr.sort((a, b) => a.check_in.localeCompare(b.check_in));
    }
    return m;
  }, [sessions]);

  // ISO 문자열을 KST의 HH:MM 형태로 포매팅하는 유틸리티
  function formatIsoToHM(isoStr: string): string {
    try {
      const date = new Date(isoStr);
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false,
      }).formatToParts(date);
      const h = parts.find((p) => p.type === 'hour')?.value ?? '00';
      const m = parts.find((p) => p.type === 'minute')?.value ?? '00';
      return `${h}:${m}`;
    } catch {
      return '';
    }
  }

  function openAttendanceModal(student: Student) {
    const studentSessions = sessionMap.get(student.id) ?? [];
    const latest = studentSessions[studentSessions.length - 1];

    setSelectedStudent(student);
    setCheckInTime(latest ? formatIsoToHM(latest.check_in) : '');
    setCheckOutTime(latest?.check_out ? formatIsoToHM(latest.check_out) : '');
    setLeaveType('fullday');
    setLeaveReason('관리자 수동 등록');
    setIsModalOpen(true);
  }

  async function handleSaveAttendance() {
    if (!selectedStudent) return;
    if (!checkInTime && checkOutTime) {
      toast.error('등원 시간을 먼저 입력해 주세요.');
      return;
    }
    setSubmittingAttendance(true);
    try {
      const response = await fetch('/api/admin/attendance/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          studentId: selectedStudent.id,
          date: today,
          checkIn: checkInTime || null,
          checkOut: checkOutTime || '',
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.message || '저장 실패');
      
      toast.success('수동 출결이 저장되었습니다.');
      await loadData();
      setIsModalOpen(false);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, '출결 저장 중 오류가 발생했습니다.'));
    } finally {
      setSubmittingAttendance(false);
    }
  }

  async function handleClearAttendance() {
    if (!selectedStudent) return;
    if (!confirm('당일 등하원 기록을 모두 삭제하시겠습니까?')) return;
    setSubmittingAttendance(true);
    try {
      const response = await fetch('/api/admin/attendance/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          studentId: selectedStudent.id,
          date: today,
          clear: true,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.message || '삭제 실패');
      
      toast.success('당일 출결 기록이 초기화되었습니다.');
      await loadData();
      setIsModalOpen(false);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, '출결 삭제 중 오류가 발생했습니다.'));
    } finally {
      setSubmittingAttendance(false);
    }
  }

  async function handleSaveLeave() {
    if (!selectedStudent) return;
    setSubmittingLeave(true);
    try {
      const response = await fetch(`/api/admin/students/${selectedStudent.id}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          type: leaveType,
          date: today,
          reason: leaveReason,
          status: 'approved',
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.message || '휴가 신청 실패');

      toast.success('수동 휴무(즉시 승인)가 등록되었습니다.');
      await loadData();
      setIsModalOpen(false);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, '휴가 등록 중 오류가 발생했습니다.'));
    } finally {
      setSubmittingLeave(false);
    }
  }

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

  const openStudentInfo = (student: Student) => {
    openStudent(student, {
      defaultTab: 'info',
      onUpdate: (updated) => {
        setStudents((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      },
      allStudents: students,
    });
  };

  const rowProps: Omit<RowProps, 'seats'> = {
    seatMap, sessionMap, openIds, today, nowDateStr, nowMin,
    periodOverrides, phoneNoSubmitMap,
    onTogglePeriod: handleTogglePeriod,
    onTogglePhone: handleTogglePhone,
    onCardClick: openStudentInfo,
    onNameClick: openStudentInfo,
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
            1(09~10:50) · 2(11:10~12:30) · 3(13:50~15) · 4(15:10~16:20) · 5(16:30~17:40) · 6(18:50~20:20) · 7(20:30~22) · 심야(22:10~23:20)
          </span>
          <span className="text-[10px] text-slate-400">· 60초마다 자동 갱신 · 교시 셀 클릭 시 수동 변경</span>
        </div>

        {/* ── 수동 출결 및 휴무 신청 모달 ── */}
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="max-w-md rounded-2xl bg-white p-6 shadow-xl border border-black/[0.05]">
            <DialogHeader>
              <DialogTitle className="text-base font-black text-[#1D1D1F]">
                {selectedStudent?.name} 원생 출결 및 휴가 관리
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                좌석: {selectedStudent?.seatNumber}번 · 당일 기준 수동 출결 및 휴무 등록
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-6 mt-4">
              {/* 등하원 수동 입력 섹션 */}
              <div className="border border-black/[0.05] rounded-xl p-4 bg-slate-50/50">
                <h3 className="text-xs font-black text-slate-600 mb-3 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  당일 등하원 수동 설정
                </h3>

                {/* 오전/오후/야간 퀵 프리셋 버튼 */}
                <div className="flex flex-col gap-1.5 mb-3">
                  <Label className="text-[10px] font-bold text-slate-400">시간 프리셋</Label>
                  <div className="flex gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const expected = selectedStudent?.expectedArrival || '08:20';
                        setCheckInTime(expected);
                        setCheckOutTime('22:00');
                      }}
                      className="flex-1 rounded-xl text-[10px] h-7 bg-white border-black/[0.06] hover:bg-slate-50 font-bold"
                    >
                      오전 ({selectedStudent?.expectedArrival || '08:20'})
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setCheckInTime('13:00');
                        setCheckOutTime('22:00');
                      }}
                      className="flex-1 rounded-xl text-[10px] h-7 bg-white border-black/[0.06] hover:bg-slate-50 font-bold"
                    >
                      오후 (13:00)
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setCheckInTime('18:00');
                        setCheckOutTime('22:00');
                      }}
                      className="flex-1 rounded-xl text-[10px] h-7 bg-white border-black/[0.06] hover:bg-slate-50 font-bold"
                    >
                      야간 (18:00)
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="flex flex-col gap-1.5">
                     <Label htmlFor="checkIn" className="text-[10px] font-bold text-slate-400">등원 시간</Label>
                    <Input
                      id="checkIn"
                      type="time"
                      value={checkInTime}
                      onChange={(e) => setCheckInTime(e.target.value)}
                      className="h-9 rounded-lg text-xs bg-white border-black/[0.08]"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                     <Label htmlFor="checkOut" className="text-[10px] font-bold text-slate-400">하원 시간</Label>
                    <Input
                      id="checkOut"
                      type="time"
                      value={checkOutTime}
                      onChange={(e) => setCheckOutTime(e.target.value)}
                      className="h-9 rounded-lg text-xs bg-white border-black/[0.08]"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleSaveAttendance}
                    disabled={submittingAttendance}
                    className="flex-1 rounded-xl text-xs font-black bg-[#0071E3] hover:bg-[#0071E3]/90 text-white h-9"
                  >
                    {submittingAttendance ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                    출결 시간 저장
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleClearAttendance}
                    disabled={submittingAttendance}
                    className="rounded-xl text-xs font-black border-red-200 text-red-600 bg-red-50/50 hover:bg-red-50 h-9"
                  >
                    기록 초기화
                  </Button>
                </div>
              </div>

              {/* 수동 휴가 등록 섹션 */}
              <div className="border border-black/[0.05] rounded-xl p-4 bg-slate-50/50">
                <h3 className="text-xs font-black text-slate-600 mb-3 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  당일 수동 휴무 신청 (즉시 승인)
                </h3>
                <div className="flex flex-col gap-3 mb-4">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-[10px] font-bold text-slate-400">휴무 구분</Label>
                    <Select
                      value={leaveType}
                      onValueChange={(value) => {
                        if (isManualLeaveType(value)) setLeaveType(value);
                      }}
                    >
                      <SelectTrigger className="h-9 rounded-lg text-xs bg-white border-black/[0.08]">
                        <SelectValue placeholder="구분 선택" />
                      </SelectTrigger>
                      <SelectContent className="rounded-lg bg-white border-black/[0.05]">
                        <SelectItem value="fullday" className="text-xs">하루종일 휴가</SelectItem>
                        <SelectItem value="morning" className="text-xs">오전 반차 (1, 2교시)</SelectItem>
                        <SelectItem value="afternoon" className="text-xs">오후 반차 (3, 4, 5교시)</SelectItem>
                        <SelectItem value="night" className="text-xs">야간 반차 (6, 7교시)</SelectItem>
                        <SelectItem value="sick" className="text-xs">병가</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="leaveReason" className="text-[10px] font-bold text-slate-400">휴무 사유</Label>
                    <Input
                      id="leaveReason"
                      value={leaveReason}
                      onChange={(e) => setLeaveReason(e.target.value)}
                      placeholder="사유를 입력해 주세요."
                      className="h-9 rounded-lg text-xs bg-white border-black/[0.08]"
                    />
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={handleSaveLeave}
                  disabled={submittingLeave}
                  className="w-full rounded-xl text-xs font-black bg-[#1D1D1F] hover:bg-[#1D1D1F]/90 text-white h-9"
                >
                  {submittingLeave ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                  휴무 즉시 승인 등록
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
