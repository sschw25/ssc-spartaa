import { NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { getMockExams, getStudentById } from '@/lib/store';

// 학생: 응답 대기 중인 모의고사 목록 (notifiedAt 설정 + 아직 미응답)
export async function GET() {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }

  const [student, allExams] = await Promise.all([
    getStudentById(studentId),
    getMockExams(),
  ]);

  if (!student) {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }

  const myResponses = new Map(
    (student.mockExams || []).map((e) => [e.examId, e])
  );

  // 알림이 발송됐고 아직 undecided(미응답)인 시험만
  const pending = allExams.filter((exam) => {
    if (!exam.notifiedAt) return false;
    const response = myResponses.get(exam.id);
    return !response || response.status === 'undecided';
  });

  return NextResponse.json({ success: true, exams: pending });
}
