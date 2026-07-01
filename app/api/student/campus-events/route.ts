import { NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { getCampusEvents, getStudentById } from '@/lib/store';
import { isCampusEventTargetedToStudent } from '@/lib/upcoming-schedule';
import type { CampusEvent } from '@/lib/types/student';

// 학생: 응답 대기 중인 참여 미션 목록 (isMission + notifiedAt + 대상 + 미응답)
export async function GET() {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }
  const student = await getStudentById(studentId);
  if (!student) {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }
  // campus_events 테이블 미생성(마이그레이션 미실행) 등은 빈 목록으로 graceful 처리.
  let allEvents: CampusEvent[] = [];
  try {
    allEvents = await getCampusEvents();
  } catch {
    return NextResponse.json({ success: true, events: [] });
  }
  const responded = new Set((student.eventParticipations || []).map((p) => p.eventId));
  const pending = allEvents.filter((event) => {
    if (!event.isMission || !event.notifiedAt) return false;
    if (responded.has(event.id)) return false;
    return isCampusEventTargetedToStudent(event, student);
  });
  return NextResponse.json({ success: true, events: pending });
}
