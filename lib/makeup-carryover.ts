// 보강 이월(carryover) — 휴가 보강을 다음 주로 이월하는 오버레이의 단일 소스.
// 계획을 파괴적으로 재작성하지 않고, carryover 기록을 pace 계산에 겹쳐 반영한다.
import type { MakeupCarryover } from '@/lib/types/student';
import { LEAVE_TYPES, getLeaveTypeLabel } from '@/lib/leave';

// 이월 1건당 소모 쿠폰(별도 이월권 가격).
export const CARRYOVER_COUPON_COST = 3;

// 주(week) 키 = 그 날짜가 속한 주의 월요일(YYYY-MM-DD). 날짜 문자열은 KST 캘린더 기준으로 취급.
export function weekKeyOf(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1); // 로컬 자정
  const dow = dt.getDay(); // 0=일 .. 6=토
  const diffToMon = dow === 0 ? -6 : 1 - dow;
  dt.setDate(dt.getDate() + diffToMon);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export function nextWeekKey(weekKey: string): string {
  const [y, m, d] = weekKey.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + 7);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

// 이월 가능 휴가 타입? 반차(halfday)·휴식권(fullday) 계열만. 병가·개인사정은 불가.
export function canCarryLeaveType(type: string): boolean {
  const cat = LEAVE_TYPES[type as keyof typeof LEAVE_TYPES]?.category;
  return cat === 'halfday' || cat === 'fullday';
}

// 특정 자료·주의 순 이월(나간/들어온). 이번 주 window 기준으로 pace 오버레이에 사용.
export function getCarryoverNet(
  carryovers: MakeupCarryover[] | undefined,
  materialId: string,
  weekKey: string,
): { out: number; in: number } {
  let out = 0;
  let incoming = 0;
  for (const c of carryovers || []) {
    if (c.materialId !== materialId) continue;
    if (c.weekKey === weekKey) out += c.amount;
    if (c.nextWeekKey === weekKey) incoming += c.amount;
  }
  return { out, in: incoming };
}

// 이번 주에 이미 이월을 썼는지(주당 1회 캡).
export function hasCarryoverInWeek(carryovers: MakeupCarryover[] | undefined, weekKey: string): boolean {
  return (carryovers || []).some((c) => c.weekKey === weekKey);
}

// 표시용 안내문: "7-3에 쓴 오후반차으로 소방학 백소나 12강 보강 (다음 주로 이월)"
export function formatCarryoverMessage(c: MakeupCarryover): string {
  const md = c.leaveDate.slice(5).replace('-', '월 ') + '일';
  return `${md}에 쓴 ${getLeaveTypeLabel(c.leaveType)}으로 ${c.subjectName} ${c.materialTitle} ${c.amount}${c.unit} 보강 (다음 주로 이월)`;
}
