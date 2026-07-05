import { NextResponse } from 'next/server';
import { getStudentById, deleteStudent, patchStudentSubjects, patchStudentProfile, updateStudentById, removeConsultationBookingsForStudent, getStudentAuthRecords } from '@/lib/store';
import { Student } from '@/lib/types/student';
import { getAdminSession, canAdminAccessStudent } from '@/lib/auth';
import { isConsultationCampus } from '@/lib/consultation-schedule';

// 0. 특정 원생 단건 조회
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!(await canAdminAccessStudent(id))) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });
  }

  try {
    const student = await getStudentById(id);
    if (!student) {
      return NextResponse.json({ success: false, message: '원생을 찾을 수 없습니다.' }, { status: 404 });
    }
    const { sharePasswordHash: _h, ...safeStudent } = student;
    return NextResponse.json({ success: true, data: safeStudent });
  } catch (error) {
    console.error(`API GET /students/${id} error:`, error);
    return NextResponse.json({ success: false, message: '원생 조회에 실패했습니다.' }, { status: 500 });
  }
}

// 1. 특정 원생의 상세 내용 일괄 수정 (교재/인강 진도 및 기본정보)
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!(await canAdminAccessStudent(id))) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });
  }

  try {
    const studentData = await request.json() as Student;
    if (studentData.id !== id) {
      return NextResponse.json({ success: false, message: '요청 정보가 일치하지 않습니다.' }, { status: 400 });
    }

    const session = await getAdminSession();
    if (session && session.campus !== 'all' && studentData.campus !== session.campus) {
      return NextResponse.json({ success: false, message: '해당 캠퍼스로 원생을 이동시킬 권한이 없습니다.' }, { status: 403 });
    }

    // 필드 단위 저장(opt-in): ?scope=subjects|profile 이면 해당 컬럼만 타깃 업데이트한다.
    // 전체 행을 쓰지 않으므로 쿠폰/벌점 등 다른 컬럼과 동시에 저장돼도 충돌(덮어쓰기)하지 않는다.
    // (상담 자동저장이 이 경로를 사용. scope 미지정 호출자 — detail-sheet 등 — 은 기존 전체 저장 유지.)
    const scope = new URL(request.url).searchParams.get('scope');
    if (scope === 'subjects') {
      const updated = await patchStudentSubjects(studentData);
      return NextResponse.json({ success: true, data: updated });
    }
    if (scope === 'profile') {
      const updated = await patchStudentProfile(studentData);
      return NextResponse.json({ success: true, data: updated });
    }

    // loginId 변경 시 중복 확인 — 다른 학생과 겹치면 로그인 시 verified가 2건이 되어
    // 두 학생 모두 로그인 불가가 되므로 저장 전에 차단한다(applications 승인과 동일 패턴).
    if ('loginId' in studentData && String(studentData.loginId ?? '').trim()) {
      const nextLoginId = String(studentData.loginId).trim().toLowerCase();
      const authRecords = await getStudentAuthRecords();
      if (authRecords.some((r) => r.id !== id && (r.login_id || '').toLowerCase() === nextLoginId)) {
        return NextResponse.json({ success: false, message: '이미 동일한 아이디를 사용하는 원생이 있습니다. 다른 아이디를 입력해 주세요.' }, { status: 409 });
      }
    }

    // scope 미지정(detail-sheet 전체 저장): 화이트리스트 필드만 fresh 행에 덮어쓴다.
    // 클라이언트 페이로드는 시트 로드 시점 스냅샷이라, 시트가 열린 채 다른 경로(쿠폰 적립/
    // 벌점 부여/리워드 교환/참여미션/좌석알림/뽀모도로 등)로 막 갱신된 누적성 컬럼을
    // stale 값으로 들고 있다. Object.assign 으로 통째 덮으면 그 최신값이 유실되므로,
    // detail-sheet 가 실제 편집하는 프로필/진도/기본정보 필드만 골라 적용하고 나머지
    // (leaveCoupons/penalties/rewardRedemptions/eventParticipations/seatAlerts/studentState 등
    // 서버가 자체 관리하는 적립성 데이터)는 fresh 재조회 값을 그대로 보존한다.
    // 저장 오염/DoS 방어: 관리자 경로지만 문자열/배열 상한을 넉넉히 건다.
    // 상한은 정상 사용량의 수 배(문자열은 이름류 200 / 코멘트·오버로드 필드 20000,
    // 배열은 500)로 잡아 정상 편집이 걸리지 않게 한다.
    const capStr = (v: unknown, max: number): string | undefined =>
      typeof v === 'string' ? v.slice(0, max) : (v as string | undefined);
    const capArr = <T,>(v: T[] | undefined, max: number): T[] | undefined =>
      Array.isArray(v) ? (v.length > max ? v.slice(0, max) : v) : v;

    const result = await updateStudentById(id, (student) => {
      const assign = <K extends keyof Student>(key: K) => {
        if (key in studentData) student[key] = studentData[key];
      };
      const assignStr = <K extends keyof Student>(key: K, max: number) => {
        if (key in studentData) student[key] = capStr(studentData[key], max) as Student[K];
      };
      const assignArr = <K extends keyof Student>(key: K, max: number) => {
        if (key in studentData) student[key] = capArr(studentData[key] as unknown[], max) as Student[K];
      };
      // 기본 정보 / 프로필
      assignStr('name', 200);
      assign('loginId');
      assign('campus');
      assignStr('manager', 200);
      assignStr('contact', 200);
      assign('seatNumber');
      assign('parentPhone');
      assign('studentPhone');
      assign('smsTargets');
      // 상담/생활 코멘트 및 일정 (specialNote는 오버로드 필드라 넉넉히)
      assignStr('lifeComment', 20000);
      assignStr('studentLifeComment', 20000);
      assignStr('specialNote', 20000);
      assign('nextConsultationDate');
      assign('enrollmentEndDate');
      assign('weeklyGradeCheck');
      // 진도·성적·면담 로그·외출 일정 (detail-sheet 편집 대상)
      assignArr('subjects', 500);
      assignArr('grades', 500);
      assignArr('consultationLogs', 500);
      assignArr('awaySchedules', 500);
    });
    if (result === 'not_found') {
      return NextResponse.json({ success: false, message: '원생을 찾을 수 없습니다.' }, { status: 404 });
    }
    if (typeof result === 'string') {
      return NextResponse.json({ success: false, message: '저장이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' }, { status: 409 });
    }
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error(`API PUT /students/${id} error:`, error);
    return NextResponse.json({ success: false, message: '원생 정보 갱신에 실패했습니다.' }, { status: 500 });
  }
}

// 2. 특정 원생 삭제
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!(await canAdminAccessStudent(id))) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });
  }

  try {
    // 삭제 전에 센터를 확보해 두고(상담 예약 정리에 필요), 삭제 성공 시 그 학생의
    // 상담 예약(특히 긴급 extra)을 원장에서 함께 제거한다 — 관리자 화면의 유령 레코드 방지.
    const existing = await getStudentById(id);
    const success = await deleteStudent(id);
    if (success) {
      if (existing && isConsultationCampus(existing.campus)) {
        await removeConsultationBookingsForStudent(existing.campus, id).catch((e) =>
          console.warn('상담 예약 정리 실패(무시):', e),
        );
      }
      return NextResponse.json({ success: true, message: '학생을 삭제했습니다.' });
    }
    return NextResponse.json({ success: false, message: '삭제할 원생을 찾을 수 없습니다.' }, { status: 404 });
  } catch (error) {
    console.error(`API DELETE /students/${id} error:`, error);
    return NextResponse.json({ success: false, message: '원생 삭제에 실패했습니다.' }, { status: 500 });
  }
}
