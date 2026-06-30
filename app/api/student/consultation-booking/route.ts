import { NextRequest, NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { getStudentById, getConsultationBookings, addConsultationBooking, patchConsultationBooking, getConsultationBlackouts } from '@/lib/store';
import {
  CONSULTATION_SLOT_TIMES,
  getBookableCalendar,
  isConsultationCampus,
} from '@/lib/consultation-schedule';
import type { ConsultationBooking } from '@/lib/types/student';

// KST(Asia/Seoul) 기준 오늘 날짜(YYYY-MM-DD)
function kstToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

// KST 현재 시각(HH:MM, 24시간)
function kstNowHHMM(): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
}

// 이 학생의 활성('booked') 정규 예약 1건 (없으면 null)
function findMyActiveRegular(bookings: ConsultationBooking[], studentId: string): ConsultationBooking | null {
  return (
    bookings.find(
      (b) => b.studentId === studentId && b.kind === 'regular' && b.status === 'booked',
    ) || null
  );
}

// GET: 이번 주~다음 주 운영일 캘린더 + 빈 슬롯 + 내 예약 조회
export async function GET() {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }

  const student = await getStudentById(studentId);
  if (!student) {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }

  if (!isConsultationCampus(student.campus)) {
    return NextResponse.json({ success: true, available: false });
  }

  const bookings = await getConsultationBookings(student.campus);
  const blackouts = await getConsultationBlackouts(student.campus);
  const calendar = getBookableCalendar(student.campus, kstToday(), kstNowHHMM(), bookings, blackouts);
  const myBooking = findMyActiveRegular(bookings, studentId);

  return NextResponse.json({
    success: true,
    available: true,
    calendar,
    myBooking,
    slotTimes: CONSULTATION_SLOT_TIMES,
  });
}

// POST: 정규 상담 예약(자동 수락). body { date, slot }
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

  let body: { date?: unknown; slot?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }
  const date = String(body?.date ?? '').trim();
  const slot = String(body?.slot ?? '').trim();
  if (!date || !slot) {
    return NextResponse.json({ success: false, message: '날짜와 시간을 선택해 주세요.' }, { status: 400 });
  }

  const bookings = await getConsultationBookings(student.campus);

  // 이미 활성 정규 예약이 있으면 거절(1인 1예약)
  if (findMyActiveRegular(bookings, studentId)) {
    return NextResponse.json({ success: false, message: '이미 예약된 상담이 있습니다.' }, { status: 409 });
  }

  // 캘린더(이번 주~다음 주) 기준으로 날짜·슬롯 재검증 (blackout 포함)
  const blackouts = await getConsultationBlackouts(student.campus);
  const calendar = getBookableCalendar(student.campus, kstToday(), kstNowHHMM(), bookings, blackouts);
  const day = calendar.find((d) => d.date === date);
  if (!day) {
    return NextResponse.json({ success: false, message: '지금 예약 가능한 날짜가 아니에요. 새로고침 후 다시 선택해 주세요.' }, { status: 409 });
  }
  if (!day.freeSlots.includes(slot)) {
    return NextResponse.json({ success: false, message: '이미 마감되었거나 지난 시간입니다. 다시 선택해 주세요.' }, { status: 409 });
  }

  const booking: ConsultationBooking = {
    id: `cbk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    studentId,
    studentName: student.name,
    campus: student.campus,
    date,
    weekday: day.weekday,
    slot,
    counselor: day.counselor,
    kind: 'regular',
    status: 'booked',
    source: 'student',
    createdAt: new Date().toISOString(),
  };

  const result = await addConsultationBooking(booking);
  if (result === 'taken') {
    return NextResponse.json({ success: false, message: '방금 마감된 시간입니다. 다시 선택해 주세요.' }, { status: 409 });
  }

  return NextResponse.json({ success: true, booking: result });
}

// DELETE: 본인 예약 취소. ?id=
export async function DELETE(req: NextRequest) {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ success: false, message: '취소할 예약이 없습니다.' }, { status: 400 });
  }

  const student = await getStudentById(studentId);
  if (!student) {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }
  if (!isConsultationCampus(student.campus)) {
    return NextResponse.json({ success: false, message: '상담 예약이 운영되지 않는 센터입니다.' }, { status: 400 });
  }

  const bookings = await getConsultationBookings(student.campus);
  const target = bookings.find((b) => b.id === id);
  if (!target) {
    return NextResponse.json({ success: false, message: '예약을 찾을 수 없습니다.' }, { status: 404 });
  }
  if (target.studentId !== studentId) {
    return NextResponse.json({ success: false, message: '본인 예약만 취소할 수 있습니다.' }, { status: 403 });
  }
  if (target.status !== 'booked') {
    return NextResponse.json({ success: false, message: '이미 처리된 예약은 취소할 수 없습니다.' }, { status: 403 });
  }

  const updated = await patchConsultationBooking(student.campus, id, {
    status: 'cancelled',
    cancelledAt: new Date().toISOString(),
  });
  if (!updated) {
    return NextResponse.json({ success: false, message: '예약을 찾을 수 없습니다.' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
