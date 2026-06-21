import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { getStudentById, saveStudent } from '@/lib/store';

// 관리자: 휴가 신청 승인/반려(+코멘트) 또는 학생 쿠폰 잔액 조정
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  const { id } = await params;

  let body: { requestId?: unknown; status?: unknown; reply?: unknown; couponDelta?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const student = await getStudentById(id);
  if (!student) {
    return NextResponse.json({ success: false, message: '해당 원생을 찾을 수 없습니다.' }, { status: 404 });
  }

  // 1) 쿠폰 잔액 조정 (지급/차감)
  if (body?.couponDelta !== undefined) {
    const delta = Number(body.couponDelta);
    if (!Number.isFinite(delta) || !Number.isInteger(delta)) {
      return NextResponse.json({ success: false, message: '쿠폰 변경값이 올바르지 않습니다.' }, { status: 400 });
    }
    const next = Math.max(0, (student.leaveCoupons ?? 0) + delta);
    student.leaveCoupons = next;
    await saveStudent(student);
    return NextResponse.json({ success: true, leaveCoupons: next });
  }

  // 2) 휴가 신청 승인/반려 + 코멘트
  const requestId = typeof body?.requestId === 'string' ? body.requestId : '';
  const status =
    body?.status === 'pending' ? 'pending' :
    body?.status === 'approved' ? 'approved' :
    body?.status === 'rejected' ? 'rejected' : null;
  const reply = typeof body?.reply === 'string' ? body.reply.trim() : null;

  if (!requestId) {
    return NextResponse.json({ success: false, message: '처리 대상이 올바르지 않습니다.' }, { status: 400 });
  }
  if (!status && reply === null) {
    return NextResponse.json({ success: false, message: '처리 상태 또는 답변이 필요합니다.' }, { status: 400 });
  }

  const target = (student.leaveRequests || []).find((r) => r.id === requestId);
  if (!target) {
    return NextResponse.json({ success: false, message: '신청을 찾을 수 없습니다.' }, { status: 404 });
  }

  const nowIso = new Date().toISOString();
  if (reply !== null) {
    target.adminReply = reply || undefined;
  }
  if (status) {
    target.status = status;
    target.reviewedAt = status === 'pending' ? undefined : nowIso;
  }
  await saveStudent(student);

  return NextResponse.json({ success: true });
}
