import { NextResponse } from 'next/server';
import { canAdminAccessStudent } from '@/lib/auth';
import { updateStudentById } from '@/lib/store';
import { isLeaveType } from '@/lib/leave';
import { appendThreadMessage } from '@/lib/thread';
import { readActivityEnvelope, writeActivityEnvelope } from '@/lib/student-activity';
import { notifyMakeupLeave } from '@/lib/makeup-ledger';
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

  const result = await updateStudentById(id, (student) => {
    student.leaveRequests = [...(student.leaveRequests || []), newRequest];
    // 즉시 승인 개인사정/병가는 "이번 주말 보강 반영" heads-up 알림(멱등). 실제 owed 는 주간 정산으로 파생.
    if (newRequest.status === 'approved') notifyMakeupLeave(student, newRequest);
  });

  if (result === 'not_found') {
    return NextResponse.json({ success: false, message: '해당 원생을 찾을 수 없습니다.' }, { status: 404 });
  }
  if (typeof result === 'string') {
    return NextResponse.json({ success: false, message: '저장이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' }, { status: 409 });
  }

  return NextResponse.json({ success: true, request: newRequest, student: result });
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

  let errorResponse: NextResponse | null = null;
  let couponBalance: number | null = null;

  const result = await updateStudentById(id, (student) => {
    // 1) 쿠폰 잔액 조정 (지급/차감)
    if (body?.couponDelta !== undefined) {
      const delta = Number(body.couponDelta);
      if (!Number.isFinite(delta) || !Number.isInteger(delta)) {
        errorResponse = NextResponse.json({ success: false, message: '쿠폰 변경값이 올바르지 않습니다.' }, { status: 400 });
        return false;
      }
      const current = student.leaveCoupons ?? 0;
      const next = Math.max(0, current + delta);
      const actualDelta = next - current;
      student.leaveCoupons = next;
      couponBalance = next;
      if (actualDelta > 0) {
        const nowIso = new Date().toISOString();
        const noteObj: any = readActivityEnvelope(student);
        if (!Array.isArray(noteObj.rewards_log)) noteObj.rewards_log = [];
        noteObj.rewards_log.push({
          date: nowIso.slice(0, 10),
          missionName: '관리자 수동 지급',
          status: 'completed',
          rewardGranted: actualDelta,
          grantedAt: nowIso,
        });
        writeActivityEnvelope(student, noteObj);
      }
      return;
    }

    // 2) 휴가 신청 승인/반려 + 코멘트
    const requestId = typeof body?.requestId === 'string' ? body.requestId : '';
    const status =
      body?.status === 'pending' ? 'pending' :
      body?.status === 'approved' ? 'approved' :
      body?.status === 'rejected' ? 'rejected' : null;
    const reply = typeof body?.reply === 'string' ? body.reply.trim() : null;

    if (!requestId) {
      errorResponse = NextResponse.json({ success: false, message: '처리 대상이 올바르지 않습니다.' }, { status: 400 });
      return false;
    }
    if (!status && reply === null) {
      errorResponse = NextResponse.json({ success: false, message: '처리 상태 또는 답변이 필요합니다.' }, { status: 400 });
      return false;
    }

    const target = (student.leaveRequests || []).find((r) => r.id === requestId);
    if (!target) {
      errorResponse = NextResponse.json({ success: false, message: '신청을 찾을 수 없습니다.' }, { status: 404 });
      return false;
    }

    const nowIso = new Date().toISOString();
    if (reply) {
      appendThreadMessage(target, { from: 'admin', text: reply, author: '코멘터' });
      target.adminReply = reply;
      target.repliedAt = nowIso;
    } else if (reply !== null) {
      target.adminReply = undefined;
      target.repliedAt = undefined;
    }
    if (status) {
      target.status = status;
      target.reviewedAt = status === 'pending' ? undefined : nowIso;
      target.acknowledgedAt = status === 'pending' ? nowIso : undefined;
      // 승인 전이 시 개인사정/병가는 "이번 주말 보강 반영" heads-up 알림(멱등 — 재승인해도 재알림 없음).
      // 정해진 반차/휴식은 알림 없음(계획이 밀림). 실제 owed 는 주간 정산으로 파생.
      if (status === 'approved') notifyMakeupLeave(student, target);
    }
  });

  if (errorResponse) return errorResponse;
  if (result === 'not_found') {
    return NextResponse.json({ success: false, message: '해당 원생을 찾을 수 없습니다.' }, { status: 404 });
  }
  if (typeof result === 'string') {
    return NextResponse.json({ success: false, message: '저장이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' }, { status: 409 });
  }

  if (couponBalance !== null) {
    return NextResponse.json({ success: true, leaveCoupons: couponBalance, student: result });
  }

  return NextResponse.json({ success: true });
}
