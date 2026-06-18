import { NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { verifyAttendToken } from '@/lib/attendance-token';
import { getOpenSession, checkIn, checkOut, getStudentById } from '@/lib/store';
import { notifyAttendance } from '@/lib/sms';

function seoulTime(): string {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
}

// 출결 알림 발송 (비차단 — 실패해도 출결 결과엔 영향 없음)
async function sendAttendSms(studentId: string, action: 'in' | 'out', minutes?: number | null) {
  try {
    const s = await getStudentById(studentId);
    if (!s) return;
    await notifyAttendance({
      studentName: s.name,
      action,
      time: seoulTime(),
      minutes,
      parentPhone: s.parentPhone,
      studentPhone: s.studentPhone,
      targets: s.smsTargets,
    });
  } catch (e) {
    console.warn('출결 알림 발송 생략:', (e as Error)?.message);
  }
}

// 현재 등원 상태 조회 (로그인된 학생 본인)
export async function GET() {
  const sid = await getStudentSessionId();
  if (!sid) {
    return NextResponse.json({ success: false, message: '학생 로그인이 필요합니다.' }, { status: 401 });
  }
  try {
    const open = await getOpenSession(sid);
    return NextResponse.json({ success: true, checkedIn: !!open, since: open?.check_in || null });
  } catch (e: any) {
    return NextResponse.json({ success: false, message: e?.message || '상태 조회 실패' }, { status: 500 });
  }
}

// QR 스캔 → 등원/하원 토글 (로그인된 학생 본인 + 유효한 키오스크 토큰)
export async function POST(request: Request) {
  const sid = await getStudentSessionId();
  if (!sid) {
    return NextResponse.json({ success: false, message: '학생 로그인이 필요합니다.' }, { status: 401 });
  }
  try {
    const { token } = await request.json();
    if (!verifyAttendToken(token || '')) {
      return NextResponse.json(
        { success: false, message: 'QR이 만료되었거나 올바르지 않습니다. 키오스크 화면을 다시 스캔해 주세요.' },
        { status: 400 }
      );
    }
    const open = await getOpenSession(sid);
    if (open) {
      const done = await checkOut(open);
      await sendAttendSms(sid, 'out', done.minutes);
      return NextResponse.json({ success: true, action: 'check-out', minutes: done.minutes });
    }
    const started = await checkIn(sid, 'qr');
    await sendAttendSms(sid, 'in');
    return NextResponse.json({ success: true, action: 'check-in', since: started.check_in });
  } catch (e: any) {
    return NextResponse.json({ success: false, message: e?.message || '출결 처리 실패' }, { status: 500 });
  }
}
