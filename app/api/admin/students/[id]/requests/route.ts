import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { getStudentById, saveStudent } from '@/lib/store';

// 관리자: 학생 변경 신청 처리 상태 변경 (pending <-> resolved)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  const { id } = await params;

  let body: { requestId?: unknown; status?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const requestId = typeof body?.requestId === 'string' ? body.requestId : '';
  const status = body?.status === 'pending' ? 'pending' : body?.status === 'resolved' ? 'resolved' : null;
  if (!requestId || !status) {
    return NextResponse.json({ success: false, message: '처리 정보가 올바르지 않습니다.' }, { status: 400 });
  }

  const student = await getStudentById(id);
  if (!student) {
    return NextResponse.json({ success: false, message: '해당 원생을 찾을 수 없습니다.' }, { status: 404 });
  }

  const target = (student.consultationLogs || []).find((l) => l.id === requestId && l.type === 'request');
  if (!target) {
    return NextResponse.json({ success: false, message: '신청을 찾을 수 없습니다.' }, { status: 404 });
  }

  target.status = status;
  target.resolvedAt = status === 'resolved' ? new Date().toISOString() : undefined;
  await saveStudent(student);

  return NextResponse.json({ success: true });
}
