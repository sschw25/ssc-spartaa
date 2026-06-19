import { checkIn, checkOut, getOpenSession, getStudentById, type StudySession } from '@/lib/store';
import { notifyAttendance } from '@/lib/sms';
import { enrollmentDaysLeft, isWeeklyGradeMissing } from '@/lib/student-flags';

export type AttendanceAction = 'check-in' | 'check-out' | 'outing' | 'return';

export interface AttendanceToggleResult {
  action: AttendanceAction;
  studentId: string;
  studentName: string;
  since?: string;
  minutes?: number | null;
  enrollmentDaysLeft?: number | null; // 등록 종료까지 남은 일수 (0=오늘 마지막, 음수=만료)
  gradeReminder?: boolean;            // 이번 주 성적 미입력(대상 학생) 안내 필요 여부
}

function seoulTime(): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
}

async function sendAttendSms(studentId: string, action: 'in' | 'out' | 'outing' | 'return', minutes?: number | null) {
  try {
    const student = await getStudentById(studentId);
    if (!student) return;

    await notifyAttendance({
      studentName: student.name,
      action,
      time: seoulTime(),
      minutes,
      parentPhone: student.parentPhone,
      studentPhone: student.studentPhone,
      targets: student.smsTargets,
    });
  } catch (error) {
    console.warn('등하원 알림 발송 생략:', (error as Error)?.message);
  }
}

export async function processAttendance(
  studentId: string,
  action: AttendanceAction,
  source = 'qr'
): Promise<AttendanceToggleResult> {
  const student = await getStudentById(studentId);
  if (!student) throw new Error('학생을 찾을 수 없습니다.');

  // 출결 화면에 함께 노출할 학생 플래그 (등록 D-day · 주간 성적 미입력)
  const daysLeft = enrollmentDaysLeft(student.enrollmentEndDate);
  const enrollmentNotice = daysLeft != null && daysLeft <= 3 ? daysLeft : null;
  const gradeReminder = isWeeklyGradeMissing(student);

  const openSession: StudySession | null = await getOpenSession(studentId);

  if (action === 'check-in' || action === 'return') {
    if (openSession) {
      throw new Error(action === 'check-in' ? '이미 등원한 상태입니다.' : '이미 복귀했거나 공부 중인 상태입니다.');
    }
    const startedSession = await checkIn(studentId, source);
    await sendAttendSms(studentId, action === 'check-in' ? 'in' : 'return');
    return {
      action,
      studentId,
      studentName: student.name,
      since: startedSession.check_in,
      enrollmentDaysLeft: enrollmentNotice,
      gradeReminder,
    };
  } else {
    // check-out || outing
    if (!openSession) {
      throw new Error('진행 중인 등원 기록이 없습니다. 먼저 등원 처리를 해주세요.');
    }
    const closedSession = await checkOut(openSession);
    await sendAttendSms(studentId, action === 'check-out' ? 'out' : 'outing', closedSession.minutes);
    return {
      action,
      studentId,
      studentName: student.name,
      minutes: closedSession.minutes,
      enrollmentDaysLeft: enrollmentNotice,
      gradeReminder,
    };
  }
}

export async function toggleAttendance(studentId: string, source = 'qr'): Promise<AttendanceToggleResult> {
  const openSession: StudySession | null = await getOpenSession(studentId);
  const action: AttendanceAction = openSession ? 'check-out' : 'check-in';
  return processAttendance(studentId, action, source);
}
