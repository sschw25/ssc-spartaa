import { NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { getOtEvents, getStudentById } from '@/lib/store';
import { getSeoulDateKey } from '@/lib/student-activity';
import { isOtEventVisibleToStudent } from '@/lib/upcoming-schedule';

// 학생: 응답 대기 중인 OT 목록.
// 노출 조건: (1) 학생 캠퍼스 대상(전체 또는 일치) (2) 아직 미응답(또는 미정)
//   (3) 관리자 수동 발송됨(notifiedAt) 또는 OT 날짜 3일 전부터(D-3 이후) 자동 노출
//   — 노출 판정(1)(3)은 lib/upcoming-schedule 의 isOtEventVisibleToStudent 단일 소스 사용
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
  const todayKey = getSeoulDateKey();
  const myResponses = new Map((student.otEvents || []).map((e) => [e.eventId, e]));
  const pending = allEvents.filter((event) => {
    // 미응답(또는 미정)만
    const r = myResponses.get(event.id);
    if (r && r.status !== 'undecided') return false;
    // 센터 대상 + (수동 발송됐거나 D-3부터 자동 노출)
    return isOtEventVisibleToStudent(event, student, todayKey);
  });
  return NextResponse.json({ success: true, events: pending });
}
