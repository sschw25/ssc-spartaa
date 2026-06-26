import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { getStudents, getStudentById, saveStudent } from '@/lib/store';

function kstDateStr(): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date()).replace(/\. /g, '-').replace('.', '');
}

// 관리자: 특정 날짜의 모든 휴대폰 제출 신청 조회
export async function GET(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  const date = req.nextUrl.searchParams.get('date') || kstDateStr();

  try {
    const students = await getStudents();
    const submissions = students.flatMap((s) =>
      (s.phoneSubmissions || [])
        .filter((sub) => sub.date === date)
        .map((sub) => ({
          ...sub,
          studentId: s.id,
          studentName: s.name,
          campus: s.campus,
        })),
    );
    return NextResponse.json({ success: true, submissions });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '조회 실패';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

// 관리자: 신청 승인/반려
export async function PATCH(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  let body: { studentId?: unknown; submissionId?: unknown; status?: unknown; adminReply?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const studentId = String(body?.studentId ?? '').trim();
  const submissionId = String(body?.submissionId ?? '').trim();
  const status = body?.status;
  if (!studentId || !submissionId || (status !== 'approved' && status !== 'rejected')) {
    return NextResponse.json({ success: false, message: '파라미터가 올바르지 않습니다.' }, { status: 400 });
  }
  const adminReply = String(body?.adminReply ?? '').trim().slice(0, 300) || undefined;

  const student = await getStudentById(studentId);
  if (!student) {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }

  const idx = (student.phoneSubmissions || []).findIndex((s) => s.id === submissionId);
  if (idx === -1) {
    return NextResponse.json({ success: false, message: '신청을 찾을 수 없습니다.' }, { status: 404 });
  }

  const nowIso = new Date().toISOString();
  student.phoneSubmissions = (student.phoneSubmissions || []).map((s, i) =>
    i === idx ? { ...s, status, reviewedAt: nowIso, adminReply } : s,
  );
  await saveStudent(student);

  return NextResponse.json({ success: true, submission: student.phoneSubmissions[idx] });
}
