import { NextResponse } from 'next/server';
import { canAdminAccessStudent } from '@/lib/auth';
import { getStudentById, saveStudent } from '@/lib/store';
import { isLeaveType } from '@/lib/leave';
import { appendThreadMessage } from '@/lib/thread';
import type { LeaveRequest } from '@/lib/types/student';

// 관리자: 학생 대신 휴가/반차 수기 등록 (쿼터 무시, 즉시 승인 가능)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!(await canAdminAccessStudent(id))) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });
  }

  let body: { type?: unknown; date?: unknown; reason?: unknown; status?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  if (!isLeaveType(body?.type)) {
    return NextResponse.json({ success: false, message: '휴가 종류가 올바르지 않습니다.' }, { status: 400 });
  }
  const type = body.type;
  const date = String(body?.date ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ success: false, message: '날짜 형식이 올바르지 않습니다.' }, { status: 400 });
  }
  const reason = String(body?.reason ?? '').trim().slice(0, 500);
  const status = body?.status === 'approved' ? 'approved' : 'pending';

  const student = await getStudentById(id);
  if (!student) {
    return NextResponse.json({ success: false, message: '해당 원생을 찾을 수 없습니다.' }, { status: 404 });
  }

  const nowIso = new Date().toISOString();
  const newRequest: LeaveRequest = {
    id: `leave_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    date,
    reason: reason || undefined,
    status,
    source: 'admin',
    createdAt: nowIso,
    reviewedAt: status === 'approved' ? nowIso : undefined,
  };
  student.leaveRequests = [...(student.leaveRequests || []), newRequest];
  await saveStudent(student);

  return NextResponse.json({ success: true, request: newRequest, student });
}

// 관리자: 휴가 신청 승인/반려(+코멘트) 또는 학생 쿠폰 잔액 조정
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!(await canAdminAccessStudent(id))) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });
  }

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
  if (reply) {
    appendThreadMessage(target, { from: 'admin', text: reply, author: '코멘터' });
    target.adminReply = reply;
  } else if (reply !== null) {
    target.adminReply = undefined;
  }
  if (status) {
    target.status = status;
    target.reviewedAt = status === 'pending' ? undefined : nowIso;
    target.acknowledgedAt = status === 'pending' ? nowIso : undefined;
  }
  await saveStudent(student);

  return NextResponse.json({ success: true });
}
