import { NextRequest, NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { getStudentById, saveStudent } from '@/lib/store';
import type { LeaveRequest } from '@/lib/types/student';
import {
  LEAVE_TYPES,
  getLeaveTypeLabel,
  getMonthlyLeaveUsage,
  exceedsMonthlyQuota,
  isLeaveType,
  yearMonthOf,
  MONTHLY_HALFDAY_QUOTA,
} from '@/lib/leave';

// 학생이 휴가/반차/휴식권/병가를 신청
export async function POST(req: NextRequest) {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }

  let body: { type?: unknown; date?: unknown; reason?: unknown; urgent?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  if (!isLeaveType(body?.type)) {
    return NextResponse.json({ success: false, message: '휴가 종류가 올바르지 않습니다.' }, { status: 400 });
  }
  const type = body.type;
  const date = String(body?.date ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ success: false, message: '사용 희망일을 선택해 주세요.' }, { status: 400 });
  }
  const reason = String(body?.reason ?? '').trim().slice(0, 500);
  const urgent = !!body?.urgent;

  const student = await getStudentById(studentId);
  if (!student) {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }

  // 같은 날짜에 이미 처리되지 않은(대기/승인) 신청이 있으면 중복 방지
  const existing = student.leaveRequests || [];
  const dup = existing.find((r) => r.date === date && r.type === type && r.status !== 'rejected');
  if (dup) {
    return NextResponse.json({ success: false, message: '같은 날짜에 이미 신청한 내역이 있습니다.' }, { status: 409 });
  }

  // 월 한도 검사 (병가는 한도 무관). 초과 시 쿠폰/밴드채팅 안내와 함께 차단.
  const usage = getMonthlyLeaveUsage(existing, yearMonthOf(date));
  const isHalfday = LEAVE_TYPES[type].category === 'halfday';
  const halfLeft = isHalfday ? Math.max(0, MONTHLY_HALFDAY_QUOTA - usage.halfday) : 0;

  if (exceedsMonthlyQuota(type, usage)) {
    const label = getLeaveTypeLabel(type);
    const guide =
      isHalfday
        ? '이번 달 반차를 모두 사용했어요. 추가가 필요하면 쿠폰 3개로 신청 가능합니다 — 밴드 채팅으로 문의 후 쿠폰을 제출해 주세요.'
        : '이번 달 휴식권을 모두 사용했어요. 추가가 필요하면 밴드 채팅으로 문의해 주세요.';
    return NextResponse.json({ success: false, code: 'QUOTA_EXCEEDED', message: `${label} · ${guide}` }, { status: 403 });
  }

  const nowIso = new Date().toISOString();
  const autoApprove = isHalfday && halfLeft > 0;

  const request: LeaveRequest = {
    id: `leave_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    date,
    reason: reason || undefined,
    status: autoApprove ? 'approved' : 'pending',
    urgent,
    createdAt: nowIso,
    ...(autoApprove ? { reviewedAt: nowIso, adminReply: '잔여 반차권이 존재하여 자동 승인되었습니다.' } : {}),
  };
  student.leaveRequests = [...existing, request];
  await saveStudent(student);

  return NextResponse.json({ success: true, request });
}

// 학생이 본인이 올린 '대기중' 신청을 취소
export async function DELETE(req: NextRequest) {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }
  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ success: false, message: '취소할 신청이 없습니다.' }, { status: 400 });
  }

  const student = await getStudentById(studentId);
  if (!student) {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }

  const target = (student.leaveRequests || []).find((r) => r.id === id);
  if (!target) {
    return NextResponse.json({ success: false, message: '신청을 찾을 수 없습니다.' }, { status: 404 });
  }
  if (target.status !== 'pending') {
    return NextResponse.json({ success: false, message: '이미 처리된 신청은 취소할 수 없습니다.' }, { status: 403 });
  }

  student.leaveRequests = (student.leaveRequests || []).filter((r) => r.id !== id);
  await saveStudent(student);

  return NextResponse.json({ success: true });
}
