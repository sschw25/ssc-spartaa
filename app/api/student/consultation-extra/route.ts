import { NextRequest, NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { getStudentById, addConsultationBooking } from '@/lib/store';
import { isConsultationCampus } from '@/lib/consultation-schedule';
import type { ConsultationBooking } from '@/lib/types/student';

// POST: 추가·긴급 상담 신청(슬롯 점유 없음 → 관리자 상담판에서 수동 처리). body { reason }
export async function POST(req: NextRequest) {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }

  const student = await getStudentById(studentId);
  if (!student) {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }
  if (!isConsultationCampus(student.campus)) {
    return NextResponse.json({ success: false, message: '상담 예약이 운영되지 않는 센터입니다.' }, { status: 400 });
  }

  let body: { reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }
  const reason = String(body?.reason ?? '').trim();
  if (!reason) {
    return NextResponse.json({ success: false, message: '신청 사유를 입력해 주세요.' }, { status: 400 });
  }
  if (reason.length > 500) {
    return NextResponse.json({ success: false, message: '신청 사유가 너무 깁니다.' }, { status: 400 });
  }

  const booking: ConsultationBooking = {
    id: `cbk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    studentId,
    studentName: student.name,
    campus: student.campus,
    date: '',
    slot: '',
    counselor: '',
    kind: 'extra',
    status: 'booked',
    source: 'student',
    reason,
    createdAt: new Date().toISOString(),
  };

  // extra 는 슬롯을 점유하지 않으므로 forceAssign=true 로 추가
  const result = await addConsultationBooking(booking, true);
  if (result === 'taken') {
    return NextResponse.json({ success: false, message: '신청에 실패했습니다. 잠시 후 다시 시도해 주세요.' }, { status: 409 });
  }

  return NextResponse.json({ success: true, booking: result });
}
