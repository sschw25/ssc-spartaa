import { NextRequest, NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { getStudentById, saveStudent } from '@/lib/store';
import { checkAndGrantRewards } from '@/lib/rewards-service';
import { getSeoulDateKey, readActivityEnvelope, writeActivityEnvelope, serializeClientActivityNoteFromStudent } from '@/lib/student-activity';

export async function POST(req: NextRequest) {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }

  const student = await getStudentById(studentId);
  if (!student) {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }

  const noteObj = readActivityEnvelope(student);

  const body = await req.json().catch(() => ({}));
  // 1~120분으로 클램프 — 상한이 없으면 임의 큰 값으로 리워드(쿠폰)를 부당 적립할 수 있다.
  const minutes = typeof body.minutes === 'number' && body.minutes > 0
    ? Math.min(120, Math.round(body.minutes))
    : 50;
  // 집중 이탈(알트탭/창전환) 횟수 — 0~1000으로 클램프
  const distractions = typeof body.distractions === 'number' && body.distractions > 0
    ? Math.min(1000, Math.round(body.distractions))
    : 0;

  if (!noteObj.pomodoro_sessions) noteObj.pomodoro_sessions = {};
  if (!noteObj.pomodoro_minutes) noteObj.pomodoro_minutes = {};
  if (!noteObj.pomodoro_distractions) noteObj.pomodoro_distractions = {};

  const todayKey = getSeoulDateKey();
  noteObj.pomodoro_sessions[todayKey] = (noteObj.pomodoro_sessions[todayKey] || 0) + 1;
  noteObj.pomodoro_minutes[todayKey] = (noteObj.pomodoro_minutes[todayKey] || 0) + minutes;
  noteObj.pomodoro_distractions[todayKey] = (noteObj.pomodoro_distractions[todayKey] || 0) + distractions;

  writeActivityEnvelope(student, noteObj);
  await saveStudent(student);

  // 리워드 조건 스크리닝 진행
  const rewardResult = await checkAndGrantRewards(studentId);

  // 갱신된 학생 정보 재조회
  const updatedStudent = await getStudentById(studentId);

  return NextResponse.json({
    success: true,
    pomodoroCount: noteObj.pomodoro_sessions[todayKey],
    pomodoroMinutes: noteObj.pomodoro_minutes[todayKey],
    pomodoroDistractions: noteObj.pomodoro_distractions[todayKey],
    specialNote: serializeClientActivityNoteFromStudent(updatedStudent || student),
    leaveCoupons: updatedStudent?.leaveCoupons || 0,
    rewardGranted: rewardResult.granted,
    rewardReasons: rewardResult.reasons
  });
}
