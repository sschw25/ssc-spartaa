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

// 날짜 키(YYYY-MM-DD)에 n일 더한 키 — 로컬 캘린더 산술(달·연 경계 안전).
export function addDaysToDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, (d || 1) + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export function nextWeekKey(weekKey: string): string {
  return addDaysToDateKey(weekKey, 7);
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

// 이번 주에 이미 이월을 썼는지(주당 1회 캡) — 실제 캘린더 주(createdAt) 기준.
// (record.weekKey 는 오버레이 정렬용 — deadline 은 활성 계획 창(startDate) 기준, daily 는 실주(오늘) 기준이라
//  캡 판정엔 쓰지 않고 createdAt 을 쓴다.)
// createdAt 은 UTC ISO 타임스탬프라 slice(0,10)로 자르면 KST 월요일 00:00~08:59 이월이 전주(일요일)로
// 귀속돼 주 1회 캡이 우회된다 — 반드시 KST 캘린더 날짜로 변환 후 주 키를 만든다.
export function hasCarryoverInRealWeek(carryovers: MakeupCarryover[] | undefined, realWeekKey: string): boolean {
  return (carryovers || []).some((c) => {
    const t = new Date(c.createdAt || '');
    if (Number.isNaN(t.getTime())) return false;
    const kstDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(t);
    return weekKeyOf(kstDate) === realWeekKey;
  });
}

// 표시용 안내문: "7-3에 쓴 오후반차으로 소방학 백소나 12강 보강 (다음 주로 이월)"
export function formatCarryoverMessage(c: MakeupCarryover): string {
  const md = c.leaveDate.slice(5).replace('-', '월 ') + '일';
  return `${md}에 쓴 ${getLeaveTypeLabel(c.leaveType)}으로 ${c.subjectName} ${c.materialTitle} ${c.amount}${c.unit} 보강 (다음 주로 이월)`;
}
