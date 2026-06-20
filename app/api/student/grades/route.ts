import { NextRequest, NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { getStudentById, saveStudent } from '@/lib/store';
import type { GradeItem } from '@/lib/types/student';

// 학생이 본인 성적을 직접 추가
export async function POST(req: NextRequest) {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }

  let body: { testName?: unknown; subject?: unknown; score?: unknown; date?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const testName = String(body?.testName ?? '').trim();
  const subject = String(body?.subject ?? '').trim();
  const date = String(body?.date ?? '').trim();
  const score = Number(body?.score);

  if (!testName || !subject || !date) {
    return NextResponse.json({ success: false, message: '시험명·과목·시험일을 모두 입력해 주세요.' }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ success: false, message: '시험일 형식이 올바르지 않습니다.' }, { status: 400 });
  }
  if (!Number.isFinite(score) || score < 0 || score > 1000) {
    return NextResponse.json({ success: false, message: '점수를 0~1000 사이로 입력해 주세요.' }, { status: 400 });
  }

  const student = await getStudentById(studentId);
  if (!student) {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }

  const grade: GradeItem = {
    id: `grade_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    testName,
    subject,
    score,
    date,
    source: 'student',
  };
  student.grades = [...(student.grades || []), grade];
  await saveStudent(student);

  return NextResponse.json({ success: true, grade });
}

// 학생이 본인이 직접 입력한 성적만 삭제 (관리자 입력 성적은 보호)
export async function DELETE(req: NextRequest) {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ success: false, message: '삭제할 항목이 없습니다.' }, { status: 400 });
  }

  const student = await getStudentById(studentId);
  if (!student) {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }

  const target = (student.grades || []).find((g) => g.id === id);
  if (!target) {
    return NextResponse.json({ success: false, message: '항목을 찾을 수 없습니다.' }, { status: 404 });
  }
  if (target.source !== 'student') {
    return NextResponse.json({ success: false, message: '관리자가 입력한 성적은 삭제할 수 없습니다.' }, { status: 403 });
  }

  student.grades = (student.grades || []).filter((g) => g.id !== id);
  await saveStudent(student);

  return NextResponse.json({ success: true });
}
