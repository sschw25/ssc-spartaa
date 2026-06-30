import { NextResponse } from 'next/server';
import { getStudentById, deleteStudent, patchStudentSubjects, patchStudentProfile, updateStudentById, removeConsultationBookingsForStudent } from '@/lib/store';
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

    const result = await updateStudentById(id, (student) => {
      Object.assign(student, studentData);
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
      return NextResponse.json({ success: true, message: '원생이 삭제되었습니다.' });
    }
    return NextResponse.json({ success: false, message: '삭제할 원생을 찾을 수 없습니다.' }, { status: 404 });
  } catch (error) {
    console.error(`API DELETE /students/${id} error:`, error);
    return NextResponse.json({ success: false, message: '원생 삭제에 실패했습니다.' }, { status: 500 });
  }
}
