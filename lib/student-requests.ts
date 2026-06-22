import type { ConsultationLog, Student } from '@/lib/types/student';
import { getLeaveTypeLabel } from '@/lib/leave';

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
