import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { getStudents } from '@/lib/store';

type PendingPasswordChange = { hash: string; requestedAt: string };

// 관리자: 출결번호(비밀번호) 변경 신청 대기 목록.
// student_state.passwordChange 가 있는 학생을 추려서 반환(해시는 노출하지 않음). 캠퍼스 스코프.
export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  try {
    const students = await getStudents();
    const scoped = session.campus === 'all' ? students : students.filter((s) => s.campus === session.campus);
    const requests = scoped
      .map((s) => {
        const pc = (s.studentState?.passwordChange as PendingPasswordChange | undefined);
        if (!pc) return null;
        return { id: s.id, name: s.name, loginId: s.loginId || null, campus: s.campus, requestedAt: pc.requestedAt || null };
      })
      .filter(Boolean)
      .sort((a, b) => (a!.requestedAt || '').localeCompare(b!.requestedAt || ''));
    return NextResponse.json({ success: true, data: requests });
  } catch (error) {
    console.error('GET /admin/password-requests error:', error);
    return NextResponse.json({ success: false, message: '신청 목록 조회에 실패했습니다.' }, { status: 500 });
  }
}
