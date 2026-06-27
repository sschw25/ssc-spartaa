import { NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { getOtEvents, getStudentById } from '@/lib/store';

// 학생: 응답 대기 중인 OT 목록 (notifiedAt 설정 + 아직 미응답)
export async function GET() {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }
  const student = await getStudentById(studentId);
  if (!student) {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }
  // ot_events 테이블 미생성(마이그레이션 미실행) 등은 빈 목록으로 graceful 처리 — 학생 화면 깨지지 않게.
  let allEvents: Awaited<ReturnType<typeof getOtEvents>> = [];
  try {
    allEvents = await getOtEvents();
  } catch {
    return NextResponse.json({ success: true, events: [] });
  }
  const myResponses = new Map((student.otEvents || []).map((e) => [e.eventId, e]));
  const pending = allEvents.filter((event) => {
    if (!event.notifiedAt) return false;
    const r = myResponses.get(event.id);
    return !r || r.status === 'undecided';
  });
  return NextResponse.json({ success: true, events: pending });
}
