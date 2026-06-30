import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import {
  getStudentApplications,
  removeStudentApplication,
  createStudentWithPasswordHash,
  deleteStudent,
  getStudentAuthRecords,
} from '@/lib/store';
import type { Student } from '@/lib/types/student';

const STUDENT_CAMPUSES = ['wonju', 'chuncheon', 'chungju'];
const onlyDigits = (value: unknown) => String(value ?? '').replace(/\D/g, '');
const normalizeSeat = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

// 관리자: 가입신청 승인 → 정식 원생 생성.
// 학생이 보낸 정보(이름·아이디·비번해시·연락처·목표시험·희망캠퍼스)에
// 관리자가 입력한 나머지(캠퍼스 확정·담당자·좌석·등록종료일 등)를 합쳐 students 행을 만든다.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  const { id } = await params;

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    /* 본문 없이 호출(원클릭 승인) 허용 */
  }

  try {
    const applications = await getStudentApplications();
    const application = applications.find((a) => a.id === id);
    if (!application) {
      return NextResponse.json({ success: false, message: '신청을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 캠퍼스 확정: 관리자 입력값 우선, 없으면 학생 희망값
    const campusRaw = String(body.campus ?? application.campus ?? '').trim();
    if (!STUDENT_CAMPUSES.includes(campusRaw)) {
      return NextResponse.json({ success: false, message: '소속 캠퍼스를 선택해 주세요.' }, { status: 400 });
    }
    // 캠퍼스 관리자는 본인 캠퍼스로만 승인 가능
    if (session.campus !== 'all' && campusRaw !== session.campus) {
      return NextResponse.json({ success: false, message: '담당 캠퍼스 이외의 신청은 승인할 수 없습니다.' }, { status: 403 });
    }

    // 승인 시점 아이디 중복 재확인(대기 중 동일 아이디가 먼저 승인됐을 수 있음)
    const authRecords = await getStudentAuthRecords();
    if (authRecords.some((r) => (r.login_id || '').toLowerCase() === application.loginId.toLowerCase())) {
      return NextResponse.json({ success: false, message: '이미 동일한 아이디의 원생이 존재합니다. 신청 아이디를 조정해 주세요.' }, { status: 409 });
    }

    const now = new Date().toISOString();
    const studentId = `std_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const newStudent: Student = {
      id: studentId,
      name: application.name,
      loginId: application.loginId,
      campus: campusRaw,
      manager: String(body.manager ?? '').trim(),
      contact: application.contact || '',
      parentPhone: onlyDigits(body.parentPhone) || application.parentPhone || undefined,
      studentPhone: onlyDigits(body.studentPhone) || application.studentPhone || undefined,
      smsTargets: application.smsTargets && application.smsTargets.length ? application.smsTargets : ['parent'],
      seatNumber: normalizeSeat(body.seatNumber),
      enrollStartDate: /^\d{4}-\d{2}-\d{2}$/.test(String(body.enrollStartDate ?? '')) ? String(body.enrollStartDate) : undefined,
      enrollmentEndDate: String(body.enrollmentEndDate ?? '').trim() || undefined,
      weeklyGradeCheck: Boolean(body.weeklyGradeCheck),
      createdAt: now,
      updatedAt: now,
      books: [],
      lectures: [],
      consultationLogs: [],
      grades: [],
      subjects: [],
      awaySchedules: [],
    };

    const saved = await createStudentWithPasswordHash(newStudent, application.passwordHash);
    try {
      await removeStudentApplication(id);
    } catch (removeError) {
      console.error('approved student created but application removal failed:', removeError);
      try {
        await deleteStudent(studentId);
      } catch (rollbackError) {
        console.error('failed to rollback approved student after application removal failure:', rollbackError);
      }
      throw removeError;
    }

    return NextResponse.json({ success: true, data: saved, message: `${application.name} 원생이 승인되었습니다.` });
  } catch (error) {
    console.error('approve application error:', error);
    return NextResponse.json({ success: false, message: '승인 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

// 관리자: 가입신청 반려(삭제).
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  const { id } = await params;

  try {
    const applications = await getStudentApplications();
    const application = applications.find((a) => a.id === id);
    if (!application) {
      return NextResponse.json({ success: false, message: '신청을 찾을 수 없습니다.' }, { status: 404 });
    }
    if (session.campus !== 'all' && application.campus && application.campus !== session.campus) {
      return NextResponse.json({ success: false, message: '담당 캠퍼스 이외의 신청은 반려할 수 없습니다.' }, { status: 403 });
    }
    await removeStudentApplication(id);
    return NextResponse.json({ success: true, message: '신청을 반려했습니다.' });
  } catch (error) {
    console.error('reject application error:', error);
    return NextResponse.json({ success: false, message: '반려 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
