import { NextResponse } from 'next/server';
import { canAdminAccessStudent } from '@/lib/auth';
import { getStudentById, setStudentPasswordHash, updateStudentById } from '@/lib/store';

type PendingPasswordChange = { hash: string; requestedAt: string };

const getPending = (state: Record<string, unknown> | undefined) =>
  (state?.passwordChange as PendingPasswordChange | undefined);

// 관리자: 출결번호 변경 신청 승인 → 대기 중인 새 해시를 실제 비밀번호로 적용하고 신청을 비운다.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await canAdminAccessStudent(id))) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });
  }
  try {
    const student = await getStudentById(id);
    const pending = getPending(student?.studentState);
    if (!student || !pending) {
      return NextResponse.json({ success: false, message: '변경 신청을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 새 비밀번호 해시 적용 (students upsert 가 건드리지 않는 컬럼이라 전용 경로 사용)
    await setStudentPasswordHash(id, pending.hash);
    // 대기값 제거
    const result = await updateStudentById(id, (s) => {
      const next = { ...(s.studentState || {}) };
      delete next.passwordChange;
      s.studentState = next;
    });
    if (typeof result === 'string') {
      return NextResponse.json({ success: false, message: '처리가 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' }, { status: 409 });
    }
    return NextResponse.json({ success: true, message: `${student.name} 학생의 출결번호 변경을 승인했습니다.` });
  } catch (error) {
    console.error('approve password-request error:', error);
    return NextResponse.json({ success: false, message: '승인 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

// 관리자: 출결번호 변경 신청 반려 → 대기값만 비운다(기존 비밀번호 유지).
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await canAdminAccessStudent(id))) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });
  }
  try {
    const student = await getStudentById(id);
    const pending = getPending(student?.studentState);
    if (!student || !pending) {
      return NextResponse.json({ success: false, message: '변경 신청을 찾을 수 없습니다.' }, { status: 404 });
    }
    const result = await updateStudentById(id, (s) => {
      const next = { ...(s.studentState || {}) };
      delete next.passwordChange;
      s.studentState = next;
    });
    if (typeof result === 'string') {
      return NextResponse.json({ success: false, message: '처리가 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' }, { status: 409 });
    }
    return NextResponse.json({ success: true, message: '변경 신청을 반려했습니다.' });
  } catch (error) {
    console.error('reject password-request error:', error);
    return NextResponse.json({ success: false, message: '반려 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
