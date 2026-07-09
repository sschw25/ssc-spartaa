// 휴가/반차/휴식권/병가 신청 — 단일 진실 소스 (라벨/교시/월 한도/쿠폰 규칙)
// 학생 신청 화면(report)·신청 API·관리자 수집 페이지(/admin/leave)가 모두 이 모듈을 사용.
import type { LeaveRequest, LeaveType, RewardRedemption } from './types/student';

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

// ── 사진 증빙 규칙 ──
// 병가·개인사정(반차/휴식)은 신청 후 24시간 내 사진 증빙을 첨부할 수 있다.
// 관리자가 확인(승인/반려)하면 증빙 사진은 즉시 삭제된다.
export const PROOF_LEAVE_TYPES: LeaveType[] = ['sick', 'personal_halfday', 'personal_fullday'];
export const PROOF_WINDOW_HOURS = 24;

export function leaveNeedsProof(type?: string): boolean {
  return isLeaveType(type) && PROOF_LEAVE_TYPES.includes(type);
}

// 증빙 첨부 마감(신청 시각 + 24h) ISO. createdAt 불량이면 null.
export function proofDeadlineIso(createdAt?: string): string | null {
  if (!createdAt) return null;
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return null;
  return new Date(t + PROOF_WINDOW_HOURS * 3600_000).toISOString();
}

// 지금(now) 기준 증빙 첨부 가능 여부 — 24시간 창이 아직 열려 있는가.
export function isProofWindowOpen(createdAt: string | undefined, nowMs: number): boolean {
  const deadline = proofDeadlineIso(createdAt);
  if (!deadline) return false;
  return nowMs <= new Date(deadline).getTime();
}

// 시간대(교시) 선택 — 개인사정 반차(오전/오후/야간), 병가(오전/오후/야간/하루종일)
export type LeaveSlot = 'morning' | 'afternoon' | 'night' | 'fullday';
export const LEAVE_SLOT_LABELS: Record<LeaveSlot, string> = {
  morning: '오전 (1~2교시)',
  afternoon: '오후 (3~5교시)',
  night: '야간 (6~7교시)',
  fullday: '하루 종일',
};
// 종류별 허용 시간대. 키가 있는 종류만 시간대 선택을 요구한다.
export const LEAVE_SLOT_OPTIONS: Partial<Record<LeaveType, LeaveSlot[]>> = {
  personal_halfday: ['morning', 'afternoon', 'night'],
  sick: ['morning', 'afternoon', 'night', 'fullday'],
};
export function leaveNeedsSlot(type: LeaveType): boolean {
  return !!LEAVE_SLOT_OPTIONS[type];
}
export function isValidSlotFor(type: LeaveType, slot: unknown): slot is LeaveSlot {
  const opts = LEAVE_SLOT_OPTIONS[type];
  return !!opts && typeof slot === 'string' && (opts as string[]).includes(slot);
}
export function getLeaveSlotLabel(slot?: string): string {
  return slot && slot in LEAVE_SLOT_LABELS ? LEAVE_SLOT_LABELS[slot as LeaveSlot] : '';
}
// 표시용 통합 라벨: "병가 · 오전 (1~2교시)"
export function formatLeaveLabel(type?: string, slot?: string): string {
  const base = getLeaveTypeLabel(type);
  const s = getLeaveSlotLabel(slot);
  return s ? `${base} · ${s}` : base;
}

// 월 한도: 반차 2개 / 휴식권 1개. 병가는 한도 미차감(영수증 증빙으로 별도 처리).
export const MONTHLY_HALFDAY_QUOTA = 2;
export const MONTHLY_FULLDAY_QUOTA = 1;
// 반차 1회 추가 신청에 필요한 쿠폰 수 (반차권 교환가와 동일하게 유지)
export const COUPONS_PER_EXTRA_HALFDAY = 5;

// 쿠폰 리워드 교환 카탈로그 (5장=반차권, 10장=휴식권, 20장=상품권, 10장=플래너)
import type { RewardType } from '@/lib/types/student';
export const REWARD_CATALOG: { type: RewardType; label: string; cost: number; physical: boolean }[] = [
  { type: 'halfday', label: '반차권', cost: 5, physical: false },
  { type: 'restpass', label: '휴식권', cost: 10, physical: false },
  { type: 'voucher', label: '상품권', cost: 20, physical: true },
  { type: 'planner', label: '플래너', cost: 10, physical: true },
];

export function getRewardMeta(type: RewardType) {
  return REWARD_CATALOG.find((r) => r.type === type);
}

export function getRewardLabel(type: RewardType): string {
  return getRewardMeta(type)?.label ?? type;
}

// KST 기준 오늘 날짜 'YYYY-MM-DD'
export function kstToday(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

// KST 기준 해당 날짜의 'YYYY-MM' (월 한도 집계 키)
export function kstYearMonth(d: Date = new Date()): string {
  return kstToday(d).slice(0, 7);
}

// 자동 승인된 반차 여부 — 신규 autoApproved 플래그 + 구버전 adminReply 텍스트 폴백.
// (이 플래그가 생기기 전 자동 승인된 기존 신청도 '자동 승인'으로 표시되도록 한다.)
export function isAutoApprovedLeave(r: {
  status: string;
  autoApproved?: boolean;
  adminReply?: string;
}): boolean {
  return (
    r.status === 'approved' &&
    (r.autoApproved === true || (!!r.adminReply && r.adminReply.includes('자동 승인')))
  );
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
// 쿠폰 교환 추가권을 소모한 신청(usedCredit)은 기본 월한도와 별도이므로 제외한다.
export function getMonthlyLeaveUsage(
  requests: LeaveRequest[] | undefined,
  yearMonth: string
): LeaveUsage {
  const usage: LeaveUsage = { halfday: 0, fullday: 0, sick: 0 };
  for (const r of requests || []) {
    if (r.status === 'rejected') continue;
    if (r.usedCredit) continue; // 추가권 사용분은 기본 한도에서 제외
    if (yearMonthOf(r.date) !== yearMonth) continue;
    const cat = LEAVE_TYPES[r.type]?.category;
    if (cat === 'halfday') usage.halfday += 1;
    else if (cat === 'fullday') usage.fullday += 1;
    else if (cat === 'sick') usage.sick += 1;
  }
  return usage;
}

// 쿠폰 교환으로 받은 '추가권' 잔여 (반차권/휴식권). 교환완료(fulfilled) 수에서 소모분을 차감.
// 추가 컬럼 없이 rewardRedemptions + leaveRequests에서 파생 — 반려 시 소모분이 빠져 자동 복구된다.
export interface LeaveCredits { halfday: number; fullday: number; }
export function getLeaveCredits(
  redemptions: RewardRedemption[] | undefined,
  requests: LeaveRequest[] | undefined,
): LeaveCredits {
  const earnedHalf = (redemptions || []).filter((r) => r.type === 'halfday' && r.status === 'fulfilled').length;
  const earnedFull = (redemptions || []).filter((r) => r.type === 'restpass' && r.status === 'fulfilled').length;
  let usedHalf = 0;
  let usedFull = 0;
  for (const r of requests || []) {
    if (!r.usedCredit || r.status === 'rejected') continue;
    const cat = LEAVE_TYPES[r.type]?.category;
    if (cat === 'halfday') usedHalf += 1;
    else if (cat === 'fullday') usedFull += 1;
  }
  return { halfday: Math.max(0, earnedHalf - usedHalf), fullday: Math.max(0, earnedFull - usedFull) };
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
