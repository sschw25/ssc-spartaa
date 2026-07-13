import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { compare } from 'bcryptjs';
import { sharedRateLimit, clientIp } from '@/lib/rate-limit';
import { getStudentById, getStudents, getStudySessions, getStudyMinutesByStudent, getStudentSeatPresenceMarks, getMockExams, getConsultationBookings, getSeatMoveRequests } from '@/lib/store';
import type { ConsultationBooking, SeatMoveRequest } from '@/lib/types/student';
import { buildMaterialBenchmarks } from '@/lib/material-benchmark';
import { canViewStudent } from '@/lib/auth';
import { buildStudyStats, getPeriodBounds } from '@/lib/study-stats';
import { serializeClientActivityNoteFromStudent, getRewardGrantsFromStudent, parseSpecialNoteEnvelope } from '@/lib/student-activity';
import type { Student } from '@/lib/types/student';
import { buildConsultationDigest } from '@/lib/consultation-digest';
import { filterMockExamsForStudent } from '@/lib/mock-exam-scope';

interface ConsultationHistoryEntry {
  id: string;
  date: string;
  slot: string;
  status: 'done' | 'noshow';
  counselor: string;
  note?: string;
  digest: { kind: string; label: string; detail?: string }[];
}

// 학생 전용 필드를 교재 객체에서 제거(학부모 audience) — 오답노트 원문(텍스트·태그·사진 경로)은
// 학생 본인/관리자 전용이다. 루트 books 와 subjects.books 가 같은 객체를 참조하므로 복사본으로 반환.
function stripWrongNotes<T extends object>(m: T): T {
  if (!m || typeof m !== 'object' || !('wrongNotes' in m)) return m;
  const rest = { ...(m as Record<string, unknown>) };
  delete rest.wrongNotes;
  return rest as T;
}

