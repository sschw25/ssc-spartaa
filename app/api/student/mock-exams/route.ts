import { NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { isMockExamVisibleToStudent } from '@/lib/mock-exam-scope';
import { getMockExams, getStudentById } from '@/lib/store';

// 학생: 응답 대기 중인 모의고사 목록 (notifiedAt 설정 + 아직 미응답)
export async function GET() {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }

  const student = await getStudentById(studentId);
  if (!student) {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }

  // 조회 실패는 빈 목록으로 graceful 처리 — 학생 화면 폴링이 깨지지 않게 (ot-events 와 동일 규칙).
  let allExams: Awaited<ReturnType<typeof getMockExams>> = [];
  try {
    allExams = await getMockExams();
  } catch {
    return NextResponse.json({ success: true, exams: [] });
  }

  const myResponses = new Map(
    (student.mockExams || []).map((e) => [e.examId, e])
  );

  // 알림이 발송됐고 아직 undecided(미응답)인 시험만
  const pending = allExams.filter((exam) => {
    if (!isMockExamVisibleToStudent(exam, student, { requireNotified: true })) return false;
    const response = myResponses.get(exam.id);
    return !response || response.status === 'undecided';
  });

  return NextResponse.json({ success: true, exams: pending });
}
