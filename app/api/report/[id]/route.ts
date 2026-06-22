import { NextResponse } from 'next/server';
import { getStudentById, getStudents, getStudySessions, getStudyMinutesByStudent } from '@/lib/store';
import { buildMaterialBenchmarks } from '@/lib/material-benchmark';
import { canViewStudent, getStudentSessionId, isAdmin } from '@/lib/auth';
import { buildStudyStats, getPeriodBounds } from '@/lib/study-stats';

// 학부모/학생용 결과 리포트 조회 API
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const audience = searchParams.get('audience') === 'student' ? 'student' : 'parent';

  // 학생용 결과지는 본인 학생 또는 관리자만 열람 가능.
  if (audience === 'student' && !(await canViewStudent(id))) {
    return NextResponse.json(
      { success: false, message: '열람 권한이 없습니다. 학생 본인으로 로그인해 주세요.' },
      { status: 401 }
    );
  }

  // 학부모용 결과지도 만약 학생 세션이 활성화되어 있다면, 타인 리포트 조회를 차단 (IDOR 방지)
  // (세션이 없는 비로그인 상태의 학부모 접근은 허용)
  const studentSessionId = await getStudentSessionId();
  if (studentSessionId && studentSessionId !== id && !(await isAdmin())) {
    return NextResponse.json(
      { success: false, message: '열람 권한이 없습니다. 다른 학생의 결과지입니다.' },
      { status: 403 }
    );
  }

  try {
    const student = await getStudentById(id);

    if (!student) {
      return NextResponse.json(
        { success: false, message: '리포트 대상 원생을 찾을 수 없거나 주소가 올바르지 않습니다.' },
        { status: 404 }
      );
    }

    // 보안 및 프라이버시를 위해 연락처 등 민감 정보는 제거하거나 마스킹하여 전달
    const maskedStudent = {
      id: student.id,
      name: student.name,
      campus: student.campus,
      manager: student.manager,
      contact: student.contact || '',
      lifeComment: student.lifeComment || '',
      studentLifeComment: student.studentLifeComment || '',
      nextConsultationDate: student.nextConsultationDate,
      enrollmentEndDate: student.enrollmentEndDate,
      weeklyGradeCheck: Boolean(student.weeklyGradeCheck),
      speedMultiplier: student.speedMultiplier !== undefined ? Number(student.speedMultiplier) : 1.0,
      updatedAt: student.updatedAt,
      books: student.books,
      lectures: student.lectures,
      // 부모님 공개용으로는 가장 최근 상담 일지 2건 정도만 전달 (변경 신청은 별도 분리)
      consultationLogs: (student.consultationLogs || []).filter((l) => l.type !== 'request' && l.type !== 'suggestion').slice(0, 3),
      // 학생 본인 변경 신청 내역 (consultation_logs 중 type==='request'만 추려서 전달)
      changeRequests: (student.consultationLogs || [])
        .filter((l) => l.type === 'request')
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
      suggestionRequests: (student.consultationLogs || [])
        .filter((l) => l.type === 'suggestion')
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
      // 휴가/반차/휴식권/병가 신청 내역 + 쿠폰 잔액 (학생 본인 화면용)
      leaveRequests: (student.leaveRequests || [])
        .slice()
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
      leaveCoupons: student.leaveCoupons ?? 0,
      grades: student.grades,
      subjects: student.subjects || []
    };

    const students = await getStudents();
    const materialBenchmarks = buildMaterialBenchmarks(students);

    // 순공/등하원 통계 (Supabase 필요 — 실패해도 리포트 본문은 정상 반환)
    let studyStats = null;
    try {
      const { weekStart, monthStart } = getPeriodBounds();
      const [sessions, weeklyMinutesByStudent] = await Promise.all([
        getStudySessions(id, monthStart),
        getStudyMinutesByStudent(weekStart),
      ]);
      studyStats = buildStudyStats({
        sessions,
        weeklyMinutesByStudent,
        myId: id,
        totalStudents: students.length,
      });
    } catch (e) {
      console.warn('studyStats 계산 생략:', (e as Error)?.message);
    }

    return NextResponse.json({ success: true, data: maskedStudent, materialBenchmarks, studyStats });
  } catch (error) {
    console.error(`API GET /report/${id} error:`, error);
    return NextResponse.json(
      { success: false, message: '리포트 로드 중 에러가 발생했습니다.' },
      { status: 500 }
    );
  }
}
