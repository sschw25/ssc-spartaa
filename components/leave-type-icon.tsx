import { BedDouble, CloudSun, Moon, Sunrise, Thermometer, UserRound, type LucideIcon } from 'lucide-react';
import type { LeaveType } from '@/lib/types/student';

// 휴가 종류 → lucide 아이콘 단일 소스 (학생·관리자 공용).
// 공유 LEAVE_TYPES(lib/leave)의 이모지 icon 필드 대신 이걸 써서 앱 전체 아이콘 시스템과 일관되게.
export const LEAVE_TYPE_ICON: Record<LeaveType, LucideIcon> = {
  morning: Sunrise,
  afternoon: CloudSun,
  night: Moon,
  fullday: BedDouble,
  personal_halfday: UserRound,
  personal_fullday: UserRound,
  sick: Thermometer,
};

export function LeaveTypeIcon({ type, className }: { type: LeaveType; className?: string }) {
  const Icon = LEAVE_TYPE_ICON[type];
  if (!Icon) return null;
  return <Icon className={className ?? 'h-3.5 w-3.5 shrink-0'} />;
}
