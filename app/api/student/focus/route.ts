import { NextRequest, NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { updateStudentById } from '@/lib/store';
import { checkAndGrantRewards } from '@/lib/rewards-service';
import { getSeoulDateKey, readActivityEnvelope, writeActivityEnvelope, serializeClientActivityNoteFromStudent } from '@/lib/student-activity';

// 열품타식 집중(순공) 누적 — 클라이언트가 그날 총 집중분을 주기적으로 '올려' 반영한다.
// SET-max 시맨틱: 서버는 max(기존, min(minutes, 하루상한))으로만 갱신 → 재시도/중복 전송에 안전(중복적립 없음).
// 재석(출결) ≤ 상한 클램프는 리더보드 조회 시점에 적용한다(재석은 실시간으로 늘어나므로).
const DAILY_CAP_MIN = 16 * 60; // 하루 16시간 상한(비정상값 방지)

export async function POST(req: NextRequest) {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const raw = typeof body.minutes === 'number' ? body.minutes : 0;
  const minutes = Math.max(0, Math.min(DAILY_CAP_MIN, Math.round(raw)));

  const todayKey = getSeoulDateKey();
  let todayTotal = 0;

  const result = await updateStudentById(studentId, (student) => {
    const note = readActivityEnvelope(student);
    if (!note.pomodoro_minutes) note.pomodoro_minutes = {};
    const existing = Number(note.pomodoro_minutes[todayKey]) || 0;
    // 비감소(max) — 스톱워치 총량은 줄지 않는다.
    note.pomodoro_minutes[todayKey] = Math.max(existing, minutes);
    todayTotal = note.pomodoro_minutes[todayKey];
    writeActivityEnvelope(student, note);
  });

  if (result === 'not_found') {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }
  if (typeof result === 'string') {
    return NextResponse.json({ success: false, message: '저장이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' }, { status: 409 });
  }

  const rewardResult = await checkAndGrantRewards(studentId).catch(() => ({ granted: false, reasons: [] as string[] }));

  return NextResponse.json({
    success: true,
    minutes: todayTotal,
    specialNote: serializeClientActivityNoteFromStudent(result),
    leaveCoupons: (result as { leaveCoupons?: number })?.leaveCoupons ?? 0,
    rewardGranted: rewardResult.granted,
    rewardReasons: rewardResult.reasons,
  });
}
