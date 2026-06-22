import { NextRequest, NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { getStudentById, saveStudent } from '@/lib/store';

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

  if (!noteObj.daily_checklist) {
    noteObj.daily_checklist = {};
  }

  const todayKey = getSeoulDateKey();

  noteObj.daily_checklist[todayKey] = {
    sleep_hours: Number(sleepHours),
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
    specialNote: updatedStudent?.specialNote || student.specialNote,
    leaveCoupons: updatedStudent?.leaveCoupons || 0,
    rewardGranted: rewardResult.granted,
    rewardReasons: rewardResult.reasons
  });
}

