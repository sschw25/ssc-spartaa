import { NextRequest, NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { getStudentById, patchStudentProgress } from '@/lib/store';
import { grantOtAttendance } from '@/lib/mission-engine';
import type { OtParticipation } from '@/lib/types/student';

// 학생: OT 참여/불참 응답 제출. '참여' 시 OT 참여 쿠폰 즉시 지급(멱등).
export async function POST(req: NextRequest) {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }

  let body: { eventId?: unknown; status?: unknown; reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const eventId = String(body?.eventId ?? '').trim();
  if (!eventId) return NextResponse.json({ success: false, message: 'eventId가 필요합니다.' }, { status: 400 });

  const validStatuses = ['attending', 'absent'] as const;
  if (!validStatuses.includes(body?.status as (typeof validStatuses)[number])) {
    return NextResponse.json({ success: false, message: '참여 여부를 선택해주세요.' }, { status: 400 });
  }
  const chosen = body.status as 'attending' | 'absent';
  // OT는 필수 참석 — 불참은 사유 필수 + 관리자 승인 대기(absent_requested)로 접수
  const reason = chosen === 'absent' ? String(body?.reason ?? '').trim().slice(0, 200) : undefined;
  if (chosen === 'absent' && !reason) {
    return NextResponse.json({ success: false, message: '불참 사유를 입력해주세요. (OT는 필수 참석입니다)' }, { status: 400 });
  }
  const status: OtParticipation['status'] = chosen === 'absent' ? 'absent_requested' : 'attending';

  const entry: OtParticipation = {
    eventId,
    status,
    reason: reason || undefined,
    updatedAt: new Date().toISOString(),
    respondedBy: 'student',
  };

  // optimistic locking: conflict 시 fresh 재조회·재시도 (OT 적립 쿠폰 동시 저장 유실 방지). grant 는 rewards_log 멱등.
  for (let attempt = 0; attempt < 2; attempt++) {
    const student = await getStudentById(studentId);
    if (!student) {
      return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
    }
    const originalUpdatedAt = student.updatedAt ?? '';
    student.otEvents = [...(student.otEvents || []).filter((e) => e.eventId !== eventId), entry];

    let couponsGranted = 0;
    entry.rewarded = false;
    if (status === 'attending') {
      couponsGranted = await grantOtAttendance(student, eventId);
      if (couponsGranted > 0) entry.rewarded = true;
    }

    const saved = await patchStudentProgress(student, originalUpdatedAt);
    if (saved === 'conflict') continue;

    return NextResponse.json({ success: true, entry, couponsGranted });
  }

  return NextResponse.json(
    { success: false, message: '저장 충돌이 발생했습니다. 다시 시도해주세요.' },
    { status: 409 },
  );
}
