import { NextRequest, NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { getStudentById, saveStudent } from '@/lib/store';
import { getSeoulDateKey, parseSpecialNoteEnvelope, serializeClientActivityNote } from '@/lib/student-activity';

export async function POST(req: NextRequest) {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }

  let body: { sleepHours?: number; phoneSubmitted?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const { sleepHours, phoneSubmitted } = body;
  if (sleepHours === undefined || phoneSubmitted === undefined) {
    return NextResponse.json({ success: false, message: '필수 체크 항목이 누락되었습니다.' }, { status: 400 });
  }
  // 수면시간은 0~24의 유효 숫자만 허용 (NaN/음수/과대값이 리워드 판정에 새는 것 방지)
  const sleepHoursNum = Number(sleepHours);
  if (!Number.isFinite(sleepHoursNum) || sleepHoursNum < 0 || sleepHoursNum > 24) {
    return NextResponse.json({ success: false, message: '수면 시간 값이 올바르지 않습니다.' }, { status: 400 });
  }

  const student = await getStudentById(studentId);
  if (!student) {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }

  const noteObj = parseSpecialNoteEnvelope(student.specialNote);

  if (!noteObj.daily_checklist) {
    noteObj.daily_checklist = {};
  }

  const todayKey = getSeoulDateKey();

  noteObj.daily_checklist[todayKey] = {
    sleep_hours: sleepHoursNum,
    phone_submitted: Boolean(phoneSubmitted),
    submitted_at: new Date().toISOString()
  };

  student.specialNote = JSON.stringify(noteObj);
  await saveStudent(student);

  // 리워드 미션 체크
  const { checkAndGrantRewards } = await import('@/lib/rewards-service');
  const rewardResult = await checkAndGrantRewards(studentId);
  const updatedStudent = await getStudentById(studentId);

  return NextResponse.json({ 
    success: true, 
    checklist: noteObj.daily_checklist, 
    specialNote: serializeClientActivityNote(updatedStudent?.specialNote || student.specialNote),
    leaveCoupons: updatedStudent?.leaveCoupons || 0,
    rewardGranted: rewardResult.granted,
    rewardReasons: rewardResult.reasons
  });
}

