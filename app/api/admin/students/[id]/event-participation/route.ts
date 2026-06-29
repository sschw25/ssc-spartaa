import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { getStudentById, saveStudent } from '@/lib/store';
import type { EventParticipation } from '@/lib/types/student';

// 관리자: 학생 참여 미션 응답 수동 설정 (upsert). 쿠폰은 행사 후 일괄 지급(grant 라우트)에서 처리.
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

  const validStatuses = ['accepted', 'declined'] as const;
  if (!validStatuses.includes(body?.status as (typeof validStatuses)[number])) {
    return NextResponse.json({ success: false, message: '상태 값이 올바르지 않습니다.' }, { status: 400 });
  }
  const status = body.status as 'accepted' | 'declined';

  const student = await getStudentById(id);
  if (!student) {
    return NextResponse.json({ success: false, message: '해당 원생을 찾을 수 없습니다.' }, { status: 404 });
  }

  const prev = (student.eventParticipations || []).find((e) => e.eventId === eventId);
  const entry: EventParticipation = {
    eventId,
    status,
    respondedAt: new Date().toISOString(),
    respondedBy: 'admin',
    rewarded: prev?.rewarded,
  };
  student.eventParticipations = [
    ...(student.eventParticipations || []).filter((e) => e.eventId !== eventId),
    entry,
  ];

  await saveStudent(student);
  return NextResponse.json({ success: true, entry });
}
