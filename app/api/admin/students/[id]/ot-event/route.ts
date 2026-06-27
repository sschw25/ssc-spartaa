import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { getStudentById, saveStudent } from '@/lib/store';
import { grantOtAttendance } from '@/lib/mission-engine';
import type { OtParticipation } from '@/lib/types/student';

// 관리자: 학생 OT 참여 상태 설정 (upsert). '참여' 시 OT 참여 쿠폰 즉시 지급(멱등).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  const { id } = await params;

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

  const student = await getStudentById(id);
  if (!student) {
    return NextResponse.json({ success: false, message: '해당 원생을 찾을 수 없습니다.' }, { status: 404 });
  }

  const entry: OtParticipation = { eventId, status, updatedAt: new Date().toISOString(), respondedBy: 'admin' };
  student.otEvents = [...(student.otEvents || []).filter((e) => e.eventId !== eventId), entry];

  let couponsGranted = 0;
  if (status === 'attending') {
    couponsGranted = await grantOtAttendance(student, eventId);
    if (couponsGranted > 0) entry.rewarded = true;
  }

  await saveStudent(student);
  return NextResponse.json({ success: true, entry, couponsGranted });
}
