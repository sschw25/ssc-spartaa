import { NextRequest, NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { getStudentById, saveStudent, patchStudentProgress } from '@/lib/store';
import { getRewardMeta } from '@/lib/leave';
import type { RewardRedemption, RewardType } from '@/lib/types/student';

// 학생: 쿠폰 → 리워드 교환.
//  · 반차권/휴식권(디지털): 즉시 교환 — 쿠폰 즉시 차감, status 'fulfilled' (관리자 개입 없음)
//  · 상품권/플래너(실물): 교환 신청 — 미차감, status 'requested' → 관리자 인박스 승인 시 차감·지급
export async function POST(req: NextRequest) {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }

  let body: { rewardType?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const rewardType = String(body?.rewardType ?? '') as RewardType;
  const meta = getRewardMeta(rewardType);
  if (!meta) {
    return NextResponse.json({ success: false, message: '교환 종류가 올바르지 않습니다.' }, { status: 400 });
  }

  const nowIso = new Date().toISOString();

  // optimistic locking: 최대 2회 시도, conflict 시 fresh 데이터로 재검증·재시도.
  // 쿠폰은 환금성 인앱 통화 → 더블클릭/다중탭/적립과의 동시 저장으로 잔액·교환내역이 유실되지 않게 한다.
  for (let attempt = 0; attempt < 2; attempt++) {
    const student = await getStudentById(studentId);
    if (!student) {
      return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
    }
    const originalUpdatedAt = student.updatedAt ?? '';

    // 미차감 신청이므로, 이미 신청/승인대기 중인 쿠폰을 제외한 가용 쿠폰으로 한도 검사
    const balance = student.leaveCoupons ?? 0;
    const committed = (student.rewardRedemptions || [])
      .filter((r) => r.status === 'requested' || r.status === 'pending')
      .reduce((sum, r) => sum + (r.cost || 0), 0);
    const available = balance - committed;
    if (available < meta.cost) {
      return NextResponse.json(
        { success: false, message: `쿠폰이 부족합니다. (가용 ${available} / 필요 ${meta.cost})` },
        { status: 400 },
      );
    }

    const redemption: RewardRedemption = meta.physical
      ? {
          // 상품권/플래너 — 신청(미차감), 관리자 승인 대기
          id: `rwd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          type: rewardType,
          cost: meta.cost,
          status: 'requested',
          source: 'student',
          createdAt: nowIso,
        }
      : {
          // 반차권/휴식권 — 즉시 교환(쿠폰 즉시 차감)
          id: `rwd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          type: rewardType,
          cost: meta.cost,
          status: 'fulfilled',
          source: 'student',
          createdAt: nowIso,
          fulfilledAt: nowIso,
        };
    if (!meta.physical) {
      student.leaveCoupons = balance - meta.cost;
    }
    student.rewardRedemptions = [redemption, ...(student.rewardRedemptions || [])];

    const saved = await patchStudentProgress(student, originalUpdatedAt);
    if (saved === 'conflict') continue;

    return NextResponse.json({ success: true, redemption, leaveCoupons: student.leaveCoupons ?? 0 });
  }

  return NextResponse.json(
    { success: false, message: '교환 처리 충돌이 발생했습니다. 다시 시도해주세요.' },
    { status: 409 },
  );
}

// 학생: 본인이 올린 '신청(requested)' 교환을 취소 (승인 전에만 가능)
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

  const target = (student.rewardRedemptions || []).find((r) => r.id === id);
  if (!target) {
    return NextResponse.json({ success: false, message: '신청을 찾을 수 없습니다.' }, { status: 404 });
  }
  if (target.status !== 'requested') {
    return NextResponse.json({ success: false, message: '이미 처리된 신청은 취소할 수 없습니다.' }, { status: 403 });
  }

  student.rewardRedemptions = (student.rewardRedemptions || []).filter((r) => r.id !== id);
  await saveStudent(student);

  return NextResponse.json({ success: true });
}
