import { NextRequest, NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { getStudentById, saveStudent } from '@/lib/store';
import { checkAndGrantRewards } from '@/lib/rewards-service';

const getSeoulDateKey = () => {
  const d = new Date();
  const formatter = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(d);
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
};

export async function POST(req: NextRequest) {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }

  const student = await getStudentById(studentId);
  if (!student) {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }

  let noteObj: any = {};
  try {
    if (student.specialNote) {
      noteObj = JSON.parse(student.specialNote);
      if (typeof noteObj !== 'object' || noteObj === null) {
        noteObj = { noteText: student.specialNote };
      }
    }
  } catch {
    noteObj = { noteText: student.specialNote || '' };
  }

  const body = await req.json().catch(() => ({}));
  const minutes = typeof body.minutes === 'number' && body.minutes > 0 ? Math.round(body.minutes) : 50;

  if (!noteObj.pomodoro_sessions) noteObj.pomodoro_sessions = {};
  if (!noteObj.pomodoro_minutes) noteObj.pomodoro_minutes = {};

  const todayKey = getSeoulDateKey();
  noteObj.pomodoro_sessions[todayKey] = (noteObj.pomodoro_sessions[todayKey] || 0) + 1;
  noteObj.pomodoro_minutes[todayKey] = (noteObj.pomodoro_minutes[todayKey] || 0) + minutes;

  student.specialNote = JSON.stringify(noteObj);
  await saveStudent(student);

  // 리워드 조건 스크리닝 진행
  const rewardResult = await checkAndGrantRewards(studentId);

  // 갱신된 학생 정보 재조회
  const updatedStudent = await getStudentById(studentId);

  return NextResponse.json({
    success: true,
    pomodoroCount: noteObj.pomodoro_sessions[todayKey],
    pomodoroMinutes: noteObj.pomodoro_minutes[todayKey],
    specialNote: student.specialNote,
    leaveCoupons: updatedStudent?.leaveCoupons || 0,
    rewardGranted: rewardResult.granted,
    rewardReasons: rewardResult.reasons
  });
}
