import { NextRequest, NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { updateStudentById } from '@/lib/store';
import type { EventParticipation } from '@/lib/types/student';

// 학생: 참여 미션 수락/거절 응답 제출. 쿠폰은 행사 후 관리자가 일괄 지급(여기서는 미지급).
export async function POST(req: NextRequest) {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }

  let body: { eventId?: unknown; status?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const eventId = String(body?.eventId ?? '').trim();
  if (!eventId) return NextResponse.json({ success: false, message: 'eventId가 필요합니다.' }, { status: 400 });

  const validStatuses = ['accepted', 'declined'] as const;
  if (!validStatuses.includes(body?.status as (typeof validStatuses)[number])) {
    return NextResponse.json({ success: false, message: '참여 여부를 선택해주세요.' }, { status: 400 });
  }
  const status = body.status as 'accepted' | 'declined';

  const entry: EventParticipation = {
    eventId,
    status,
    respondedAt: new Date().toISOString(),
    respondedBy: 'student',
  };

  const result = await updateStudentById(studentId, (student) => {
    student.eventParticipations = [
      ...(student.eventParticipations || []).filter((e) => e.eventId !== eventId),
      entry,
    ];
  });
  if (result === 'not_found') {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }
  if (typeof result === 'string') {
    return NextResponse.json({ success: false, message: '저장이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' }, { status: 409 });
  }

  return NextResponse.json({ success: true, entry });
}
