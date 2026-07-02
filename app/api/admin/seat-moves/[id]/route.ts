import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import {
  getSeatMoveRequests,
  getStudentById,
  getStudentsSummary,
  patchStudentProfile,
  updateSeatMoveRequest,
} from '@/lib/store';
import { canMutateCampusScopedResource } from '@/lib/campus-scope';
import { isCampusKey } from '@/lib/seat-layouts';
import type { SeatMoveRequest } from '@/lib/types/student';

async function findRequest(
  campus: string,
  id: string,
): Promise<SeatMoveRequest | null> {
  const list = await getSeatMoveRequests(campus);
  return list.find((r) => r.id === id) || null;
}

// 승인: 좌석 점유 재검증 → 학생 seat_number 타깃 컬럼 이동 → 원장 status='approved'.
// 좌석 이동을 먼저 확정하고 원장을 갱신한다(원장만 승인되고 좌석은 안 움직인 상태 방지).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  const { id } = await params;

  let body: { campus?: unknown };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const campus = String(body?.campus ?? '');
  if (!isCampusKey(campus) || !canMutateCampusScopedResource(session.campus, campus)) {
    return NextResponse.json({ success: false, message: '접근 권한이 없는 캠퍼스입니다.' }, { status: 403 });
  }

  const request = await findRequest(campus, id);
  if (!request) {
    return NextResponse.json({ success: false, message: '신청을 찾을 수 없습니다.' }, { status: 404 });
  }
  if (request.status !== 'pending') {
    return NextResponse.json({ success: false, message: '이미 처리된 신청입니다.' }, { status: 409 });
  }

  const student = await getStudentById(request.studentId);
  if (!student) {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }
  if (student.campus !== campus) {
    return NextResponse.json({ success: false, message: '학생의 캠퍼스가 변경되어 승인할 수 없습니다. 신청을 거절해 주세요.' }, { status: 409 });
  }

  // 승인 시점 점유 재검증 — 신청 이후 다른 학생이 배정됐을 수 있다. (campus/seat_number 만 필요)
  const students = await getStudentsSummary();
  const taken = students.some(
    (s) => s.campus === campus && s.seatNumber === request.toSeat && s.id !== student.id,
  );
  if (taken) {
    return NextResponse.json({ success: false, message: `${request.toSeat}번 자리에 이미 다른 학생이 배정되어 있어요. 확인 후 거절 처리해 주세요.` }, { status: 409 });
  }

  try {
    await patchStudentProfile({ ...student, seatNumber: request.toSeat });
  } catch {
    return NextResponse.json({ success: false, message: '좌석 이동 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.' }, { status: 500 });
  }

  const updated = await updateSeatMoveRequest(campus, id, (r) =>
    r.status === 'pending' ? { ...r, status: 'approved', processedAt: new Date().toISOString() } : false,
  );
  if (!updated) {
    // 좌석 이동 직후 학생이 신청을 취소한 좁은 레이스 — 이동은 이미 확정됐으므로 성공으로 처리하되 기록만 남긴다.
    console.warn(`[seat-moves] 승인 처리 중 신청(${id})이 사라짐(학생 취소 추정) — 좌석 이동은 완료됨: ${request.studentName} → ${request.toSeat}번`);
  }
  return NextResponse.json({ success: true, request: updated });
}

// 거절: 원장 status='rejected' (+선택 사유). 좌석은 변경하지 않는다.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  const { id } = await params;

  const campus = req.nextUrl.searchParams.get('campus') ?? '';
  if (!isCampusKey(campus) || !canMutateCampusScopedResource(session.campus, campus)) {
    return NextResponse.json({ success: false, message: '접근 권한이 없는 캠퍼스입니다.' }, { status: 403 });
  }
  const reason = String(req.nextUrl.searchParams.get('reason') ?? '').trim().slice(0, 200);

  const updated = await updateSeatMoveRequest(campus, id, (r) =>
    r.status === 'pending'
      ? { ...r, status: 'rejected', processedAt: new Date().toISOString(), ...(reason ? { rejectReason: reason } : {}) }
      : false,
  );
  if (!updated) {
    return NextResponse.json({ success: false, message: '대기 중인 신청을 찾을 수 없습니다.' }, { status: 404 });
  }
  return NextResponse.json({ success: true, request: updated });
}
