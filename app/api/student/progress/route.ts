import { NextRequest, NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { getStudentById, saveStudent } from '@/lib/store';

// 학생이 본인 교재/인강 진도를 직접 갱신 (즉시 반영)
export async function PATCH(req: NextRequest) {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }

  let body: { materialType?: unknown; materialId?: unknown; value?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const materialType = body?.materialType === 'lecture' ? 'lecture' : body?.materialType === 'book' ? 'book' : null;
  const materialId = typeof body?.materialId === 'string' ? body.materialId : '';
  const rawValue = Number(body?.value);

  if (!materialType || !materialId) {
    return NextResponse.json({ success: false, message: '대상 자료 정보가 올바르지 않습니다.' }, { status: 400 });
  }
  if (!Number.isFinite(rawValue) || rawValue < 0) {
    return NextResponse.json({ success: false, message: '진도 값이 올바르지 않습니다.' }, { status: 400 });
  }

  const student = await getStudentById(studentId);
  if (!student) {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }

  const nowIso = new Date().toISOString();
  let updated: { value: number; total: number } | null = null;

  for (const subject of student.subjects || []) {
    if (materialType === 'book') {
      const book = (subject.books || []).find((b) => b.id === materialId);
      if (book) {
        const total = book.totalPages || 0;
        const clamped = Math.min(Math.round(rawValue), total > 0 ? total : Math.round(rawValue));
        book.currentPage = clamped;
        book.updatedAt = nowIso;
        updated = { value: clamped, total };
        break;
      }
    } else {
      const lecture = (subject.lectures || []).find((l) => l.id === materialId);
      if (lecture) {
        const total = lecture.totalLectures || 0;
        const clamped = Math.min(Math.round(rawValue), total > 0 ? total : Math.round(rawValue));
        lecture.completedLectures = clamped;
        lecture.updatedAt = nowIso;
        updated = { value: clamped, total };
        break;
      }
    }
  }

  if (!updated) {
    return NextResponse.json({ success: false, message: '해당 학습 자료를 찾을 수 없습니다.' }, { status: 404 });
  }

  await saveStudent(student);
  return NextResponse.json({ success: true, value: updated.value, total: updated.total });
}
