import { NextResponse } from 'next/server';
import { isAdmin, canAdminAccessStudent } from '@/lib/auth';
import { activeBackend, getStudentById, getOpenSession, checkIn, checkOut } from '@/lib/store';

// 관리자 수동 등/하원 처리 — QR 대체 폴백.
// QR과 동일하게 '열린 세션'(check_out=null)을 만들어(등원) 출결 현황(등원중)에 즉시 반영하고,
// 하원 시 그 세션을 닫는다. checkInSupabase/checkOutSupabase 경로를 그대로 재사용한다.
// body: { studentId, action?: 'check-in' | 'check-out' }  (기본 'check-in')
// 주의: QR 경로와 달리 관리자 수동 처리는 학부모 SMS를 발송하지 않는다.
export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  if (activeBackend() !== 'supabase') {
    return NextResponse.json({ success: false, message: '출결 저장에는 Supabase 연결이 필요합니다.' }, { status: 400 });
  }

  try {
    const { studentId, action, date } = await request.json();
    const target: 'check-in' | 'check-out' = action === 'check-out' ? 'check-out' : 'check-in';
    if (!studentId) {
      return NextResponse.json({ success: false, message: '학생 정보가 올바르지 않습니다.' }, { status: 400 });
    }
    // 세션은 항상 '지금' 기준으로 생성되므로, 과거/미래 날짜 화면에서 온 요청은 반려한다(오늘 세션 오생성 방지).
    const todayKST = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
    if (date && date !== todayKST) {
      return NextResponse.json({ success: false, message: '오늘 날짜에서만 등하원 처리할 수 있습니다.' }, { status: 400 });
    }
    if (!(await getStudentById(studentId))) {
      return NextResponse.json({ success: false, message: '학생을 찾을 수 없습니다.' }, { status: 404 });
    }
    // 캠퍼스 관리자는 본인 캠퍼스 학생만 처리 가능 (슈퍼 관리자는 전원)
    if (!(await canAdminAccessStudent(studentId))) {
      return NextResponse.json({ success: false, message: '해당 학생에 접근할 권한이 없습니다.' }, { status: 403 });
    }

    const openSession = await getOpenSession(studentId);
    if (target === 'check-out') {
      if (!openSession) {
        // 이미 하원(또는 미등원) 상태 — 멱등 처리
        return NextResponse.json({ success: true, checkedIn: false, alreadyClosed: true });
      }
      const closed = await checkOut(openSession);
      return NextResponse.json({ success: true, checkedIn: false, minutes: closed.minutes });
    }

    // check-in: 이미 열린 세션이 있으면 멱등 처리 (QR과 동일한 open-session upsert)
    if (openSession) {
      return NextResponse.json({ success: true, checkedIn: true, since: openSession.check_in });
    }
    const started = await checkIn(studentId, 'manual');
    return NextResponse.json({ success: true, checkedIn: true, since: started.check_in });
  } catch (e: any) {
    console.error('attendance/check-in error:', e);
    return NextResponse.json({ success: false, message: e?.message || '등하원 처리에 실패했습니다.' }, { status: 500 });
  }
}
