import type { LeaveRequest, Student } from '@/lib/types/student';

// 휴가/반차 한 건이 가리는 시간대 종류.
// slot이 지정된 신청(개인사정 반차·병가)은 slot 우선, 없으면 type로 판단(휴식권/개인사정 휴가=하루 종일).
export type LeaveBlockKind = 'fullday' | 'morning' | 'afternoon' | 'night';

export function leaveBlockKind(leave: LeaveRequest): LeaveBlockKind | null {
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
      return null;
  }
}

// 교시 idx(0~6: 1~7교시)가 해당 시간대에 포함되는지
export function leaveKindCoversPeriod(kind: LeaveBlockKind | null, idx: number): boolean {
  switch (kind) {
    case 'fullday': return true;
    case 'morning': return idx < 2;
    case 'afternoon': return idx >= 2 && idx <= 4;
    case 'night': return idx >= 5 && idx <= 6;
    default: return false;
  }
}

export function approvedLeavesOn(student: Pick<Student, 'leaveRequests'> | null, date: string): LeaveRequest[] {
  return student
    ? (student.leaveRequests || []).filter((r) => r.date === date && r.status === 'approved')
    : [];
}

// 그 (학생, 날짜, 교시idx)가 승인 휴가가 덮는 교시인지.
export function isPeriodCoveredByApprovedLeave(
  student: Pick<Student, 'leaveRequests'> | null,
  date: string,
  idx: number,
): boolean {
  return approvedLeavesOn(student, date).some((l) => leaveKindCoversPeriod(leaveBlockKind(l), idx));
}
