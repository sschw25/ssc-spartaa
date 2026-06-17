import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();
    const correctPassword = process.env.ADMIN_PASSWORD || 'sparta123!';

    // 디폴트 계정 admin / sparta123!
    if (username === 'admin' && password === correctPassword) {
      const cookieStore = await cookies();
      
      cookieStore.set('admin-session', 'ssc-admin-authorized-token-2026', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24, // 1일 유지
        path: '/',
      });

      return NextResponse.json({ success: true, message: '로그인에 성공했습니다.' });
    }

    return NextResponse.json(
      { success: false, message: '아이디 또는 비밀번호가 올바르지 않습니다.' },
      { status: 401 }
    );
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { success: false, message: '서버 에러가 발생했습니다.' },
      { status: 500 }
    );
  }
}
