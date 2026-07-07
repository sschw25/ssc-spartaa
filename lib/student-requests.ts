import type { ConsultationLog, ProposedGoal, Student } from '@/lib/types/student';
import { getLeaveTypeLabel } from '@/lib/leave';

const PROPOSED_GOAL_TYPES = ['weeks', 'weeklyAmount', 'dailyAmount', 'deadlineWeeks'] as const;

// 학생 body의 proposedGoal은 관리자 승인 시 generateDetailedPlans에 그대로 투입되므로
// (admin/students/[id]/requests) 저장 시점에 필드 단위로 정규화한다. 검증 실패 필드는 버린다.
// - materialId/materialType 없으면 제안 자체를 폐기(undefined) — 소비처가 자료를 못 찾음
// - goalType은 union allowlist, goalValue는 유한수 0~9999 클램프
// - proposedWeekNumber 정수 1~12, proposedRangeText/goalDescription류 trim+길이상한
// (원래 app/api/student/requests/route.ts 내부 함수 — 시작점 조정 신청 경로와 공유하려고 이동)
export function normalizeProposedGoal(raw: unknown): ProposedGoal | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const g = raw as Record<string, unknown>;

  const materialId = typeof g.materialId === 'string' ? g.materialId.trim().slice(0, 100) : '';
  const materialType = g.materialType === 'book' || g.materialType === 'lecture' ? g.materialType : null;
  if (!materialId || !materialType) return undefined; // 자료 식별 불가한 제안은 폐기

  const goalType = (PROPOSED_GOAL_TYPES as readonly string[]).includes(String(g.goalType))
    ? (g.goalType as ProposedGoal['goalType'])
    : 'weeks';

  const goalValueNum = Number(g.goalValue);
  const goalValue = Number.isFinite(goalValueNum) ? Math.max(0, Math.min(9999, goalValueNum)) : 0;

  const normalized: ProposedGoal = { materialId, materialType, goalType, goalValue };

  if (typeof g.targetDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(g.targetDate)) {
    normalized.targetDate = g.targetDate;
  }
  const currentProgressNum = Number(g.currentProgress);
  if (Number.isFinite(currentProgressNum) && currentProgressNum >= 0) {
    normalized.currentProgress = Math.min(999999, Math.round(currentProgressNum));
  }
  const weekNum = Number(g.proposedWeekNumber);
  if (Number.isFinite(weekNum) && weekNum >= 1) {
    normalized.proposedWeekNumber = Math.min(12, Math.round(weekNum));
  }
  if (typeof g.proposedRangeText === 'string') {
    const rangeText = g.proposedRangeText.trim().slice(0, 200);
    if (rangeText) normalized.proposedRangeText = rangeText;
  }
  const speedNum = Number(g.speedMultiplier);
  if (Number.isFinite(speedNum) && speedNum > 0) {
    normalized.speedMultiplier = Math.min(4, speedNum);
  }
  // currentGoal은 관리자 before/after 표시용(계획 계산에 미투입)이지만 동일 규격으로 방어
  if (g.currentGoal && typeof g.currentGoal === 'object') {
    const c = g.currentGoal as Record<string, unknown>;
    const cur: ProposedGoal['currentGoal'] = {};
    if ((PROPOSED_GOAL_TYPES as readonly string[]).includes(String(c.goalType))) {
      cur.goalType = c.goalType as ProposedGoal['goalType'];
    }
    const cv = Number(c.goalValue);
    if (Number.isFinite(cv)) cur.goalValue = Math.max(0, Math.min(9999, cv));
    const cs = Number(c.speedMultiplier);
    if (Number.isFinite(cs) && cs > 0) cur.speedMultiplier = Math.min(4, cs);
    if (Object.keys(cur).length > 0) normalized.currentGoal = cur;
  }

  return normalized;
}

