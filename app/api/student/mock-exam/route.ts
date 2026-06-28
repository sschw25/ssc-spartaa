import { NextRequest, NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { getStudentById, saveStudent } from '@/lib/store';
import type { MockExamParticipation } from '@/lib/types/student';

// 학생: 모의고사 참여/불참 응답 제출
export async function POST(req: NextRequest) {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }

  let body: { examId?: unknown; status?: unknown; reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const examId = String(body?.examId ?? '').trim();
  if (!examId) {
    return NextResponse.json({ success: false, message: 'examId가 필요합니다.' }, { status: 400 });
  }

  const validStatuses = ['attending', 'absent'] as const;
  if (!validStatuses.includes(body?.status as (typeof validStatuses)[number])) {
    return NextResponse.json({ success: false, message: '참여 여부를 선택해주세요.' }, { status: 400 });
  }
  const chosen = body.status as 'attending' | 'absent';
  // 불참은 사유 필수 + 관리자 승인 대기(absent_requested)
  const reason = chosen === 'absent' ? String(body?.reason ?? '').trim().slice(0, 200) : undefined;
  if (chosen === 'absent' && !reason) {
    return NextResponse.json({ success: false, message: '불참 사유를 입력해주세요.' }, { status: 400 });
  }
  const status: MockExamParticipation['status'] = chosen === 'absent' ? 'absent_requested' : 'attending';

  const student = await getStudentById(studentId);
  if (!student) {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }

  const nowIso = new Date().toISOString();
  const entry: MockExamParticipation = {
    examId,
    status,
    reason: reason || undefined,
    updatedAt: nowIso,
    respondedBy: 'student',
  };

  const others = (student.mockExams || []).filter((e) => e.examId !== examId);
  student.mockExams = [...others, entry];
  await saveStudent(student);

  return NextResponse.json({ success: true, entry });
}
