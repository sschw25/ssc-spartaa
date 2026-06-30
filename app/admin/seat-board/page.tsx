'use client';

import React, { useCallback, useEffect, useRef, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminTopNav } from '@/components/admin/admin-top-nav';
import { CalendarDays, Loader2, RefreshCw, LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { Student, LeaveRequest } from '@/lib/types/student';
import { CAMPUS_LAYOUTS, CAMPUS_LABELS, type CampusKey, type Cell } from '@/lib/seat-layouts';
import { useAdminGlobalSheet } from '@/components/admin/admin-global-context';

import { Input } from '@/components/ui/input';

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

// 엑셀 '출결판'은 정기 외출/결석 구간을 아래 경계와 비교한다.
// 8교시는 수식 범위 밖이라 앱에서도 A 표시 전용으로 유지한다.
const EXCEL_AWAY_PERIOD_RULES = [
  { boundary:  9 * 60 + 1,  end: 10 * 60 + 50 },
  { boundary: 11 * 60 + 1,  end: 12 * 60 + 30 },
  { boundary: 13 * 60 + 51, end: 15 * 60 },
  { boundary: 15 * 60 + 11, end: 16 * 60 + 20 },
  { boundary: 16 * 60 + 31, end: 17 * 60 + 40 },
  { boundary: 18 * 60 + 51, end: 20 * 60 + 20 },
  { boundary: 20 * 60 + 31, end: 22 * 60 },
] as const;

const REGULAR_CHECKOUT_MIN = 22 * 60;

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

function timeStringToMin(timeStr: string): number {
  if (!timeStr || !timeStr.includes(':')) return -1;
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return -1;
  return h * 60 + m;
}

interface AwayInterval {
  startMin: number;
  endMin: number;
  startTime: string;
}

function normalizeAwayDays(days: unknown): Array<number | string> {
  return Array.isArray(days) ? days : [];
}

type StudentAwaySchedule = NonNullable<Student['awaySchedules']>[number];

function awayScheduleMatchesDow(schedule: StudentAwaySchedule, todayDow: number): boolean {
  const rawDays = normalizeAwayDays(schedule.days);
  if (rawDays.length === 0) return true;

  const todayLabels = [
    ['일', '일요일', 'sun', 'sunday'],
    ['월', '월요일', 'mon', 'monday'],
    ['화', '화요일', 'tue', 'tuesday'],
    ['수', '수요일', 'wed', 'wednesday'],
    ['목', '목요일', 'thu', 'thursday'],
    ['금', '금요일', 'fri', 'friday'],
    ['토', '토요일', 'sat', 'saturday'],
  ][todayDow];
  const todayMon0 = todayDow === 0 ? 6 : todayDow - 1;

  return rawDays.some((day) => {
    if (typeof day === 'number') {
      if (schedule.dayMode === 'mon0') return day === todayMon0;
      if (schedule.dayMode === 'sun0') return day === todayDow;
      // dayMode가 없는 기존 데이터는 일=0 체계와 월=0 체계를 모두 허용한다.
      return day === todayDow || day === todayMon0;
    }
    if (typeof day === 'string') {
      const normalized = day.trim().toLowerCase();
      return todayLabels.includes(normalized);
    }
    return false;
  });
}

function getApplicableAwayIntervals(student: Student | null, today: string, todayDow: number): AwayInterval[] {
  if (!student?.awaySchedules?.length) return [];

  return student.awaySchedules
    .filter((schedule) => {
      if (!awayScheduleMatchesDow(schedule, todayDow)) return false;
      if (schedule.until && schedule.until !== 'forever' && schedule.until < today) return false;
      return timeStringToMin(schedule.awayTime) >= 0;
    })
    .map((schedule) => {
      const startMin = timeStringToMin(schedule.awayTime);
      const returnMin = schedule.returnTime ? timeStringToMin(schedule.returnTime) : -1;
      let endMin = returnMin >= 0 ? returnMin : 24 * 60;
      if (endMin <= startMin) endMin += 24 * 60;
      return { startMin, endMin, startTime: schedule.awayTime };
    })
    .sort((a, b) => a.startMin - b.startMin);
}

function getAwayPeriodMark(intervals: AwayInterval[], idx: number): { awayTime?: string; isAwayAbsent: boolean } {
  const rule = EXCEL_AWAY_PERIOD_RULES[idx];
  if (!rule) return { isAwayAbsent: false };

  let awayTime: string | undefined;
  let isAwayAbsent = false;
  for (const interval of intervals) {
    const overlaps = interval.startMin <= rule.end && interval.endMin > rule.boundary;
    if (!overlaps) continue;

    isAwayAbsent = true;
    if (interval.startMin >= rule.boundary && !awayTime) awayTime = interval.startTime;
  }

  return { awayTime, isAwayAbsent };
}

function effectiveMinForDate(todayStr: string, nowDateStr: string, nowMin: number): number {
  const cmp = todayStr.localeCompare(nowDateStr);
  return cmp === 0 ? nowMin : cmp < 0 ? 24 * 60 : 0;
}

// 휴가/반차 한 건이 가리는 시간대 종류.
// 시간대(slot)가 지정된 신청(개인사정 반차·병가)은 slot을 우선 적용하고,
// slot이 없으면 타입으로 판단한다. (휴식권/개인사정 휴가=하루 종일)
type LeaveBlockKind = 'fullday' | 'morning' | 'afternoon' | 'night';
function leaveBlockKind(leave: LeaveRequest): LeaveBlockKind | null {
  if (leave.slot === 'fullday' || leave.slot === 'morning' || leave.slot === 'afternoon' || leave.slot === 'night') {
    return leave.slot;
  }
  switch (leave.type) {
    case 'fullday':
    case 'sick':
    case 'personal_fullday':
      return 'fullday';
    case 'morning':
    case 'afternoon':
    case 'night':
      return leave.type;
    default:
      return null; // slot 없는 개인사정 반차 등 — 시간대 불명이면 미반영
  }
}

// 교시 idx(0~6: 1~7교시)가 해당 시간대에 포함되는지
function leaveKindCoversPeriod(kind: LeaveBlockKind | null, idx: number): boolean {
  switch (kind) {
    case 'fullday': return true;
    case 'morning': return idx < 2;            // 1~2교시
    case 'afternoon': return idx >= 2 && idx <= 4; // 3~5교시
    case 'night': return idx >= 5 && idx <= 6; // 6~7교시
    default: return false;
  }
}

// 해당 시간대 휴가일 때, 이 하원 시각이 승인된(미승인 아님) 것인지
function leaveKindAllowsCheckout(kind: LeaveBlockKind | null, checkOutMin: number): boolean {
  switch (kind) {
    case 'fullday': return true;
    case 'morning': return checkOutMin <= 12 * 60 + 30;
    case 'afternoon': return checkOutMin >= 12 * 60 + 30 && checkOutMin <= 17 * 60 + 40;
    case 'night': return checkOutMin >= 17 * 60 + 40;
    default: return false;
  }
}

function approvedLeavesOn(student: Student | null, today: string): LeaveRequest[] {
  return student
    ? (student.leaveRequests || []).filter((r) => r.date === today && r.status === 'approved')
    : [];
}

function isApprovedLeaveCheckout(student: Student | null, today: string, checkOutMin: number): boolean {
  if (!student) return false;
  return approvedLeavesOn(student, today)
    .some((leave) => leaveKindAllowsCheckout(leaveBlockKind(leave), checkOutMin));
}

function isApprovedAwayCheckout(
  intervals: AwayInterval[],
  checkOutMin: number,
  effectiveNow: number,
): boolean {
  return intervals.some((interval) => {
    if (checkOutMin < interval.startMin) return false;
    if (interval.endMin >= 24 * 60) return true;
    return checkOutMin < interval.endMin && effectiveNow <= interval.endMin;
  });
}

function isUnauthorizedCheckout(
  student: Student | null,
  isLeftToday: boolean,
  checkOutMin: number,
  today: string,
  nowDateStr: string,
  nowMin: number,
  awayIntervals: AwayInterval[],
): boolean {
  if (!student || !isLeftToday || checkOutMin < 0) return false;
  if (checkOutMin >= REGULAR_CHECKOUT_MIN) return false;
  if (isApprovedLeaveCheckout(student, today, checkOutMin)) return false;

  const effectiveNow = effectiveMinForDate(today, nowDateStr, nowMin);
  return !isApprovedAwayCheckout(awayIntervals, checkOutMin, effectiveNow);
}

// 교시 상태 (computed + 수동 override 여부)
interface PeriodState {
  status: PeriodStatus;
  isOverridden: boolean;
  awayTime?: string;       // 정기 외출 예정 시각 (HH:MM) → 셀 내부 표시
  checkInTime?: string;    // 실제 등원 시각 (HH:MM) → 등원한 교시 셀 내부
  checkOutTime?: string;   // 실제 하원 시각 (HH:MM) → 하원한 교시 셀 내부
  isAwayAbsent?: boolean;  // 외출 후 미복귀로 간주되는 교시 → X 표시
  isLeaveAbsent?: boolean; // 승인 휴가/반차로 빠지는 교시 → X 표시
  isCheckoutAbsent?: boolean; // 실제 하원 이후 비어 있어야 하는 교시 → X 표시
}

function isApprovedLeavePeriod(student: Student | null, todayStr: string, idx: number): boolean {
  return approvedLeavesOn(student, todayStr)
    .some((leave) => leaveKindCoversPeriod(leaveBlockKind(leave), idx));
}

function computePeriods(
  student: Student | null,
  sessions: StudySession[],
  todayStr: string,
  nowDateStr: string,
  nowMin: number,
): PeriodStatus[] {
  const cmp = todayStr.localeCompare(nowDateStr);

  // 출결판은 '수기 점검' 도구다. 등원(세션) 사실로 출석을 자동으로 채우지 않는다.
  // (등원만 찍고 이탈하는 경우를 잡으려고 직접 점검하므로 자동 출석 표시는 목적과 어긋남)
  // 기본은 공란으로 두고, 승인 휴가/반차·정기 외출처럼 '미리 안 오는' 사유만 X로 표시한다.
  return PERIODS.map((period, idx) => {
    if (isApprovedLeavePeriod(student, todayStr, idx)) return 'absent';
    if (cmp > 0 || (cmp === 0 && period.start >= nowMin)) return 'future';
    return 'absent';
  });
}

function hasApprovedLeaveToday(student: Student, today: string): boolean {
  return (student.leaveRequests || []).some(
    (r: LeaveRequest) => r.date === today && r.status === 'approved',
  );
}

function addDateDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(date);
}

