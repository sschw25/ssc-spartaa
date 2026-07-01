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

// PATCH: 시간 변경 흐름. body { action, id, date?, slot?, reason? }
//  - request      : 학생이 새 시간 제안 → 관리자 승인 대기 (reschedule.by='student')
//  - cancel        : 학생이 본인 제안 철회
//  - approve      : 관리자 제안(reschedule.by='admin')을 학생이 수락 → 예약 시간 적용
//  - reject       : 관리자 제안을 학생이 거절 → 제안 폐기
export async function PATCH(req: NextRequest) {
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

  let body: { action?: unknown; id?: unknown; date?: unknown; slot?: unknown; reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }
  const action = String(body?.action ?? '').trim();
  const id = String(body?.id ?? '').trim();
  if (!id) {
    return NextResponse.json({ success: false, message: '대상 예약이 없습니다.' }, { status: 400 });
  }

  const bookings = await getConsultationBookings(student.campus);
  const target = bookings.find((b) => b.id === id);
  if (!target) {
    return NextResponse.json({ success: false, message: '예약을 찾을 수 없습니다.' }, { status: 404 });
  }
  if (target.studentId !== studentId) {
    return NextResponse.json({ success: false, message: '본인 예약만 변경할 수 있습니다.' }, { status: 403 });
  }
  if (target.status !== 'booked' || target.kind !== 'regular') {
    return NextResponse.json({ success: false, message: '진행 중인 정규 예약만 변경할 수 있습니다.' }, { status: 409 });
  }

  const blackouts = await getConsultationBlackouts(student.campus);
  const calendar = getBookableCalendar(student.campus, kstToday(), kstNowHHMM(), bookings, blackouts);

  if (action === 'request') {
    const date = String(body?.date ?? '').trim();
    const slot = String(body?.slot ?? '').trim();
    const reason = String(body?.reason ?? '').trim().slice(0, 300);
    if (!date || !slot) {
      return NextResponse.json({ success: false, message: '변경할 날짜와 시간을 선택해 주세요.' }, { status: 400 });
    }
    if (date === target.date && slot === target.slot) {
      return NextResponse.json({ success: false, message: '현재 예약과 같은 시간이에요.' }, { status: 400 });
    }
    const day = calendar.find((d) => d.date === date);
    if (!day || !day.freeSlots.includes(slot)) {
      return NextResponse.json({ success: false, message: '지금 예약 가능한 시간이 아니에요. 새로고침 후 다시 선택해 주세요.' }, { status: 409 });
    }
    const updated = await patchConsultationBooking(student.campus, id, {
      reschedule: {
        by: 'student',
        date,
        slot,
        weekday: day.weekday,
        counselor: day.counselor,
        ...(reason ? { reason } : {}),
        requestedAt: new Date().toISOString(),
      },
    });
    if (!updated || updated === 'taken') {
      return NextResponse.json({ success: false, message: '변경 요청에 실패했어요. 다시 시도해 주세요.' }, { status: 409 });
    }
    return NextResponse.json({ success: true, booking: updated });
  }

  if (action === 'cancel') {
    if (target.reschedule?.by !== 'student') {
      return NextResponse.json({ success: false, message: '철회할 변경 요청이 없어요.' }, { status: 409 });
    }
    const updated = await patchConsultationBooking(student.campus, id, { reschedule: undefined });
    if (!updated || updated === 'taken') {
      return NextResponse.json({ success: false, message: '처리에 실패했어요. 다시 시도해 주세요.' }, { status: 409 });
    }
    return NextResponse.json({ success: true, booking: updated });
  }

  if (action === 'reject') {
    if (target.reschedule?.by !== 'admin') {
      return NextResponse.json({ success: false, message: '응답할 변경 제안이 없어요.' }, { status: 409 });
    }
    const updated = await patchConsultationBooking(student.campus, id, { reschedule: undefined });
    if (!updated || updated === 'taken') {
      return NextResponse.json({ success: false, message: '처리에 실패했어요. 다시 시도해 주세요.' }, { status: 409 });
    }
    return NextResponse.json({ success: true, booking: updated });
  }

  if (action === 'approve') {
    const rs = target.reschedule;
    if (rs?.by !== 'admin') {
      return NextResponse.json({ success: false, message: '응답할 변경 제안이 없어요.' }, { status: 409 });
    }
    // 승인 시점 재검증: 제안한 시간이 여전히 비어 있고 운영 중인지 확인.
    const day = calendar.find((d) => d.date === rs.date);
    if (!day || !day.freeSlots.includes(rs.slot)) {
      return NextResponse.json({ success: false, message: '제안된 시간이 마감되었어요. 거절 후 다른 시간을 협의해 주세요.' }, { status: 409 });
    }
    const updated = await patchConsultationBooking(student.campus, id, {
      date: rs.date,
      slot: rs.slot,
      weekday: day.weekday,
      counselor: day.counselor,
      reschedule: undefined,
    });
    if (updated === 'taken') {
      return NextResponse.json({ success: false, message: '방금 마감된 시간이에요. 거절 후 다른 시간을 협의해 주세요.' }, { status: 409 });
    }
    if (!updated) {
      return NextResponse.json({ success: false, message: '예약을 찾을 수 없습니다.' }, { status: 404 });
    }
    return NextResponse.json({ success: true, booking: updated });
  }

  return NextResponse.json({ success: false, message: '알 수 없는 요청입니다.' }, { status: 400 });
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
    cancelledBy: 'student',
  });
  if (!updated) {
    return NextResponse.json({ success: false, message: '예약을 찾을 수 없습니다.' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