function buildMaskedStudent(
  student: Student,
  audience: 'parent' | 'student',
  consultationBookings: ConsultationBooking[] = [],
  consultationHistory: ConsultationHistoryEntry[] = [],
  consultationCancellations: ConsultationBooking[] = [],
  seatMoveRequests: SeatMoveRequest[] = [],
) {
  const isStudent = audience === 'student';
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
    // 등록 시각 — subject-progress 탭이 진도 기대치의 'enrolledStart'(등록 전 학습일 제외) 보정에 쓴다. 누락 시 보정이 통째로 빠져 '느림/정체' 오판.
    createdAt: student.createdAt,
    updatedAt: student.updatedAt,
    books: isStudent ? student.books : (student.books || []).map(stripWrongNotes),
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
    // 정기 외출(AwaySchedule) — 시간표 탭의 '외출' 배지가 이 소스로 판정된다. 누락 시 배지 안 뜸.
    awaySchedules: student.awaySchedules || [],
    leaveCoupons: student.leaveCoupons ?? 0,
    grades: student.grades,
    subjects: isStudent
      ? (student.subjects || [])
      : (student.subjects || []).map((s) => ({ ...s, books: (s.books || []).map(stripWrongNotes) })),
    ...(audience === 'student'
      ? {
          penalties: student.penalties || [],
          mockExams: student.mockExams || [],
          seatAlerts: student.seatAlerts || [],
          // 보강 이월(오버레이·내역 표시)·외출 계획조정 통지·주말 보강 발생 알림 — 학생 홈 전용.
          makeupCarryovers: student.makeupCarryovers || [],
          awayReplanNotices: student.awayReplanNotices || [],
          makeupNotices: student.makeupNotices || [],
          consultationBookings,
          consultationHistory,
          consultationCancellations,
          // 자리이동 신청(본인 건) — 학생 홈 알림에서 승인/반려 상태변화를 노출. 신청 화면은 SeatMoveCard 가 별도 조회.
          seatMoveRequests,
          // 반차/휴식권 잔여에 교환 추가권을 합산(getLeaveCredits)하려면 본인 교환 내역이 필요 —
          // 누락 시 서버는 신청을 허용하는데 화면은 '0회 남음'으로 보이는 불일치가 난다.
          rewardRedemptions: student.rewardRedemptions || [],
          // 쿠폰 지급 내역(최근순 30건) — 학생 홈 알림 '쿠폰 지급'과 언제/왜 받았는지 표시용.
          couponGrants: getRewardGrantsFromStudent(student, 30),
        }
      : {}),
    ddays: audience === 'student' ? (student.ddays || []) : [],
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
  // scope=core: 학생 본문만(전학생 벤치마크·순공통계 생략) → 첫 페인트를 빠르게.
  // scope=extras: 벤치마크+순공통계만. 파라미터 없으면 기존 전체 응답(공유토큰 경로 호환).
  const scope = searchParams.get('scope');
  const shareToken = searchParams.get('token');
  // 공유 비밀번호는 헤더로 받는다 — URL 쿼리에 실으면 브라우저 히스토리/서버·프록시 로그/리퍼러에 남는다.
  const sharePasswordInput = request.headers.get('x-report-password') || '';

  // 토큰 기반 접근 (학부모 공유 링크) — 세션 인증 우선순위에서 제외
  if (shareToken) {
    try {
      const student = await getStudentById(id);
      const now = new Date().toISOString();
      // 토큰 비교는 상수시간(timingSafeEqual)으로 — 길이 선비교 후 동일 길이일 때만 비교.
      const tokenOk =
        !!student?.shareToken &&
        student.shareToken.length === shareToken.length &&
        timingSafeEqual(Buffer.from(student.shareToken), Buffer.from(shareToken));
      if (
        !student ||
        !tokenOk ||
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
        // pw 파라미터 없음 → 비밀번호 입력 요구 (실제 시도가 아니므로 레이트리밋 미소모)
        return NextResponse.json(
          { success: false, requirePassword: true },
          { status: 403 }
        );
      }
      // 공유 비밀번호(6자리 숫자)는 무차별 대입 대상 — 실제 비번 제출 시에만 리포트+IP당 시도를 제한한다.
      // (정상 학부모의 반복 열람/새로고침은 requirePassword 단계라 여기 도달 전이므로 영향 없음.)
      const rl = await sharedRateLimit(`report-pw:${id}:${clientIp(request)}`, 20, 10 * 60 * 1000);
      if (!rl.allowed) {
        return NextResponse.json(
          { success: false, message: `시도가 너무 많습니다. ${rl.retryAfterSec}초 후 다시 시도해 주세요.` },
          { status: 429 }
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
        const { weekStart, monthStart, todayStr } = getPeriodBounds();
        const [sessions, weeklyMinutesByStudent, presenceMarks] = await Promise.all([
          getStudySessions(id, monthStart),
          getStudyMinutesByStudent(weekStart),
          // 좌석판 수기 출석(present) — QR 세션 없는 날 재석 파생용
          getStudentSeatPresenceMarks(id, monthStart, todayStr).catch(() => []),
        ]);
        studyStats = buildStudyStats({
          sessions, weeklyMinutesByStudent, myId: id, totalStudents: students.length, presenceMarks,
          focusMinutesByDate: parseSpecialNoteEnvelope(student.specialNote).pomodoro_minutes || undefined,
        });
      } catch { /* 통계 실패 시 무시 */ }
      const mockExams = filterMockExamsForStudent(allExams, student);
      return NextResponse.json({ success: true, data: maskedStudent, materialBenchmarks, studyStats, mockExams });
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
    // extras: 본문 없이 무거운 집계만 — core 렌더 후 백그라운드에서 호출된다.
    if (scope === 'extras') {
      const { weekStart, monthStart, todayStr } = getPeriodBounds();
      const [students, sessions, weeklyMinutesByStudent, presenceMarks] = await Promise.all([
        getStudents(),
        getStudySessions(id, monthStart).catch(() => null),
        getStudyMinutesByStudent(weekStart).catch(() => null),
        // 좌석판 수기 출석(present) — QR 세션 없는 날 재석 파생용
        getStudentSeatPresenceMarks(id, monthStart, todayStr).catch(() => []),
      ]);
      const materialBenchmarks = buildMaterialBenchmarks(students);
      let studyStats = null;
      if (sessions && weeklyMinutesByStudent) {
        try {
          const me = students.find((s) => s.id === id);
          studyStats = buildStudyStats({
            sessions, weeklyMinutesByStudent, myId: id, totalStudents: students.length, presenceMarks,
            focusMinutesByDate: me ? parseSpecialNoteEnvelope(me.specialNote).pomodoro_minutes || undefined : undefined,
          });
        } catch { /* 통계 실패 시 무시 */ }
      }
      return NextResponse.json({ success: true, materialBenchmarks, studyStats });
    }

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
    // 최근(14일) 관리자/시스템 취소 건 — 학생 본인 취소는 제외(알림 대상 아님).
    const cancelCutoff = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
    const consultationCancellations = myAllBookings
      .filter((b) => b.status === 'cancelled'
        && (b.cancelledBy === 'admin' || b.cancelledBy === 'system')
        && (b.cancelledAt || '') >= cancelCutoff)
      .sort((a, b) => (b.cancelledAt || '').localeCompare(a.cancelledAt || ''));
    // 자리이동 신청(본인 건) — 학생 리포트에만. app_settings seat_move_requests:{campus} 에서 추려 전달.
    const mySeatMoves = audience === 'student'
      ? (await getSeatMoveRequests(student.campus).catch(() => []))
          .filter((r) => r.studentId === student.id)
          .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      : [];
    const maskedStudent = buildMaskedStudent(student, audience, myBookings, consultationHistory, consultationCancellations, mySeatMoves);
    const mockExams = filterMockExamsForStudent(allExams, student);

    // core: 무거운 집계(전학생 벤치마크·순공통계) 없이 즉시 반환 — extras 가 뒤따라온다.
    if (scope === 'core') {
      return NextResponse.json({ success: true, data: maskedStudent, mockExams });
    }

    // 전체 응답(레거시/공유토큰 없는 단일 요청) — 집계 소스는 병렬로 로드
    const { weekStart, monthStart, todayStr } = getPeriodBounds();
    const [students, sessions, weeklyMinutesByStudent, presenceMarks] = await Promise.all([
      getStudents(),
      getStudySessions(id, monthStart).catch(() => null),
      getStudyMinutesByStudent(weekStart).catch(() => null),
      // 좌석판 수기 출석(present) — QR 세션 없는 날 재석 파생용
      getStudentSeatPresenceMarks(id, monthStart, todayStr).catch(() => []),
    ]);
    const materialBenchmarks = buildMaterialBenchmarks(students);

    // 순공/등하원 통계 (Supabase 필요 — 실패해도 리포트 본문은 정상 반환)
    let studyStats = null;
    if (sessions && weeklyMinutesByStudent) {
      try {
        studyStats = buildStudyStats({
          sessions,
          weeklyMinutesByStudent,
          myId: id,
          totalStudents: students.length,
          presenceMarks,
          focusMinutesByDate: parseSpecialNoteEnvelope(student.specialNote).pomodoro_minutes || undefined,
        });
      } catch (e) {
        console.warn('studyStats 계산 생략:', (e as Error)?.message);
      }
    }

    return NextResponse.json({ success: true, data: maskedStudent, materialBenchmarks, studyStats, mockExams });
  } catch (error) {
    console.error(`API GET /report/${id} error:`, error);
    return NextResponse.json(
      { success: false, message: '리포트 로드 중 에러가 발생했습니다.' },
      { status: 500 }
    );
  }
}
