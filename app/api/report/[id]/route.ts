import { NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import { getStudentById, getStudents, getStudySessions, getStudyMinutesByStudent, getMockExams, getConsultationBookings } from '@/lib/store';
import type { ConsultationBooking } from '@/lib/types/student';
import { buildMaterialBenchmarks } from '@/lib/material-benchmark';
import { canViewStudent } from '@/lib/auth';
import { buildStudyStats, getPeriodBounds } from '@/lib/study-stats';
import { serializeClientActivityNoteFromStudent } from '@/lib/student-activity';
import type { Student } from '@/lib/types/student';
import { buildConsultationDigest } from '@/lib/consultation-digest';

interface ConsultationHistoryEntry {
  id: string;
  date: string;
  slot: string;
  status: 'done' | 'noshow';
  counselor: string;
  note?: string;
  digest: { kind: string; label: string; detail?: string }[];
}

function buildMaskedStudent(
  student: Student,
  audience: 'parent' | 'student',
  consultationBookings: ConsultationBooking[] = [],
  consultationHistory: ConsultationHistoryEntry[] = [],
) {
  return {
    id: student.id,
    name: student.name,
    campus: student.campus,
    manager: student.manager,
    contact: student.contact || '',
    lifeComment: student.lifeComment || '',
    studentLifeComment: audience === 'student' ? (student.studentLifeComment || '') : '',
    specialNote: audience === 'student' ? serializeClientActivityNoteFromStudent(student) : undefined,
    nextConsultationDate: student.nextConsultationDate,
    enrollmentEndDate: student.enrollmentEndDate,
    weeklyGradeCheck: Boolean(student.weeklyGradeCheck),
    speedMultiplier: 1.0,
    updatedAt: student.updatedAt,
    books: student.books,
    lectures: student.lectures,
    consultationLogs: (student.consultationLogs || []).filter((l) => l.type !== 'request' && l.type !== 'suggestion').slice(0, 3),
    changeRequests: (student.consultationLogs || [])
      .filter((l) => l.type === 'request')
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
    suggestionRequests: (student.consultationLogs || [])
      .filter((l) => l.type === 'suggestion')
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
    leaveRequests: (student.leaveRequests || [])
      .slice()
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
    leaveCoupons: student.leaveCoupons ?? 0,
    grades: student.grades,
    subjects: student.subjects || [],
    ...(audience === 'student'
      ? {
          penalties: student.penalties || [],
          mockExams: student.mockExams || [],
          seatAlerts: student.seatAlerts || [],
          consultationBookings,
          consultationHistory,
        }
      : {}),
  };
}

// 학부모/학생용 결과 리포트 조회 API
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const audience = searchParams.get('audience') === 'student' ? 'student' : 'parent';
  const shareToken = searchParams.get('token');
  // 공유 비밀번호는 헤더로 받는다 — URL 쿼리에 실으면 브라우저 히스토리/서버·프록시 로그/리퍼러에 남는다.
  const sharePasswordInput = request.headers.get('x-report-password') || '';

  // 토큰 기반 접근 (학부모 공유 링크) — 세션 인증 우선순위에서 제외
  if (shareToken) {
    try {
      const student = await getStudentById(id);
      const now = new Date().toISOString();
      if (
        !student ||
        !student.shareToken ||
        student.shareToken !== shareToken ||
        !student.shareTokenExpiresAt ||
        student.shareTokenExpiresAt < now
      ) {
        return NextResponse.json(
          { success: false, message: '유효하지 않거나 만료된 링크입니다.' },
          { status: 401 }
        );
      }
      // 비밀번호 검증
      if (!sharePasswordInput) {
        // pw 파라미터 없음 → 비밀번호 입력 요구
        return NextResponse.json(
          { success: false, requirePassword: true },
          { status: 403 }
        );
      }
      // hash가 없으면(레거시/부분저장) 무검사 통과가 아니라 안전 실패(deny)로 처리
      const passwordOk = student.sharePasswordHash
        ? await compare(sharePasswordInput, student.sharePasswordHash)
        : false;
      if (!passwordOk) {
        return NextResponse.json(
          { success: false, message: '비밀번호가 올바르지 않습니다.' },
          { status: 403 }
        );
      }
      // 학부모용 마스킹 데이터 반환 (학생 전용 정보 제외)
      const maskedStudent = buildMaskedStudent(student, 'parent');
      const [students, allExams] = await Promise.all([
        getStudents(),
        getMockExams().catch(() => []),
      ]);
      const materialBenchmarks = buildMaterialBenchmarks(students);
      let studyStats = null;
      try {
        const { weekStart, monthStart } = getPeriodBounds();
        const [sessions, weeklyMinutesByStudent] = await Promise.all([
          getStudySessions(id, monthStart),
          getStudyMinutesByStudent(weekStart),
        ]);
        studyStats = buildStudyStats({ sessions, weeklyMinutesByStudent, myId: id, totalStudents: students.length });
      } catch { /* 통계 실패 시 무시 */ }
      return NextResponse.json({ success: true, data: maskedStudent, materialBenchmarks, studyStats, mockExams: allExams });
    } catch (error) {
      console.error(`API GET /report/${id} (token) error:`, error);
      return NextResponse.json({ success: false, message: '리포트 로드 중 에러가 발생했습니다.' }, { status: 500 });
    }
  }

  // 토큰이 없는 직접 접근(학생/학부모 공통)은 본인 학생 또는 관리자만 허용한다.
  // 공개 학부모 공유는 반드시 유효 share-token + 비밀번호 경로(위 분기)로만 접근해야 한다.
  // (과거: 세션 없는 익명 학부모 접근을 허용해 학생 id만 알면 PII가 노출되는 IDOR가 있었음)
  if (!(await canViewStudent(id))) {
    return NextResponse.json(
      {
        success: false,
        message: '열람 권한이 없습니다. 공유 링크(비밀번호)로 접속하거나 본인 계정으로 로그인해 주세요.',
      },
      { status: 401 }
    );
  }

  try {
    const [student, allExams] = await Promise.all([
      getStudentById(id),
      getMockExams().catch(() => []),
    ]);

    if (!student) {
      return NextResponse.json(
        { success: false, message: '리포트 대상 원생을 찾을 수 없거나 주소가 올바르지 않습니다.' },
        { status: 404 }
      );
    }

    // 학생 본인 리포트에는 상담 예약(센터 원장에서 본인 건만)을 함께 전달한다.
    const myAllBookings = audience === 'student'
      ? (await getConsultationBookings(student.campus).catch(() => [])).filter((b) => b.studentId === student.id)
      : [];
    const myBookings = myAllBookings
      .filter((b) => b.status === 'booked')
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    const consultationHistory = myAllBookings
      .filter((b) => b.status === 'done' || b.status === 'noshow')
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .map((b) => ({
        id: b.id,
        date: b.date,
        slot: b.slot,
        status: b.status as 'done' | 'noshow',
        counselor: b.counselor,
        note: b.logId ? ((student.consultationLogs || []).find((l) => l.id === b.logId)?.content || undefined) : undefined,
        digest: buildConsultationDigest(student, b.date),
      }));
    const maskedStudent = buildMaskedStudent(student, audience, myBookings, consultationHistory);

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

    return NextResponse.json({ success: true, data: maskedStudent, materialBenchmarks, studyStats, mockExams: allExams });
  } catch (error) {
    console.error(`API GET /report/${id} error:`, error);
    return NextResponse.json(
      { success: false, message: '리포트 로드 중 에러가 발생했습니다.' },
      { status: 500 }
    );
  }
}
