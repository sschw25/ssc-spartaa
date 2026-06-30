import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { getStudents, getStudentById, patchStudentProgress, getCampusEvents, markCampusEventRewarded } from '@/lib/store';
import { grantCampusEventReward } from '@/lib/mission-engine';

// 관리자: 참여 미션 쿠폰 일괄 지급 (행사 후).
// 수락(accepted)한 대상 학생 전원에게 쿠폰을 멱등 지급하고, 참여 기록의 rewarded=true 로 표시한다.
export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  let body: { eventId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }
  const eventId = String(body?.eventId ?? '').trim();
  if (!eventId) return NextResponse.json({ success: false, message: 'eventId가 필요합니다.' }, { status: 400 });

  try {
    const events = await getCampusEvents();
    const event = events.find((e) => e.id === eventId);
    if (!event) return NextResponse.json({ success: false, message: '일정을 찾을 수 없습니다.' }, { status: 404 });
    if (!event.isMission) return NextResponse.json({ success: false, message: '참여 미션이 아닙니다.' }, { status: 400 });

    const coupons = event.couponReward || 0;
    const allStudents = await getStudents();
    // 캠퍼스 관리자는 본인 캠퍼스 학생에게만 지급 (슈퍼 관리자 'all'은 전원)
    const students = session.campus === 'all' ? allStudents : allStudents.filter((s) => s.campus === session.campus);

    let rewardedStudents = 0;
    let totalCoupons = 0;
    for (const s of students) {
      const part = (s.eventParticipations || []).find((p) => p.eventId === eventId);
      if (!part || part.status !== 'accepted') continue; // 수락자만 지급 (스냅샷 기준 대상 선별)
      // optimistic locking: 학생별 fresh 재조회 후 조건부 저장·재시도 (일괄 지급이 동시 저장에 유실되지 않게). grant 는 rewards_log 멱등.
      for (let attempt = 0; attempt < 2; attempt++) {
        const student = await getStudentById(s.id);
        if (!student) break;
        const originalUpdatedAt = student.updatedAt ?? '';
        const granted = grantCampusEventReward(student, eventId, coupons, event.title);
        // 참여 기록 rewarded 플래그는 항상 동기화.
        student.eventParticipations = (student.eventParticipations || []).map((p) =>
          p.eventId === eventId ? { ...p, rewarded: true } : p,
        );
        const saved = await patchStudentProgress(student, originalUpdatedAt);
        if (saved === 'conflict') continue;
        if (granted > 0) {
          rewardedStudents += 1;
          totalCoupons += granted;
        }
        break;
      }
    }

    const updated = await markCampusEventRewarded(eventId, new Date().toISOString());
    return NextResponse.json({ success: true, rewardedStudents, totalCoupons, event: updated });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : '지급 실패' }, { status: 500 });
  }
}
