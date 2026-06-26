// 휴가/반차/휴식권/병가 신청 — 단일 진실 소스 (라벨/교시/월 한도/쿠폰 규칙)
// 학생 신청 화면(report)·신청 API·관리자 수집 페이지(/admin/leave)가 모두 이 모듈을 사용.
import type { LeaveRequest, LeaveType } from './types/student';

export type LeaveCategory = 'halfday' | 'fullday' | 'sick' | 'personal_halfday' | 'personal_fullday';

export const LEAVE_TYPES: Record<
  LeaveType,
  { label: string; slot: string; category: LeaveCategory; icon: string }
> = {
  morning: { label: '오전반차', slot: '1~2교시', category: 'halfday', icon: '🌅' },
  afternoon: { label: '오후반차', slot: '3~5교시', category: 'halfday', icon: '🌤️' },
  night: { label: '야간반차', slot: '6~7교시', category: 'halfday', icon: '🌙' },
  fullday: { label: '휴식권', slot: '하루 종일', category: 'fullday', icon: '🛌' },
  personal_halfday: { label: '개인사정(반차)', slot: '1~7교시 중 선택', category: 'personal_halfday', icon: '👤' },
  personal_fullday: { label: '개인사정(휴가)', slot: '하루 종일', category: 'personal_fullday', icon: '👤' },
  sick: { label: '병가', slot: '영수증 증빙 필요', category: 'sick', icon: '🤒' },
};

export const LEAVE_TYPE_ORDER: LeaveType[] = ['morning', 'afternoon', 'night', 'fullday', 'personal_halfday', 'personal_fullday', 'sick'];

export function isLeaveType(v: unknown): v is LeaveType {
  return typeof v === 'string' && v in LEAVE_TYPES;
}

export function getLeaveTypeLabel(type?: string): string {
  return (isLeaveType(type) && LEAVE_TYPES[type].label) || '휴가';
}

// 월 한도: 반차 2개 / 휴식권 1개. 병가는 한도 미차감(영수증 증빙으로 별도 처리).
export const MONTHLY_HALFDAY_QUOTA = 2;
export const MONTHLY_FULLDAY_QUOTA = 1;
// 반차 1회 추가 신청에 필요한 쿠폰 수
export const COUPONS_PER_EXTRA_HALFDAY = 3;

// KST 기준 해당 날짜의 'YYYY-MM' (월 한도 집계 키)
export function kstYearMonth(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(d)
    .slice(0, 7);
}

export function yearMonthOf(ymd: string): string {
  return (ymd || '').slice(0, 7);
}

export interface LeaveUsage {
  halfday: number;
  fullday: number;
  sick: number;
}

// 특정 월(YYYY-MM)의 사용량 집계. 반려(rejected) 건은 제외, 대기/승인은 한도에 포함.
export function getMonthlyLeaveUsage(
  requests: LeaveRequest[] | undefined,
  yearMonth: string
): LeaveUsage {
  const usage: LeaveUsage = { halfday: 0, fullday: 0, sick: 0 };
  for (const r of requests || []) {
    if (r.status === 'rejected') continue;
    if (yearMonthOf(r.date) !== yearMonth) continue;
    const cat = LEAVE_TYPES[r.type]?.category;
    if (cat === 'halfday') usage.halfday += 1;
    else if (cat === 'fullday') usage.fullday += 1;
    else if (cat === 'sick') usage.sick += 1;
  }
  return usage;
}

// 해당 신청이 기본 월 한도를 초과하는지 (초과 시 쿠폰/밴드채팅 안내 대상).
// 병가는 한도와 무관하므로 항상 false.
export function exceedsMonthlyQuota(
  type: LeaveType,
  usage: LeaveUsage
): boolean {
  const cat = LEAVE_TYPES[type]?.category;
  if (cat === 'halfday') return usage.halfday >= MONTHLY_HALFDAY_QUOTA;
  if (cat === 'fullday') return usage.fullday >= MONTHLY_FULLDAY_QUOTA;
  return false;
}
