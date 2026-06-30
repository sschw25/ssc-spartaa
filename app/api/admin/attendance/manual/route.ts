import { NextResponse } from 'next/server';
import { isAdmin, canAdminAccessStudent } from '@/lib/auth';
import { activeBackend, getStudentById, deleteSessionsByStudentDate, setManualAttendance } from '@/lib/store';

const HM = /^\d{2}:\d{2}$/;

// 관리자: 학생별/날짜별 등하원 시간을 수동 입력·수정한다.
// body: { studentId, date(YYYY-MM-DD), checkIn('HH:MM'), checkOut('HH:MM'|''), clear?: boolean }
export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  if (activeBackend() !== 'supabase') {
    return NextResponse.json({ success: false, message: '출결 저장에는 Supabase 연결이 필요합니다.' }, { status: 400 });
  }

  try {
    const { studentId, date, checkIn, checkOut, clear } = await request.json();
    if (!studentId || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
      return NextResponse.json({ success: false, message: '학생/날짜 정보가 올바르지 않습니다.' }, { status: 400 });
    }
    if (!(await getStudentById(studentId))) {
      return NextResponse.json({ success: false, message: '학생을 찾을 수 없습니다.' }, { status: 404 });
    }
    // 캠퍼스 관리자는 본인 캠퍼스 학생만 수정 가능 (슈퍼 관리자는 전원)
    if (!(await canAdminAccessStudent(studentId))) {
      return NextResponse.json({ success: false, message: '해당 학생에 접근할 권한이 없습니다.' }, { status: 403 });
    }

    if (clear || !checkIn) {
      await deleteSessionsByStudentDate(studentId, date);
      return NextResponse.json({ success: true, cleared: true });
    }

    if (!HM.test(checkIn) || (checkOut && !HM.test(checkOut))) {
      return NextResponse.json({ success: false, message: '시간 형식(HH:MM)이 올바르지 않습니다.' }, { status: 400 });
    }
    if (checkOut && checkOut <= checkIn) {
      return NextResponse.json({ success: false, message: '하원시간은 등원시간보다 늦어야 합니다.' }, { status: 400 });
    }

    const checkInIso = new Date(`${date}T${checkIn}:00+09:00`).toISOString();
    const checkOutIso = checkOut ? new Date(`${date}T${checkOut}:00+09:00`).toISOString() : null;
    const saved = await setManualAttendance(studentId, date, checkInIso, checkOutIso);
    return NextResponse.json({ success: true, session: { id: saved.id, minutes: saved.minutes } });
  } catch (e: any) {
    console.error('attendance/manual error:', e);
    return NextResponse.json({ success: false, message: e?.message || '출결 저장에 실패했습니다.' }, { status: 500 });
  }
}
