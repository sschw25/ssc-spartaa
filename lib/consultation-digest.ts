import type { Student } from '@/lib/types/student';
import { getRequestTypeLabel } from '@/lib/student-requests';
import { getLeaveTypeLabel } from '@/lib/leave';

export interface DigestItem {
  kind: 'request' | 'leave' | 'note';
  label: string;
  detail?: string;
}

// ISO 또는 YYYY-MM-DD 문자열을 KST 기준 날짜(YYYY-MM-DD)로 환산.
function toKstDate(value?: string): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value; // 이미 날짜
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(d);
}

// 상담일 date 에 "처리된/발생한" 변경 이벤트를 모아 다이제스트로 반환.
export function buildConsultationDigest(
  student: Pick<Student, 'consultationLogs' | 'leaveRequests'>,
  date: string,
): DigestItem[] {
  const items: DigestItem[] = [];

  // 1) 그날 처리된(resolved) 변경 신청
  for (const log of student.consultationLogs || []) {
    if (log.type !== 'request') continue;
    if (log.status !== 'resolved') continue;
    if (toKstDate(log.resolvedAt) !== date) continue;
    items.push({
      kind: 'request',
      label: `변경 처리: ${getRequestTypeLabel(log.requestType)}`,
      detail: (log.content || '').slice(0, 120) || undefined,
    });
  }

  // 2) 그날 처리(승인/반려)된 휴가·반차 — LeaveRequest 처리시각은 reviewedAt
  for (const lr of student.leaveRequests || []) {
    if (lr.status !== 'approved' && lr.status !== 'rejected') continue;
    if (toKstDate(lr.reviewedAt) !== date) continue;
    items.push({
      kind: 'leave',
      label: `${getLeaveTypeLabel(lr.type)} ${lr.status === 'approved' ? '승인' : '반려'}`,
      detail: lr.date || undefined,
    });
  }

  // 3) 그날 작성된 학습 상담 노트
  for (const log of student.consultationLogs || []) {
    if (log.type !== 'learning') continue;
    if (toKstDate(log.createdAt || log.date) !== date) continue;
    items.push({ kind: 'note', label: '학습 상담 기록', detail: (log.content || '').slice(0, 120) || undefined });
  }

  return items;
}
