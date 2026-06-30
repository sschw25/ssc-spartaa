import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession, canAdminAccessStudent } from '@/lib/auth';
import { getStudents, updateStudentById } from '@/lib/store';
import type { PhoneSubmission } from '@/lib/types/student';

function kstDateStr(): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date()).replace(/\. /g, '-').replace('.', '');
}

// 관리자: 특정 날짜의 모든 휴대폰 제출 신청 조회
export async function GET(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  const date = req.nextUrl.searchParams.get('date') || kstDateStr();

  try {
    const students = await getStudents();
    // 캠퍼스 관리자는 본인 캠퍼스 학생만 조회 (슈퍼 관리자 'all'은 전원)
    const scoped = session.campus === 'all' ? students : students.filter((s) => s.campus === session.campus);
    const submissions = scoped.flatMap((s) =>
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
  if (!(await getAdminSession())) {
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

  // 캠퍼스 관리자는 본인 캠퍼스 학생만 승인/반려 가능
  if (!(await canAdminAccessStudent(studentId))) {
    return NextResponse.json({ success: false, message: '해당 학생에 접근할 권한이 없습니다.' }, { status: 403 });
  }

  const nowIso = new Date().toISOString();
  let errorResponse: NextResponse | null = null;
  let updatedSubmission: PhoneSubmission | null = null;
  const result = await updateStudentById(studentId, (student) => {
    const idx = (student.phoneSubmissions || []).findIndex((s) => s.id === submissionId);
    if (idx === -1) {
      errorResponse = NextResponse.json({ success: false, message: '신청을 찾을 수 없습니다.' }, { status: 404 });
      return false;
    }
    student.phoneSubmissions = (student.phoneSubmissions || []).map((s, i) =>
      i === idx ? { ...s, status, reviewedAt: nowIso, adminReply } : s,
    );
    updatedSubmission = student.phoneSubmissions[idx];
  });

  if (errorResponse) return errorResponse;
  if (result === 'not_found') {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }
  if (typeof result === 'string') {
    return NextResponse.json({ success: false, message: '저장이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' }, { status: 409 });
  }

  return NextResponse.json({ success: true, submission: updatedSubmission });
}
