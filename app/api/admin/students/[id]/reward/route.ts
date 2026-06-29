import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { getStudentById, patchStudentProgress } from '@/lib/store';
import { getRewardMeta, REWARD_CATALOG } from '@/lib/leave';
import type { RewardRedemption, RewardType } from '@/lib/types/student';

// 관리자: 쿠폰 → 리워드 교환 (반차권/휴식권/상품권/플래너)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  const { id } = await params;

  let body: { rewardType?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const rewardType = String(body?.rewardType ?? '') as RewardType;
  const meta = getRewardMeta(rewardType);
  if (!meta) {
    return NextResponse.json({ success: false, message: '리워드 종류가 올바르지 않습니다.' }, { status: 400 });
  }

  const nowIso = new Date().toISOString();

  // optimistic locking: conflict 시 fresh 재조회·재시도 (쿠폰 동시 차감/유실 방지)
  for (let attempt = 0; attempt < 2; attempt++) {
    const student = await getStudentById(id);
    if (!student) {
      return NextResponse.json({ success: false, message: '해당 원생을 찾을 수 없습니다.' }, { status: 404 });
    }
    if (session.campus !== 'all' && student.campus !== session.campus) {
      return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });
    }
    const originalUpdatedAt = student.updatedAt ?? '';

    const balance = student.leaveCoupons ?? 0;
    if (balance < meta.cost) {
      return NextResponse.json({ success: false, message: `쿠폰이 부족합니다. (보유 ${balance} / 필요 ${meta.cost})` }, { status: 400 });
    }

    const redemption: RewardRedemption = {
      id: `rwd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: rewardType,
      cost: meta.cost,
      // 상품권/플래너(physical)는 지급 대기, 반차권/휴식권은 즉시 처리 완료
      status: meta.physical ? 'pending' : 'fulfilled',
      createdAt: nowIso,
      fulfilledAt: meta.physical ? undefined : nowIso,
      handledBy: session.username,
    };

    student.leaveCoupons = balance - meta.cost;
    student.rewardRedemptions = [redemption, ...(student.rewardRedemptions || [])];
    const saved = await patchStudentProgress(student, originalUpdatedAt);
    if (saved === 'conflict') continue;

    return NextResponse.json({ success: true, redemption, leaveCoupons: student.leaveCoupons });
  }

  return NextResponse.json(
    { success: false, message: '교환 처리 충돌이 발생했습니다. 다시 시도해주세요.' },
    { status: 409 },
  );
}

// 관리자: 리워드 지급완료 처리 (상품권 번호/플래너 지급일 기록) 또는 교환 취소(쿠폰 환불)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  const { id } = await params;

  let body: { redemptionId?: unknown; voucherCode?: unknown; note?: unknown; cancel?: unknown; approve?: unknown; reject?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const redemptionId = String(body?.redemptionId ?? '');
  if (!redemptionId) {
    return NextResponse.json({ success: false, message: '처리 대상이 올바르지 않습니다.' }, { status: 400 });
  }

  // optimistic locking: conflict 시 fresh 재조회·재시도 (승인 차감/취소 환불이 동시 저장에 유실되지 않게)
  for (let attempt = 0; attempt < 2; attempt++) {
  const student = await getStudentById(id);
  if (!student) {
    return NextResponse.json({ success: false, message: '해당 원생을 찾을 수 없습니다.' }, { status: 404 });
  }
  if (session.campus !== 'all' && student.campus !== session.campus) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });
  }
  const originalUpdatedAt = student.updatedAt ?? '';

  const target = (student.rewardRedemptions || []).find((r) => r.id === redemptionId);
  if (!target) {
    return NextResponse.json({ success: false, message: '교환 내역을 찾을 수 없습니다.' }, { status: 404 });
  }

  // 학생 교환 신청 승인 — 지금 쿠폰 차감 후 상태 전환 (물품은 지급대기, 반차/휴식권은 즉시 완료)
  if (body?.approve === true) {
    if (target.status !== 'requested') {
      return NextResponse.json({ success: false, message: '이미 처리된 신청입니다.' }, { status: 400 });
    }
    const balance = student.leaveCoupons ?? 0;
    if (balance < target.cost) {
      return NextResponse.json({ success: false, message: `쿠폰이 부족합니다. (보유 ${balance} / 필요 ${target.cost})` }, { status: 400 });
    }
    const meta = getRewardMeta(target.type);
    const nowIso = new Date().toISOString();
    student.leaveCoupons = balance - target.cost;
    target.status = meta?.physical ? 'pending' : 'fulfilled';
    target.approvedAt = nowIso;
    target.handledBy = session.username;
    if (!meta?.physical) target.fulfilledAt = nowIso;
    student.rewardRedemptions = (student.rewardRedemptions || []).map((r) => (r.id === redemptionId ? target : r));
    const saved = await patchStudentProgress(student, originalUpdatedAt);
    if (saved === 'conflict') continue;
    return NextResponse.json({ success: true, redemption: target, leaveCoupons: student.leaveCoupons });
  }

  // 학생 교환 신청 반려 — 미차감이므로 환불 없이 상태만 rejected
  if (body?.reject === true) {
    target.status = 'rejected';
    target.handledBy = session.username;
    student.rewardRedemptions = (student.rewardRedemptions || []).map((r) => (r.id === redemptionId ? target : r));
    const saved = await patchStudentProgress(student, originalUpdatedAt);
    if (saved === 'conflict') continue;
    return NextResponse.json({ success: true, redemption: target });
  }

  // 교환 취소 — 차감됐던 경우에만 쿠폰 환불 후 내역 제거 (지급 전에만 가능)
  if (body?.cancel === true) {
    if (target.status === 'fulfilled' && getRewardMeta(target.type)?.physical) {
      return NextResponse.json({ success: false, message: '이미 지급 완료된 리워드는 취소할 수 없습니다.' }, { status: 400 });
    }
    const wasDeducted = target.status === 'pending' || target.status === 'fulfilled';
    if (wasDeducted) student.leaveCoupons = (student.leaveCoupons ?? 0) + target.cost;
    student.rewardRedemptions = (student.rewardRedemptions || []).filter((r) => r.id !== redemptionId);
    const saved = await patchStudentProgress(student, originalUpdatedAt);
    if (saved === 'conflict') continue;
    return NextResponse.json({ success: true, leaveCoupons: student.leaveCoupons });
  }

  // 지급완료 처리
  target.status = 'fulfilled';
  target.fulfilledAt = new Date().toISOString();
  target.handledBy = session.username;
  if (typeof body?.voucherCode === 'string') target.voucherCode = body.voucherCode.trim() || undefined;
  if (typeof body?.note === 'string') target.note = body.note.trim() || undefined;

  student.rewardRedemptions = (student.rewardRedemptions || []).map((r) => (r.id === redemptionId ? target : r));
  const saved = await patchStudentProgress(student, originalUpdatedAt);
  if (saved === 'conflict') continue;

  return NextResponse.json({ success: true, redemption: target });
  }

  return NextResponse.json(
    { success: false, message: '처리 충돌이 발생했습니다. 다시 시도해주세요.' },
    { status: 409 },
  );
}
