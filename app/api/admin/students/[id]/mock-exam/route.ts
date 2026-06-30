import { NextResponse } from 'next/server';
import { canAdminAccessStudent } from '@/lib/auth';
import { updateStudentById } from '@/lib/store';
import type { MockExamParticipation } from '@/lib/types/student';

// 관리자: 학생 모의고사 참여 상태 설정 (upsert)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!(await canAdminAccessStudent(id))) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });
  }

  let body: { examId?: unknown; status?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const examId = String(body?.examId ?? '').trim();
  if (!examId) {
    return NextResponse.json({ success: false, message: 'examId가 필요합니다.' }, { status: 400 });
  }

  const validStatuses = ['attending', 'absent', 'undecided'] as const;
  const status = validStatuses.includes(body?.status as typeof validStatuses[number])
    ? (body.status as typeof validStatuses[number])
    : 'undecided';

  const nowIso = new Date().toISOString();
  const entry: MockExamParticipation = { examId, status, updatedAt: nowIso };

  const result = await updateStudentById(id, (student) => {
    const existing = (student.mockExams || []).findIndex((e) => e.examId === examId);
    if (existing >= 0) {
      student.mockExams = student.mockExams!.map((e) => e.examId === examId ? entry : e);
    } else {
      student.mockExams = [...(student.mockExams || []), entry];
    }
  });

  if (result === 'not_found') {
    return NextResponse.json({ success: false, message: '해당 원생을 찾을 수 없습니다.' }, { status: 404 });
  }
  if (typeof result === 'string') {
    return NextResponse.json({ success: false, message: '저장이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' }, { status: 409 });
  }
  return NextResponse.json({ success: true, entry });
}
