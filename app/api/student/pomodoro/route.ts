import { NextRequest, NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { getStudentById, updateStudentById } from '@/lib/store';
import { checkAndGrantRewards } from '@/lib/rewards-service';
import { getSeoulDateKey, readActivityEnvelope, writeActivityEnvelope, serializeClientActivityNoteFromStudent } from '@/lib/student-activity';

export async function POST(req: NextRequest) {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  // 1~120분으로 클램프 — 상한이 없으면 임의 큰 값으로 리워드(쿠폰)를 부당 적립할 수 있다.
  const minutes = typeof body.minutes === 'number' && body.minutes > 0
    ? Math.min(120, Math.round(body.minutes))
    : 50;
  // 집중 이탈(알트탭/창전환) 횟수 — 0~1000으로 클램프
  const distractions = typeof body.distractions === 'number' && body.distractions > 0
    ? Math.min(1000, Math.round(body.distractions))
    : 0;

  const todayKey = getSeoulDateKey();
  const nowMs = Date.now();
  // 직전 세션과 최소 간격 미만이면 카운트 제외 — 더블클릭·즉시 2연타 방지.
  // 고정 하한 5분을 둔다: minutes=1 로 임계를 30초까지 줄여 연타 우회하는 것을 차단.
  // (정상 세션은 최소 5분이라 두 세션이 5분 이내에 완료될 수 없어 회귀 없음.)
  const minGapMs = Math.max(5 * 60 * 1000, minutes * 0.5 * 60 * 1000);
  let pomodoroCount = 0;
  let pomodoroMinutes = 0;
  let pomodoroDistractions = 0;
  let counted = false;

  const result = await updateStudentById(studentId, (student) => {
    const noteObj = readActivityEnvelope(student);

    if (!noteObj.pomodoro_sessions) noteObj.pomodoro_sessions = {};
    if (!noteObj.pomodoro_minutes) noteObj.pomodoro_minutes = {};
    if (!noteObj.pomodoro_distractions) noteObj.pomodoro_distractions = {};

    // 마지막 세션 기록 시각(epoch ms). 최소 간격 미만 재요청이면 적립 없이 현재 누계만 반환.
    const lastAt = Number(noteObj.pomodoro_last_at);
    const tooSoon = Number.isFinite(lastAt) && nowMs - lastAt < minGapMs;

    if (!tooSoon) {
      noteObj.pomodoro_sessions[todayKey] = (noteObj.pomodoro_sessions[todayKey] || 0) + 1;
      noteObj.pomodoro_minutes[todayKey] = (noteObj.pomodoro_minutes[todayKey] || 0) + minutes;
      noteObj.pomodoro_distractions[todayKey] = (noteObj.pomodoro_distractions[todayKey] || 0) + distractions;
      noteObj.pomodoro_last_at = nowMs;
      counted = true;
    }

    pomodoroCount = noteObj.pomodoro_sessions[todayKey] || 0;
    pomodoroMinutes = noteObj.pomodoro_minutes[todayKey] || 0;
    pomodoroDistractions = noteObj.pomodoro_distractions[todayKey] || 0;

    writeActivityEnvelope(student, noteObj);
  });

  if (result === 'not_found') {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }
  if (typeof result === 'string') {
    return NextResponse.json({ success: false, message: '저장이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' }, { status: 409 });
  }

  // 리워드 조건 스크리닝 진행
  const rewardResult = await checkAndGrantRewards(studentId);

  // 갱신된 학생 정보 재조회
  const updatedStudent = await getStudentById(studentId);

  return NextResponse.json({
    success: true,
    counted,
    pomodoroCount,
    pomodoroMinutes,
    pomodoroDistractions,
    specialNote: serializeClientActivityNoteFromStudent(updatedStudent || result),
    leaveCoupons: updatedStudent?.leaveCoupons || 0,
    rewardGranted: rewardResult.granted,
    rewardReasons: rewardResult.reasons
  });
}
