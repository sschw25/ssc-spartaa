import { NextResponse } from 'next/server';
import { isAdmin, canAdminAccessStudent } from '@/lib/auth';
import { activeBackend, getStudentById, getOpenSession, checkIn, checkOut } from '@/lib/store';

// 관리자 수동 등/하원 처리 — QR 대체 폴백.
// QR과 동일하게 '열린 세션'(check_out=null)을 만들어(등원) 출결 현황(등원중)에 즉시 반영하고,
// 하원 시 그 세션을 닫는다. checkInSupabase/checkOutSupabase 경로를 그대로 재사용한다.
// body: { studentId, action?: 'check-in' | 'check-out', time?: 'HH:mm' }  (기본 'check-in', time 미지정 시 '지금')
// time 은 관리자가 오전/오후 등 실제 등하원 시각을 수기 지정할 때 사용한다(오늘 KST 기준).
// 주의: QR 경로와 달리 관리자 수동 처리는 학부모 SMS를 발송하지 않는다.
export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  if (activeBackend() !== 'supabase') {
    return NextResponse.json({ success: false, message: '출결 저장에는 Supabase 연결이 필요합니다.' }, { status: 400 });
  }

  try {
    const { studentId, action, date, time } = await request.json();
    const target: 'check-in' | 'check-out' = action === 'check-out' ? 'check-out' : 'check-in';
    if (!studentId) {
      return NextResponse.json({ success: false, message: '학생 정보가 올바르지 않습니다.' }, { status: 400 });
    }
    // 세션은 오늘 KST 기준으로 생성되므로, 과거/미래 날짜 화면에서 온 요청은 반려한다(오늘 세션 오생성 방지).
    const todayKST = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
    if (date && date !== todayKST) {
      return NextResponse.json({ success: false, message: '오늘 날짜에서만 등하원 처리할 수 있습니다.' }, { status: 400 });
    }
    // time(HH:mm) 지정 시 오늘 KST 해당 시각의 타임스탬프를 만든다. 미지정이면 '지금'.
    let atDate: Date | undefined;
    if (typeof time === 'string' && time.trim()) {
      const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(time.trim());
      if (!m) {
        return NextResponse.json({ success: false, message: '시각 형식이 올바르지 않습니다. (HH:mm)' }, { status: 400 });
      }
      atDate = new Date(`${todayKST}T${m[1].padStart(2, '0')}:${m[2]}:00+09:00`);
      if (Number.isNaN(atDate.getTime()) || atDate.getTime() > Date.now() + 60_000) {
        return NextResponse.json({ success: false, message: '등하원 시각은 현재 시각 이후로 지정할 수 없습니다.' }, { status: 400 });
      }
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
      // 지정 하원 시각이 등원 시각보다 빠르면 반려(음수 순공 방지).
      if (atDate && atDate.getTime() < new Date(openSession.check_in).getTime()) {
        return NextResponse.json({ success: false, message: '하원 시각이 등원 시각보다 빠를 수 없습니다.' }, { status: 400 });
      }
      const closed = await checkOut(openSession, atDate);
      return NextResponse.json({ success: true, checkedIn: false, minutes: closed.minutes });
    }

    // check-in: 이미 열린 세션이 있으면 멱등 처리 (QR과 동일한 open-session upsert)
    if (openSession) {
      return NextResponse.json({ success: true, checkedIn: true, since: openSession.check_in });
    }
    const started = await checkIn(studentId, 'manual', atDate);
    return NextResponse.json({ success: true, checkedIn: true, since: started.check_in });
  } catch (e: any) {
    console.error('attendance/check-in error:', e);
    return NextResponse.json({ success: false, message: e?.message || '등하원 처리에 실패했습니다.' }, { status: 500 });
  }
}