function kstIsoFromHm(dateStr: string, hm: string): string {
  return new Date(`${dateStr}T${hm}:00+09:00`).toISOString();
}

function makeDemoStudent(
  id: string,
  name: string,
  seatNumber: number,
  today: string,
  extra: Partial<Student> = {},
): Student {
  const now = `${today}T00:00:00.000+09:00`;
  return {
    id,
    name,
    loginId: id,
    campus: 'wonju',
    manager: '샘플',
    contact: '출결판 검증',
    lifeComment: '',
    studentLifeComment: '',
    specialNote: '',
    createdAt: now,
    updatedAt: now,
    books: [],
    lectures: [],
    consultationLogs: [],
    grades: [],
    subjects: [],
    seatNumber,
    ...extra,
  };
}

function makeDemoSession(id: string, studentId: string, today: string, checkIn: string, checkOut?: string): StudySession {
  return {
    id,
    student_id: studentId,
    date: today,
    check_in: kstIsoFromHm(today, checkIn),
    check_out: checkOut ? kstIsoFromHm(today, checkOut) : null,
    minutes: null,
  };
}

function createDemoSeatBoardData(today: string): {
  students: Student[];
  sessions: StudySession[];
  periodOverrides: Map<string, PeriodStatus>;
  phoneNoSubmitMap: Map<string, Set<'D' | 'E' | 'N'>>;
} {
  const yesterday = addDateDays(today, -1);
  const threeDaysLater = addDateDays(today, 3);
  const nextMonth = addDateDays(today, 30);
  const nextWeek = addDateDays(today, 7);
  const now = `${today}T08:00:00.000+09:00`;
  const leaveBase = { createdAt: now, reviewedAt: now, source: 'admin' as const, status: 'approved' as const };

  const students: Student[] = [
    makeDemoStudent('demo-new', '신규정상', 1, today, {
      enrollmentEndDate: nextMonth,
      parentPhone: '01011112222',
      studentPhone: '01033334444',
      smsTargets: ['parent', 'student'],
      weeklyGradeCheck: true,
    }),
    makeDemoStudent('demo-expired-open', '만료등원', 2, today, {
      enrollmentEndDate: yesterday,
    }),
    makeDemoStudent('demo-expired-left', '만료미승인긴이름', 3, today, {
      enrollmentEndDate: yesterday,
    }),
    makeDemoStudent('demo-dday', '만료D데이', 4, today, {
      enrollmentEndDate: today,
    }),
    makeDemoStudent('demo-warning', '임박D3', 5, today, {
      enrollmentEndDate: threeDaysLater,
    }),
    makeDemoStudent('demo-away-return', '정기외출1430', 6, today, {
      enrollmentEndDate: nextMonth,
      awaySchedules: [{ awayTime: '14:30', days: [], until: 'forever' }],
    }),
    makeDemoStudent('demo-away-leave', '정기외출하원', 7, today, {
      enrollmentEndDate: nextMonth,
      awaySchedules: [{ awayTime: '18:30', days: [], until: 'forever' }],
    }),
    makeDemoStudent('demo-approved-half', '개인사정오후', 8, today, {
      enrollmentEndDate: nextMonth,
      leaveRequests: [{ id: 'leave-demo-approved-half', type: 'personal_halfday', slot: 'afternoon', date: today, reason: '샘플 개인사정 오후 반차', ...leaveBase }],
    }),
    makeDemoStudent('demo-unauthorized', '미승인조기하원', 9, today, {
      enrollmentEndDate: nextMonth,
    }),
    makeDemoStudent('demo-fullday', '휴가하루', 10, today, {
      enrollmentEndDate: nextWeek,
      leaveRequests: [{ id: 'leave-demo-fullday', type: 'fullday', date: today, reason: '샘플 휴무', ...leaveBase }],
    }),
  ];

  const sessions: StudySession[] = [
    makeDemoSession('sess-demo-expired-open', 'demo-expired-open', today, '09:02'),
    makeDemoSession('sess-demo-expired-left', 'demo-expired-left', today, '09:00', '14:10'),
    makeDemoSession('sess-demo-dday', 'demo-dday', today, '08:50'),
    makeDemoSession('sess-demo-warning', 'demo-warning', today, '09:12'),
    makeDemoSession('sess-demo-away-return', 'demo-away-return', today, '09:00'),
    makeDemoSession('sess-demo-away-leave', 'demo-away-leave', today, '09:00', '18:35'),
    makeDemoSession('sess-demo-approved-half', 'demo-approved-half', today, '09:00', '13:10'),
    makeDemoSession('sess-demo-unauthorized', 'demo-unauthorized', today, '09:00', '17:30'),
  ];

  // 수기 결석표시 예시 (기본은 공란, 클릭한 교시만 X)
  const periodOverrides = new Map<string, PeriodStatus>([
    ['demo-new:1', 'absent'],
  ]);
  const phoneNoSubmitMap = new Map<string, Set<'D' | 'E' | 'N'>>([
    ['demo-new', new Set(['D'])],
  ]);

  return { students, sessions, periodOverrides, phoneNoSubmitMap };
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
  status, label, isOverridden, awayTime, checkInTime, checkOutTime, isAwayAbsent, isLeaveAbsent, isCheckoutAbsent, onClick,
}: {
  status: PeriodStatus; label: string; isOverridden?: boolean;
  awayTime?: string; checkInTime?: string; checkOutTime?: string;
  isAwayAbsent?: boolean; isLeaveAbsent?: boolean; isCheckoutAbsent?: boolean; onClick?: () => void;
}) {
  const hoverCls = onClick ? 'cursor-pointer hover:brightness-95 active:scale-90 transition-all' : '';

  // 8교시 (심야 A 라벨)
  if (label === '8') {
    return (
      <div data-period-label={label} onClick={onClick} className={`w-[17px] h-[17px] border rounded-[3px] flex items-center justify-center ${hoverCls} ${isOverridden ? 'bg-amber-50 border-amber-300 text-amber-600' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
        <span className="text-[10px] font-bold leading-none">A</span>
      </div>
    );
  }

  // 수동 결석 override
  if (isOverridden && status === 'absent') {
    return (
      <div data-period-label={label} data-expected-absent="true" onClick={onClick} className={`w-[17px] h-[17px] border rounded-[3px] flex items-center justify-center ${hoverCls} bg-amber-50 border-amber-300`}>
        <span className="text-[10px] font-black leading-none text-amber-600">X</span>
      </div>
    );
  }

  // 승인 휴가/반차 결석 구간 — 미래 교시라도 X를 명시한다.
  if (isLeaveAbsent) {
    return (
      <div data-period-label={label} data-expected-absent="true" onClick={onClick} className={`w-[17px] h-[17px] border rounded-[3px] flex items-center justify-center ${hoverCls} bg-blue-50 border-blue-200`}>
        <span className="text-[10px] font-black leading-none text-blue-500">X</span>
      </div>
    );
  }

  // 정기외출/빠지는 시간대 — 겹치는 교시는 세션 유무/미래 여부와 무관하게 X 표시한다.
  // 단, 외출이 '시작'하는 교시에는 X 대신 외출 시각을 적어 둔다(엑셀 출결판처럼).
  if (isAwayAbsent) {
    return (
      <div
        data-period-label={label}
        data-expected-absent="true"
        data-away-time={awayTime}
        title={awayTime ? `정기 외출 ${awayTime}` : undefined}
        onClick={onClick}
        className={`w-[17px] h-[17px] border border-slate-300 rounded-[3px] bg-slate-50 flex items-center justify-center ${hoverCls}`}
      >
        {awayTime?.includes(':')
          ? <TimeHM hm={awayTime} cls="text-amber-500" />
          : <span className="text-[10px] font-black leading-none text-slate-500">X</span>}
      </div>
    );
  }

  // 실제 하원 이후 교시 — 아직 미래 시간이어도 사람이 없어야 하므로 X를 명시한다.
  if (isCheckoutAbsent) {
    return (
      <div data-period-label={label} data-expected-absent="true" onClick={onClick} className={`w-[17px] h-[17px] border border-red-200 rounded-[3px] bg-red-50 flex items-center justify-center ${hoverCls}`}>
        <span className="text-[10px] font-black leading-none text-red-500">X</span>
      </div>
    );
  }

  // 정기 외출 시작 시각은 미래 교시라도 엑셀처럼 즉시 표시한다.
  if (awayTime?.includes(':')) {
    return (
      <div data-period-label={label} data-away-time={awayTime} onClick={onClick} className={`w-[17px] h-[17px] border rounded-[3px] flex items-center justify-center ${hoverCls} bg-[#1D1D1F]/[0.06] border-[#1D1D1F]/[0.12]`}>
        <TimeHM hm={awayTime} cls="text-amber-500" />
      </div>
    );
  }

  // 미래 교시
  if (status === 'future') {
    return (
      <div data-period-label={label} onClick={onClick} className={`w-[17px] h-[17px] border border-slate-200 rounded-[3px] bg-white flex items-center justify-center ${hoverCls}`}>
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
      <div data-period-label={label} onClick={onClick} className={`w-[17px] h-[17px] border rounded-[3px] flex items-center justify-center ${hoverCls} ${isOverridden ? 'bg-amber-50 border-amber-300' : 'bg-[#1D1D1F]/[0.06] border-[#1D1D1F]/[0.12]'}`}>
        {inner}
      </div>
    );
  }

  // 결석 — 일반 (교시 번호 흐리게)
  return (
    <div data-period-label={label} onClick={onClick} className={`w-[17px] h-[17px] border border-slate-200 rounded-[3px] bg-white flex items-center justify-center ${hoverCls}`}>
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
  isUnauthorizedCheckout: boolean;
  todayStr: string;
  onTogglePeriod?: (periodIdx: number) => void;
  onClick?: () => void;
  onNameClick?: () => void;
}

function SeatCard({ seatNum, student, periods, isOnLeave, isCheckedIn, isLeftToday, isUnauthorizedCheckout, todayStr, onTogglePeriod, onClick, onNameClick, phoneNoSubmit, onTogglePhone }: SeatCardProps) {
  if (!student) {
    return (
      <div data-seat-card="empty" data-seat-num={seatNum} className="w-[80px] h-[100px] rounded-lg border border-dashed border-slate-200 bg-slate-50/40 p-1.5 flex flex-col shrink-0">
        <span className="text-[9px] font-black text-slate-300">{seatNum}</span>
      </div>
    );
  }

  const dday = getEnrollmentDDay(student.enrollmentEndDate, todayStr);
  const attendanceBadge = (() => {
    if (isUnauthorizedCheckout) {
      return {
        label: '미승인',
        title: '미승인 조기 하원',
        className: 'text-red-600 bg-red-50 border-red-200',
      };
    }
    if (isOnLeave) {
      return {
        label: '휴가',
        title: '승인된 휴가',
        className: 'text-blue-500 bg-blue-100 border-blue-100',
      };
    }
    if (isLeftToday) {
      return {
        label: '하원',
        title: '하원 완료',
        className: 'text-slate-500 bg-slate-100 border-slate-100',
      };
    }
    if (!isCheckedIn) {
      return {
        label: '미등원',
        title: '미등원',
        className: 'text-red-500 bg-red-50 border-red-100',
      };
    }
    return null;
  })();
  const enrollmentBadge = (() => {
    if (dday.status === 'expired') {
      return {
        label: '만료',
        title: '등록 기간 만료',
        className: 'text-red-600 bg-red-50 border-red-200',
      };
    }
    if (dday.status === 'warning') {
      return {
        label: dday.daysLeft === 0 ? 'D0' : `D-${dday.daysLeft}`,
        title: dday.daysLeft === 0 ? '등록 만료 D-Day' : `등록 만료 D-${dday.daysLeft}`,
        className: 'text-amber-600 bg-amber-50 border-amber-200',
      };
    }
    return null;
  })();

  const ring = isCheckedIn
    ? 'border-emerald-300 ring-1 ring-emerald-200'
    : isUnauthorizedCheckout
    ? 'border-red-300 ring-1 ring-red-200'
    : isOnLeave
    ? 'border-blue-200'
    : isLeftToday
    ? 'border-slate-300'
    : 'border-slate-200/80';
  const bg = isCheckedIn 
    ? 'bg-emerald-50/60' 
    : isUnauthorizedCheckout
    ? 'bg-red-50/70'
    : isOnLeave 
    ? 'bg-blue-50/60' 
    : isLeftToday 
    ? 'bg-slate-50/80' 
    : 'bg-white';

  return (
    <div
      onClick={onClick}
      data-seat-card="occupied"
      data-seat-num={seatNum}
      data-student-id={student.id}
      data-student-name={student.name}
      data-enrollment-status={dday.status}
      data-unauthorized-checkout={isUnauthorizedCheckout ? 'true' : 'false'}
      className={`w-[80px] h-[100px] overflow-hidden rounded-lg border ${ring} ${bg} p-1.5 shadow-sm flex flex-col shrink-0 cursor-pointer hover:border-slate-400 active:scale-[0.98] transition-all`}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="text-[9px] font-black text-slate-400">{seatNum}</span>
        <div className="flex min-w-0 shrink-0 justify-end gap-[2px]">
          {[attendanceBadge, enrollmentBadge].filter(Boolean).map((badge) => (
            <span
              key={badge!.title}
              title={badge!.title}
              className={`text-[7px] font-black border px-[3px] py-0.5 rounded-[3px] leading-none shrink-0 ${badge!.className}`}
            >
              {badge!.label}
            </span>
          ))}
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
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isUnauthorizedCheckout ? 'bg-red-500' : 'bg-[#0071E3]'}`} />
          )}
        </div>
      </div>

      {/* 휴대폰 보관 상태 박스 (D/E/N) — 클릭으로 미제출 토글 */}
      <div className="flex gap-[3px] mt-0.5" onClick={(e) => e.stopPropagation()}>
        {(['D', 'E', 'N'] as const).map((label) => {
          // 휴대폰 제출 여부는 출결과 별개. 기본은 제출(라벨 표시),
          // 관리자가 클릭해 미제출로 표시한 블록만 x.
          const manualNoSubmit = phoneNoSubmit?.has(label) ?? false;
          const showX = manualNoSubmit;
          return (
            <div
              key={label}
              onClick={onTogglePhone ? () => onTogglePhone(label) : undefined}
              title={manualNoSubmit ? `${label} 미제출 (클릭해 해제)` : `${label} 미제출 표시`}
              className={`flex-1 h-[10px] rounded-[2px] flex items-center justify-center border transition-all ${
                onTogglePhone ? 'cursor-pointer active:scale-90' : ''
              } ${
                showX
                  ? 'bg-red-50 border-red-200'
                  : 'bg-[#0071E3]/[0.06] border-[#0071E3]/20'
              }`}
            >
              <span className={`text-[6px] font-black leading-none ${
                showX ? 'text-red-400' : 'text-[#0071E3]/60'
              }`}>
                {showX ? 'x' : label}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-[3px] mt-[3px]" onClick={(e) => e.stopPropagation()}>
        <div className="flex gap-[3px]">
          {periods.slice(0, 4).map(({ status, isOverridden, awayTime, checkInTime, checkOutTime, isAwayAbsent, isLeaveAbsent, isCheckoutAbsent }, i) => (
            <PeriodCell
              key={i}
              status={status}
              label={String(i + 1)}
              isOverridden={isOverridden}
              awayTime={awayTime}
              checkInTime={checkInTime}
              checkOutTime={checkOutTime}
              isAwayAbsent={isAwayAbsent}
              isLeaveAbsent={isLeaveAbsent}
              isCheckoutAbsent={isCheckoutAbsent}
              onClick={onTogglePeriod ? () => onTogglePeriod(i) : undefined}
            />
          ))}
        </div>
        <div className="flex gap-[3px]">
          {periods.slice(4).map(({ status, isOverridden, awayTime, checkInTime, checkOutTime, isAwayAbsent, isLeaveAbsent, isCheckoutAbsent }, i) => (
            <PeriodCell
              key={i + 4}
              status={status}
              label={String(i + 5)}
              isOverridden={isOverridden}
              awayTime={awayTime}
              checkInTime={checkInTime}
              checkOutTime={checkOutTime}
              isAwayAbsent={isAwayAbsent}
              isLeaveAbsent={isLeaveAbsent}
              isCheckoutAbsent={isCheckoutAbsent}
              onClick={onTogglePeriod ? () => onTogglePeriod(i + 4) : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── 행 렌더 ───────────────────────────────────────────────────────────────────

const EMPTY_PHONE_NO_SUBMIT_MAP = new Map<string, Set<'D' | 'E' | 'N'>>();

interface RowProps {
  seats: Cell[];
  seatMap: Map<number, Student>;
  sessionMap: Map<string, StudySession[]>;
  openIds: Set<string>;
  today: string;
  nowDateStr: string;
  nowMin: number;
  periodOverrides: Map<string, PeriodStatus>;
  phoneNoSubmitMap?: Map<string, Set<'D' | 'E' | 'N'>>;
  onTogglePeriod: (key: string) => void;
  onTogglePhone: (studentId: string, block: 'D' | 'E' | 'N') => void;
  onCardClick: (student: Student) => void;
  onNameClick: (student: Student) => void;
}

function SeatRow({ seats, seatMap, sessionMap, openIds, today, nowDateStr, nowMin, periodOverrides, phoneNoSubmitMap, onTogglePeriod, onTogglePhone, onCardClick, onNameClick }: RowProps) {
  const safePhoneNoSubmitMap = phoneNoSubmitMap ?? EMPTY_PHONE_NO_SUBMIT_MAP;
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

        // ── 정기 외출/결석 구간 (엑셀 출결판 수식 기준) ─────────────────────
        const todayDow = new Date(today + 'T00:00:00').getDay();
        const awayIntervals = getApplicableAwayIntervals(student, today, todayDow);

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
        const isUnauthorizedCheckoutToday = isUnauthorizedCheckout(
          student,
          isLeftToday,
          lastCheckOutMin,
          today,
          nowDateStr,
          nowMin,
          awayIntervals,
        );

        const periods: PeriodState[] = raw.map((s, idx) => {
          const key = student ? `${student.id}:${idx}` : '';
          const override = student ? periodOverrides.get(key) : undefined;

          const awayMark = getAwayPeriodMark(awayIntervals, idx);
          const leaveAbsent = idx < 7 && isApprovedLeavePeriod(student, today, idx);
          const checkoutAbsent = idx < 7 && isLeftToday && lastCheckOutMin >= 0 && lastCheckOutMin < PERIODS[idx].start;

          return {
            status: override ?? s,
            isOverridden: override !== undefined,
            awayTime: awayMark.awayTime,
            checkInTime: idx === checkInPeriodIdx ? checkInTimeStr : undefined,
            checkOutTime: idx === checkOutPeriodIdx ? checkOutTimeStr : undefined,
            isAwayAbsent: awayMark.isAwayAbsent,
            isLeaveAbsent: leaveAbsent,
            isCheckoutAbsent: checkoutAbsent,
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
            isUnauthorizedCheckout={isUnauthorizedCheckoutToday}
            todayStr={today}
            onTogglePeriod={
              student
                ? (idx) => onTogglePeriod(`${student.id}:${idx}`)
                : undefined
            }
            onClick={student ? () => onCardClick(student) : undefined}
            onNameClick={student ? () => onNameClick(student) : undefined}
            phoneNoSubmit={student ? safePhoneNoSubmitMap.get(student.id) : undefined}
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


  const kstToday = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
  const [selectedDate, setSelectedDate] = useState(kstToday);
  const today = selectedDate;
  const isSelectedToday = selectedDate === kstToday;
  const isDemoMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo') === '1';
  const demoSeatBoardData = useMemo(() => createDemoSeatBoardData(today), [today]);

  function handleCampusChange(c: CampusKey) {
    setCampus(c);
    setPageIdx(0);
  }

  // 교시 클릭 → 상태 토글 (absent ↔ present)
  // 좌석보드는 과거/미래 날짜를 조회할 수 있으나, 수동 출결/좌석상태 수정은 오늘(KST)에만 허용한다.
  // (date 입력으로 과거 날짜를 보던 중 저장/초기화하면 그 과거 날짜의 기록을 덮어쓰는 사고 방지)
  function ensureEditableToday(): boolean {
    if (!isSelectedToday) {
      toast.error('지난/예정 날짜는 조회만 가능합니다. 수정은 오늘 날짜에서만 할 수 있어요.');
      return false;
    }
    return true;
  }

  async function handleTogglePeriod(key: string) {
    if (!isDemoMode && !ensureEditableToday()) return;
    const parts = key.split(':');
    const studentId = parts[0];
    const periodIdx = parseInt(parts[parts.length - 1], 10);
    const is8th = periodIdx === 7;

    if (isDemoMode) {
      setPeriodOverrides((previous) => {
        const next = new Map(previous);
        if (is8th) {
          // 심야(A) = 1~7교시 전체 결석 일괄 표시/해제 단축
          const allMarked = Array.from({ length: 7 }).every((_, i) => previous.get(`${studentId}:${i}`) === 'absent');
          for (let i = 0; i < 8; i++) {
            if (allMarked) next.delete(`${studentId}:${i}`); else next.set(`${studentId}:${i}`, 'absent');
          }
          return next;
        }
        // 공란(기본) ↔ X(결석 수기표시) 토글. 다시 누르면 공란으로 되돌린다.
        if (next.get(key) === 'absent') next.delete(key); else next.set(key, 'absent');
        return next;
      });
      return;
    }

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

    // 공란(기본) ↔ X(결석 수기표시) 토글. 표시한 셀을 다시 누르면 공란으로 되돌린다.
    const isMarked = periodOverrides.get(key) === 'absent';
    const previous = new Map(periodOverrides);
    const next = new Map(previous);
    if (isMarked) next.delete(key); else next.set(key, 'absent');
    setPeriodOverrides(next);

    try {
      if (isMarked) {
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
          body: JSON.stringify({ date: today, seatKey: key, status: 'absent' }),
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
    if (!isDemoMode && !ensureEditableToday()) return;
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

    if (isDemoMode) return;

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
    if (!isDemoMode && !ensureEditableToday()) return;
    if (isDemoMode) {
      setPeriodOverrides(new Map(demoSeatBoardData.periodOverrides));
      setPhoneNoSubmitMap(new Map(demoSeatBoardData.phoneNoSubmitMap));
      return;
    }

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

  // silent=true 면 로딩 스피너(보드 전체 blank)를 띄우지 않고 데이터만 조용히 갱신한다.
  // 수동 출결/휴무 저장 직후 보드 전체가 깜빡이는 것을 막기 위함.
  const loadData = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    if (!silent) setLoading(true);
    if (isDemoMode) {
      setCampus('wonju');
      setPageIdx(0);
      setStudents(demoSeatBoardData.students);
      setSessions(demoSeatBoardData.sessions);
      setPeriodOverrides(new Map(demoSeatBoardData.periodOverrides));
      setPhoneNoSubmitMap(new Map(demoSeatBoardData.phoneNoSubmitMap));
      if (!silent) setLoading(false);
      return;
    }

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
            } else if (value === 'absent') {
              // 출결판은 결석(X) 수기표시만 저장한다. (과거 'present' override는 공란으로 무시)
              next.set(key, 'absent');
            }
          }
          setPeriodOverrides(next);
          setPhoneNoSubmitMap(phoneNext);
        }
      }
    } catch {
      toast.error('데이터를 불러오지 못했습니다.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [today, isDemoMode, demoSeatBoardData]);

  useEffect(() => {
    async function verifyAuth() {
      if (isDemoMode) {
        await loadData();
        setCheckingAuth(false);
        return;
      }

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
  }, [router, loadData, isDemoMode]);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (isDemoMode) return;

    timerRef.current = setInterval(() => {
      fetch(`/api/admin/seat-board?date=${today}`, { credentials: 'same-origin' })
        .then((r) => r.json())
        .then((j) => { if (j.success) setSessions(j.sessions || []); })
        .catch(() => {});
    }, 60_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [today, isDemoMode]);

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

  // 교시별 출석 확인 시, 자리에 없는(=수동 X 표시) 학생을 모아 학생 페이지 알림을 발송한다.
  // 승인된 휴가/반차, 정기 외출로 빠지는 학생은 자동 제외한다.
  async function notifyAbsentForPeriod(periodIdx: number) {
    if (!ensureEditableToday()) return;
    const todayDow = new Date(today + 'T00:00:00').getDay();
    const targets = campusStudents.filter((s) => {
      if (periodOverrides.get(`${s.id}:${periodIdx}`) !== 'absent') return false; // 관리자가 X로 표시
      if (isApprovedLeavePeriod(s, today, periodIdx)) return false;                // 승인 휴가/반차 제외
      const awayMark = getAwayPeriodMark(getApplicableAwayIntervals(s, today, todayDow), periodIdx);
      if (awayMark.isAwayAbsent) return false;                                     // 정기 외출 제외
      return true;
    });
    const label = PERIODS[periodIdx]?.label ?? String(periodIdx + 1);
    if (targets.length === 0) {
      toast.info(`${label}교시 미착석으로 표시된 학생이 없습니다. (휴가·외출 제외)`);
      return;
    }
    const names = targets.map((s) => s.name).join(', ');
    if (!confirm(`${label}교시 출석체크 시 ${names} 님이 자리에 없습니다.\n학생에게 알림을 발송하시겠습니까?`)) return;
    try {
      const res = await fetch('/api/admin/seat-board/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ studentIds: targets.map((s) => s.id), period: periodIdx, periodLabel: label, date: today }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.message || '발송 실패');
      toast.success(`${label}교시 미착석 알림을 ${json.notifiedCount}명에게 발송했습니다.`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : '알림 발송에 실패했습니다.');
    }
  }

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
    <div className="ios-app-bg min-h-screen text-[#1D1D1F]">
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
            onClick={() => loadData()}
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

          <div className="min-w-[220px] rounded-2xl border border-black/[0.05] bg-white px-3 py-2 shadow-sm">
            <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              <CalendarDays className="h-3.5 w-3.5 text-[#0071E3]" />
              출결 기준일
            </p>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value || kstToday)}
                className="h-8 rounded-xl border-black/[0.06] bg-[#F5F5F7] px-2 text-xs font-semibold text-[#1D1D1F]"
              />
              {!isSelectedToday && (
                <button
                  type="button"
                  onClick={() => setSelectedDate(kstToday)}
                  className="h-8 shrink-0 rounded-full bg-[#0071E3]/10 px-3 text-[11px] font-semibold text-[#0071E3] transition hover:bg-[#0071E3]/15 active:scale-[0.97]"
                >
                  오늘
                </button>
              )}
            </div>
          </div>

          {isDemoMode && (
            <div className="rounded-xl border border-[#0071E3]/20 bg-[#0071E3]/[0.06] px-3 py-1.5">
              <p className="text-[10px] font-black text-[#0071E3]">샘플 검증 모드</p>
            </div>
          )}

          <div className="flex gap-4 ml-auto sm:ml-0">
            {[
              { label: '등원중', val: stats.present,                               color: 'text-emerald-600' },
              { label: '미등원', val: stats.total - stats.present - stats.onLeave, color: 'text-slate-500' },
              { label: '휴가',   val: stats.onLeave,                               color: 'text-blue-500' },
            ].map(({ label, val, color }) => (
              <div key={label} className="text-center">
                <p className={`text-[18px] font-semibold tracking-tight leading-none ${color}`}>{val}</p>
                <p className="text-[10px] font-bold text-slate-400 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── 교시별 미착석 알림 ── */}
        <div className="flex items-center gap-2 mb-4 flex-wrap rounded-2xl border border-black/[0.05] bg-white px-3 py-2 shadow-sm">
          <span className="shrink-0 text-[11px] font-bold text-slate-500">교시별 미착석 알림</span>
          {PERIODS.slice(0, 7).map((p, idx) => (
            <button
              key={idx}
              type="button"
              disabled={!isSelectedToday}
              onClick={() => notifyAbsentForPeriod(idx)}
              className="h-7 min-w-[28px] rounded-lg border border-black/[0.06] bg-[#F5F5F7] px-2 text-[11px] font-bold text-[#1D1D1F] transition hover:bg-[#0071E3]/10 hover:text-[#0071E3] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {p.label}
            </button>
          ))}
          <span className="ml-1 text-[11px] text-slate-400">교시 셀을 X로 표시한 학생에게 발송 (휴가·외출 자동 제외)</span>
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
            <div className="w-[17px] h-[17px] bg-white border border-slate-200 rounded-[3px] flex items-center justify-center">
              <span className="text-[7px] font-bold text-slate-300">3</span>
            </div>
            <span className="text-[11px] font-bold text-slate-500">공란(점검 전·교시번호)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-[17px] h-[17px] bg-amber-50 border border-amber-300 rounded-[3px] flex items-center justify-center">
              <span className="text-[10px] font-black text-amber-600">X</span>
            </div>
            <span className="text-[11px] font-bold text-slate-500">수기 결석표시(클릭)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-[17px] h-[17px] bg-blue-50 border border-blue-200 rounded-[3px] flex items-center justify-center">
              <span className="text-[10px] font-black text-blue-500">X</span>
            </div>
            <span className="text-[11px] font-bold text-slate-500">승인 휴가·반차</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-[17px] h-[17px] bg-slate-50 border border-slate-300 rounded-[3px] flex items-center justify-center">
              <span className="text-[10px] font-black text-slate-500">X</span>
            </div>
            <span className="text-[11px] font-bold text-slate-500">정기 외출</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
            <span className="text-[11px] font-bold text-slate-500">현재 등원중</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
            <span className="text-[11px] font-bold text-slate-500">미승인 조기 하원</span>
          </div>
          <span className="text-[10px] text-slate-400">
            1(09~10:50) · 2(11:10~12:30) · 3(13:50~15) · 4(15:10~16:20) · 5(16:30~17:40) · 6(18:50~20:20) · 7(20:30~22) · 심야(22:10~23:20)
          </span>
          <span className="text-[10px] text-slate-400">· 기본은 공란 — 자리에 없으면 해당 교시 셀을 눌러 X로 근거를 남기세요 · 60초마다 자동 갱신</span>
        </div>

      </main>
    </div>
  );
}
