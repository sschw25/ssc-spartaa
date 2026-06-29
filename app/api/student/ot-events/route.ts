import { NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { getOtEvents, getStudentById } from '@/lib/store';
import { getSeoulDateKey } from '@/lib/student-activity';

// 학생: 응답 대기 중인 OT 목록.
// 노출 조건: (1) 학생 캠퍼스 대상(전체 또는 일치) (2) 아직 미응답(또는 미정)
//   (3) 관리자 수동 발송됨(notifiedAt) 또는 OT 날짜 3일 전부터(D-3 이후) 자동 노출
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
  const todayMs = new Date(`${todayKey}T00:00:00+09:00`).getTime();
  const daysUntil = (ymd: string): number => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd || '')) return Infinity;
    return Math.round((new Date(`${ymd}T00:00:00+09:00`).getTime() - todayMs) / 86400000);
  };
  const myResponses = new Map((student.otEvents || []).map((e) => [e.eventId, e]));
  const pending = allEvents.filter((event) => {
    // 센터 대상 필터
    if (event.campus && event.campus !== 'all' && event.campus !== student.campus) return false;
    // 미응답(또는 미정)만
    const r = myResponses.get(event.id);
    if (r && r.status !== 'undecided') return false;
    // 수동 발송됐거나, 사용 3일 전부터 자동 노출
    if (event.notifiedAt) return true;
    return daysUntil(event.date) <= 3;
  });
  return NextResponse.json({ success: true, events: pending });
}