export const REQUEST_TYPE_LABEL: Record<NonNullable<ConsultationLog['requestType']>, string> = {
  progress: '진도 정정',
  subject: '과목 변경',
  plan: '학습계획',
  halfDay: '반차 신청',
  restPass: '휴식권 신청',
  etc: '기타',
};

export type PendingChangeRequestRow = {
  student: Student;
  requests: ConsultationLog[];
  requestTypeLabels: string[];
  latestRequestAt: string;
};

export type PendingAdminTaskRow = {
  student: Student;
  changeRequests: ConsultationLog[];
  leaveRequests: NonNullable<Student['leaveRequests']>;
  suggestions: ConsultationLog[];
  labels: string[];
  latestRequestAt: string;
};

export const getRequestTypeLabel = (type?: ConsultationLog['requestType'] | string) => {
  const key = (type || 'etc') as keyof typeof REQUEST_TYPE_LABEL;
  return REQUEST_TYPE_LABEL[key] || '기타 신청';
};

export const getPendingChangeRequests = (
  student: Pick<Student, 'consultationLogs'>
): ConsultationLog[] => {
  return (student.consultationLogs || [])
    .filter((log) => log.type === 'request' && log.status !== 'resolved')
    .sort((a, b) => (b.createdAt || b.date || '').localeCompare(a.createdAt || a.date || ''));
};

export const getPendingSuggestions = (
  student: Pick<Student, 'consultationLogs'>
): ConsultationLog[] => {
  return (student.consultationLogs || [])
    .filter((log) => log.type === 'suggestion' && log.status !== 'resolved')
    .sort((a, b) => (b.createdAt || b.date || '').localeCompare(a.createdAt || a.date || ''));
};

export const buildPendingChangeRequestRows = (students: Student[]): PendingChangeRequestRow[] => {
  return students
    .map((student) => {
      const requests = getPendingChangeRequests(student);
      const requestTypeLabels = Array.from(new Set(requests.map((request) => getRequestTypeLabel(request.requestType))));
      const latestRequestAt = requests.reduce((latest, request) => {
        const current = request.createdAt || request.date || '';
        return current > latest ? current : latest;
      }, '');

      return {
        student,
        requests,
        requestTypeLabels,
        latestRequestAt,
      };
    })
    .filter((row) => row.requests.length > 0)
    .sort((a, b) => b.latestRequestAt.localeCompare(a.latestRequestAt) || a.student.name.localeCompare(b.student.name, 'ko'));
};

export const buildPendingAdminTaskRows = (students: Student[]): PendingAdminTaskRow[] => {
  return students
    .map((student) => {
      const changeRequests = getPendingChangeRequests(student);
      const leaveRequests = (student.leaveRequests || [])
        .filter((request) => request.status === 'pending')
        .sort((a, b) => (b.createdAt || b.date || '').localeCompare(a.createdAt || a.date || ''));
      const suggestions = getPendingSuggestions(student);
      const labels = Array.from(new Set([
        ...changeRequests.map((request) => `학습: ${getRequestTypeLabel(request.requestType)}`),
        ...leaveRequests.map((request) => `반차/휴가: ${getLeaveTypeLabel(request.type)}`),
        ...suggestions.map(() => '건의사항'),
      ]));
      const latestRequestAt = [
        ...changeRequests.map((request) => request.createdAt || request.date || ''),
        ...leaveRequests.map((request) => request.createdAt || request.date || ''),
        ...suggestions.map((request) => request.createdAt || request.date || ''),
      ].reduce((latest, current) => (current > latest ? current : latest), '');

      return {
        student,
        changeRequests,
        leaveRequests,
        suggestions,
        labels,
        latestRequestAt,
      };
    })
    .filter((row) => row.changeRequests.length + row.leaveRequests.length + row.suggestions.length > 0)
    .sort((a, b) => b.latestRequestAt.localeCompare(a.latestRequestAt) || a.student.name.localeCompare(b.student.name, 'ko'));
};
