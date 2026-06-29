import { NextResponse } from 'next/server';
import { canAdminAccessStudent } from '@/lib/auth';
import { getStudentById, patchStudentProgress } from '@/lib/store';
import { grantOtAttendance } from '@/lib/mission-engine';
import type { OtParticipation } from '@/lib/types/student';

// 관리자: 학생 OT 참여 상태 설정 (upsert). '참여' 시 OT 참여 쿠폰 즉시 지급(멱등).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!(await canAdminAccessStudent(id))) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });
  }

  let body: { eventId?: unknown; status?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const eventId = String(body?.eventId ?? '').trim();
  if (!eventId) return NextResponse.json({ success: false, message: 'eventId가 필요합니다.' }, { status: 400 });

  const validStatuses = ['attending', 'absent', 'undecided'] as const;
  const status = validStatuses.includes(body?.status as typeof validStatuses[number])
    ? (body.status as typeof validStatuses[number])
    : 'undecided';

  const entry: OtParticipation = { eventId, status, updatedAt: new Date().toISOString(), respondedBy: 'admin' };

  // optimistic locking: conflict 시 fresh 재조회·재시도 (OT 적립 쿠폰 동시 저장 유실 방지). grant 는 rewards_log 멱등.
  for (let attempt = 0; attempt < 2; attempt++) {
    const student = await getStudentById(id);
    if (!student) {
      return NextResponse.json({ success: false, message: '해당 원생을 찾을 수 없습니다.' }, { status: 404 });
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
