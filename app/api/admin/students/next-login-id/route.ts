import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { getStudents } from '@/lib/store';

// 관리자: 다음 임시 로그인 ID 발급 (sparta00001 형식, 전 센터 통합 순차)
// 모든 학생의 loginId 중 sparta+숫자 형식의 최대값 +1 을 반환한다(센터 무관 비충돌).
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  try {
    const students = await getStudents();
    let max = 0;
    for (const s of students) {
      const m = /^sparta(\d+)$/.exec((s.loginId || '').trim().toLowerCase());
      if (m) {
        const n = Number(m[1]);
        if (Number.isFinite(n) && n > max) max = n;
      }
    }
    const next = max + 1;
    const loginId = `sparta${String(next).padStart(5, '0')}`;
    return NextResponse.json({ success: true, loginId });
  } catch (e: any) {
    console.error('next-login-id error:', e);
    return NextResponse.json({ success: false, message: e?.message || '발급 실패' }, { status: 500 });
  }
}
