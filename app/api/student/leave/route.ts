import { NextRequest, NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { getStudentById, patchStudentProgress } from '@/lib/store';
import type { LeaveRequest } from '@/lib/types/student';
import {
  LEAVE_TYPES,
  getLeaveTypeLabel,
  getMonthlyLeaveUsage,
  getLeaveCredits,
  exceedsMonthlyQuota,
  isLeaveType,
  isValidSlotFor,
  leaveNeedsSlot,
  yearMonthOf,
  MONTHLY_HALFDAY_QUOTA,
} from '@/lib/leave';
import type { LeaveSlot } from '@/lib/leave';

// 학생이 휴가/반차/휴식권/병가를 신청
export async function POST(req: NextRequest) {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }

  let body: { type?: unknown; slot?: unknown; date?: unknown; reason?: unknown; urgent?: unknown; reappealId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  // 반려된 신청에 대한 재승인 요청 — 같은 신청을 다시 '대기중'으로 되돌리고 메시지를 첨부
  if (typeof body?.reappealId === 'string' && body.reappealId) {
    const reappealId = body.reappealId;
    const note = String(body?.reason ?? '').trim().slice(0, 500);
    // 낙관적 잠금 재시도 — 동시 저장에 덮이지 않게 fresh 재조회 후 조건부 저장
    for (let attempt = 0; attempt < 3; attempt++) {
      const student = await getStudentById(studentId);
      if (!student) {
        return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
      }
      const originalUpdatedAt = student.updatedAt ?? '';
      const target = (student.leaveRequests || []).find((r) => r.id === reappealId);
      if (!target) {
        return NextResponse.json({ success: false, message: '신청을 찾을 수 없습니다.' }, { status: 404 });
      }
      if (target.status !== 'rejected') {
        return NextResponse.json({ success: false, message: '반려된 신청만 재승인 요청할 수 있습니다.' }, { status: 403 });
      }
      const nowIso = new Date().toISOString();
      target.status = 'pending';
      target.reviewedAt = undefined;
      target.adminReply = undefined;
      target.reappealedAt = nowIso;
      target.reappealReason = note || undefined;
      const saved = await patchStudentProgress(student, originalUpdatedAt);
      if (saved === 'conflict') continue;
      return NextResponse.json({ success: true, request: target });
    }
    return NextResponse.json({ success: false, message: '저장이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' }, { status: 409 });
  }

  if (!isLeaveType(body?.type)) {
    return NextResponse.json({ success: false, message: '휴가 종류가 올바르지 않습니다.' }, { status: 400 });
  }
  const type = body.type;
  // 개인사정 반차·병가는 시간대(slot) 선택 필수
  let slot: LeaveSlot | undefined;
  if (leaveNeedsSlot(type)) {
    if (!isValidSlotFor(type, body?.slot)) {
      return NextResponse.json({ success: false, message: '시간대를 선택해 주세요.' }, { status: 400 });
    }
    slot = body.slot;
  }
  const date = String(body?.date ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ success: false, message: '사용 희망일을 선택해 주세요.' }, { status: 400 });
  }
  const reason = String(body?.reason ?? '').trim().slice(0, 500);
  const urgent = !!body?.urgent;

  // 낙관적 잠금 재시도 — 동시 저장(체크리스트/쿠폰/관리자 처리)에 휴가 신청이 덮이지 않게
  // fresh 재조회 후 중복·한도 검사를 다시 수행하고 updated_at 조건부로 저장한다.
  for (let attempt = 0; attempt < 3; attempt++) {
    const student = await getStudentById(studentId);
    if (!student) {
      return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
    }
    const originalUpdatedAt = student.updatedAt ?? '';

    // 같은 날짜에 이미 처리되지 않은(대기/승인) 신청이 있으면 중복 방지
    const existing = student.leaveRequests || [];
    const dup = existing.find((r) => r.date === date && r.type === type && r.status !== 'rejected');
    if (dup) {
      return NextResponse.json({ success: false, message: '같은 날짜에 이미 신청한 내역이 있습니다.' }, { status: 409 });
    }

    // 월 한도 검사 (병가는 한도 무관). 기본 한도 초과 시 교환 추가권(반차권/휴식권)으로 충당, 없으면 차단.
    const usage = getMonthlyLeaveUsage(existing, yearMonthOf(date));
    const category = LEAVE_TYPES[type].category;
    const isHalfday = category === 'halfday';
    const halfLeft = isHalfday ? Math.max(0, MONTHLY_HALFDAY_QUOTA - usage.halfday) : 0;

    let usedCredit = false;
    if (exceedsMonthlyQuota(type, usage)) {
      // 기본 월 한도 초과 — 교환해 둔 추가권이 있으면 그것으로 충당
      const credits = getLeaveCredits(student.rewardRedemptions, existing);
      const creditLeft = category === 'halfday' ? credits.halfday : category === 'fullday' ? credits.fullday : 0;
      if (creditLeft > 0) {
        usedCredit = true;
      } else {
        const label = getLeaveTypeLabel(type);
        const guide =
          isHalfday
            ? '이번 달 반차를 모두 사용했어요. 쿠폰을 반차권으로 교환하면 추가로 신청할 수 있어요.'
            : '이번 달 휴식권을 모두 사용했어요. 쿠폰을 휴식권으로 교환하면 추가로 신청할 수 있어요.';
        return NextResponse.json({ success: false, code: 'QUOTA_EXCEEDED', message: `${label} · ${guide}` }, { status: 403 });
      }
    }

    const nowIso = new Date().toISOString();
    // 반차(기본 잔여 or 추가권)는 자동 승인. 휴식권은 추가권이어도 관리자 승인 유지.
    const autoApprove = isHalfday && (halfLeft > 0 || usedCredit);

    const request: LeaveRequest = {
      id: `leave_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type,
      ...(slot ? { slot } : {}),
      date,
      reason: reason || undefined,
      status: autoApprove ? 'approved' : 'pending',
      ...(autoApprove ? { autoApproved: true } : {}),
      urgent,
      ...(usedCredit ? { usedCredit: true } : {}),
      createdAt: nowIso,
      ...(autoApprove ? { reviewedAt: nowIso, adminReply: usedCredit ? '교환한 반차권으로 자동 승인되었습니다.' : '이번 달 잔여 반차 한도가 있어 자동 승인되었습니다.' } : {}),
    };
    student.leaveRequests = [...existing, request];

    const saved = await patchStudentProgress(student, originalUpdatedAt);
    if (saved === 'conflict') continue;
    return NextResponse.json({ success: true, request });
  }
  return NextResponse.json({ success: false, message: '저장이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' }, { status: 409 });
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

  // 낙관적 잠금 재시도 — 동시 저장에 덮이지 않게 fresh 재조회 후 조건부 저장
  for (let attempt = 0; attempt < 3; attempt++) {
    const student = await getStudentById(studentId);
    if (!student) {
      return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
    }
    const originalUpdatedAt = student.updatedAt ?? '';

    const target = (student.leaveRequests || []).find((r) => r.id === id);
    if (!target) {
      return NextResponse.json({ success: false, message: '신청을 찾을 수 없습니다.' }, { status: 404 });
    }
    if (target.status !== 'pending') {
      return NextResponse.json({ success: false, message: '이미 처리된 신청은 취소할 수 없습니다.' }, { status: 403 });
    }

    student.leaveRequests = (student.leaveRequests || []).filter((r) => r.id !== id);

    const saved = await patchStudentProgress(student, originalUpdatedAt);
    if (saved === 'conflict') continue;
    return NextResponse.json({ success: true });
  }
  return NextResponse.json({ success: false, message: '저장이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' }, { status: 409 });
}
