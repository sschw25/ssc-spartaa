import { NextRequest, NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { getStudentById, saveStudent } from '@/lib/store';
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
  const status = body.status as 'attending' | 'absent';
  const reason = status === 'absent' ? String(body?.reason ?? '').trim().slice(0, 200) : undefined;

  const student = await getStudentById(studentId);
  if (!student) {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }

  const entry: OtParticipation = {
    eventId,
    status,
    reason: reason || undefined,
    updatedAt: new Date().toISOString(),
    respondedBy: 'student',
  };
  student.otEvents = [...(student.otEvents || []).filter((e) => e.eventId !== eventId), entry];

  let couponsGranted = 0;
  if (status === 'attending') {
    couponsGranted = await grantOtAttendance(student, eventId);
    if (couponsGranted > 0) entry.rewarded = true;
  }

  await saveStudent(student);
  return NextResponse.json({ success: true, entry, couponsGranted });
}
