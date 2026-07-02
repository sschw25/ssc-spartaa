import { NextRequest, NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import {
  addSeatMoveRequest,
  getSeatMoveRequests,
  getStudentById,
  getStudentsSummary,
  removeSeatMoveRequest,
} from '@/lib/store';
import { getCampusSeatNumbers, isCampusKey } from '@/lib/seat-layouts';
import { rateLimit } from '@/lib/rate-limit';
import type { SeatMoveRequest } from '@/lib/types/student';

// 학생에게 내려보내는 신청 정보 — studentName 등 타인 정보는 절대 포함하지 않는다.
function toClientRequest(r: SeatMoveRequest) {
  return {
    id: r.id,
    fromSeat: r.fromSeat,
    toSeat: r.toSeat,
    status: r.status,
    createdAt: r.createdAt,
    processedAt: r.processedAt,
    rejectReason: r.rejectReason,
  };
}

// 익명 배치도 데이터: 좌석번호 점유 여부만 내려준다(이름·학생 id 미포함 — 익명화는 서버 책임).
export async function GET() {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }
  const me = await getStudentById(studentId);
  if (!me) {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }
  if (!isCampusKey(me.campus)) {
    return NextResponse.json({ success: false, message: '좌석 배치도가 없는 캠퍼스입니다.' }, { status: 400 });
  }

  const [students, requests] = await Promise.all([
    getStudentsSummary(), // campus/seat_number 만 필요 — full jsonb 조회 회피
    getSeatMoveRequests(me.campus),
  ]);
  const occupied = students
    .filter((s) => s.campus === me.campus && s.seatNumber != null && s.id !== me.id)
    .map((s) => s.seatNumber as number);
  const pendingSeats = requests
    .filter((r) => r.status === 'pending' && r.studentId !== me.id)
    .map((r) => r.toSeat);
  const mine = requests
    .filter((r) => r.studentId === me.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return NextResponse.json({
    success: true,
    campus: me.campus,
    mySeat: me.seatNumber ?? null,
    occupied: Array.from(new Set(occupied)),
    pendingSeats: Array.from(new Set(pendingSeats)),
    myRequest: mine[0] ? toClientRequest(mine[0]) : null,
  });
}

// 자리이동 신청. 대기중 신청은 학생당 1건.
export async function POST(req: NextRequest) {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }
  const limited = rateLimit(`seat-move:${studentId}`, 5, 10 * 60 * 1000);
  if (!limited.allowed) {
    return NextResponse.json({ success: false, message: '신청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.' }, { status: 429 });
  }

  let body: { toSeat?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }
  const toSeat = Number(body?.toSeat);
  if (!Number.isInteger(toSeat) || toSeat <= 0) {
    return NextResponse.json({ success: false, message: '이동할 좌석을 선택해 주세요.' }, { status: 400 });
  }

  const me = await getStudentById(studentId);
  if (!me) {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }
  if (!isCampusKey(me.campus)) {
    return NextResponse.json({ success: false, message: '좌석 배치도가 없는 캠퍼스입니다.' }, { status: 400 });
  }
  if (!getCampusSeatNumbers(me.campus).has(toSeat)) {
    return NextResponse.json({ success: false, message: '존재하지 않는 좌석입니다.' }, { status: 400 });
  }
  if (me.seatNumber === toSeat) {
    return NextResponse.json({ success: false, message: '지금 사용 중인 자리예요.' }, { status: 400 });
  }

  // 점유 검증 — 배치도와 동일하게 학생 좌석번호 기준. (campus/seat_number 만 필요 — 요약 조회)
  const students = await getStudentsSummary();
  const takenByStudent = students.some(
    (s) => s.campus === me.campus && s.seatNumber === toSeat && s.id !== me.id,
  );
  if (takenByStudent) {
    return NextResponse.json({ success: false, message: '이미 사용 중인 자리예요. 다른 자리를 선택해 주세요.' }, { status: 409 });
  }

  const request: SeatMoveRequest = {
    id: `smv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    studentId: me.id,
    studentName: me.name,
    campus: me.campus,
    fromSeat: me.seatNumber ?? null,
    toSeat,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  let result: Awaited<ReturnType<typeof addSeatMoveRequest>>;
  try {
    result = await addSeatMoveRequest(request);
  } catch {
    return NextResponse.json({ success: false, message: '저장이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' }, { status: 409 });
  }
  if (result === 'duplicate') {
    return NextResponse.json({ success: false, message: '이미 대기 중인 자리이동 신청이 있어요. 기존 신청을 취소한 뒤 다시 신청해 주세요.' }, { status: 409 });
  }
  if (result === 'taken') {
    return NextResponse.json({ success: false, message: '다른 학생이 먼저 신청한 자리예요. 다른 자리를 선택해 주세요.' }, { status: 409 });
  }

  return NextResponse.json({ success: true, request: toClientRequest(result) });
}

// 본인 신청 취소(pending) 또는 처리 결과 확인 후 목록에서 제거(approved/rejected).
export async function DELETE(req: NextRequest) {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }
  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ success: false, message: '취소할 신청이 없습니다.' }, { status: 400 });
  }
  const me = await getStudentById(studentId);
  if (!me || !isCampusKey(me.campus)) {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }

  const requests = await getSeatMoveRequests(me.campus);
  const target = requests.find((r) => r.id === id);
  if (!target || target.studentId !== me.id) {
    return NextResponse.json({ success: false, message: '신청을 찾을 수 없습니다.' }, { status: 404 });
  }

  await removeSeatMoveRequest(me.campus, id);
  return NextResponse.json({ success: true });
}
