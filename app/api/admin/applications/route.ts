import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { getStudentApplications } from '@/lib/store';

// 관리자: 승인 대기 중인 가입신청 목록 조회.
// 캠퍼스 관리자는 본인 캠퍼스(또는 희망 캠퍼스 미지정) 신청만, 슈퍼 관리자는 전체.
export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  try {
    const all = await getStudentApplications();
    const scoped = session.campus === 'all'
      ? all
      : all.filter((a) => !a.campus || a.campus === session.campus);
    // 비밀번호 해시는 응답에서 제외
    const sanitized = scoped
      .map(({ passwordHash: _omit, ...rest }) => rest)
      .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    return NextResponse.json({ success: true, data: sanitized });
  } catch (error) {
    console.error('GET /admin/applications error:', error);
    return NextResponse.json({ success: false, message: '신청 목록 조회에 실패했습니다.' }, { status: 500 });
  }
}
