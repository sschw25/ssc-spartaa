import { checkIn, checkOut, getOpenSession, autoCloseSession, getStudentById, type StudySession } from '@/lib/store';
import { getAttendCloseTime } from '@/lib/attendance-sweep';
import { notifyAttendance } from '@/lib/sms';
import { enrollmentDaysLeft, isWeeklyGradeMissing } from '@/lib/student-flags';

function seoulDateString(now = new Date()): string {
  // KST 기준 YYYY-MM-DD
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(now);
}

// 어제(또는 그 이전) 등원한 채 하원을 안 눌러 열린 세션이 남으면, 다음날 등원이 막힌다.
// 그 유휴 세션을 등원 날짜의 마감시각(sweep과 동일, minutes=null)으로 자동 마감해
// 다음날 등원을 정상 진행시키고, 실제 하원시각은 관리자가 수동 입력하도록 남긴다.
async function closeStaleSession(session: StudySession, now: Date): Promise<void> {
  const closeAt = new Date(`${session.date}T${getAttendCloseTime()}:00+09:00`);
  // 방어적으로 등원시각보다는 뒤, 현재시각보다는 앞이 되도록 보정
  const checkInMs = new Date(session.check_in).getTime();
  const safeMs = Math.min(Math.max(closeAt.getTime(), checkInMs + 60000), now.getTime());
  await autoCloseSession(session, new Date(safeMs));
}

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

  const now = new Date();
  let openSession: StudySession | null = await getOpenSession(studentId);

  // 어제 이전에 하원을 안 눌러 열린 세션이 남아 있으면 자동 마감하고, 오늘 등원은 정상 진행한다.
  // (오늘 열린 세션은 실제 등원 중이므로 건드리지 않는다.)
  if (openSession && openSession.date < seoulDateString(now)) {
    await closeStaleSession(openSession, now);
    openSession = null;
  }

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
  // 어제 이전에 하원을 안 눌러 남은 열린 세션은 '등원 중'으로 보지 않는다.
  // (그대로 두면 오늘 스캔이 하원으로 토글돼 등원이 안 된다. processAttendance가 그 세션을 정리한다.)
  const activeToday = openSession && openSession.date === seoulDateString() ? openSession : null;
  const action: AttendanceAction = activeToday ? 'check-out' : 'check-in';
  return processAttendance(studentId, action, source);
}
