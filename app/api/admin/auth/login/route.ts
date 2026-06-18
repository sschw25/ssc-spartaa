import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { rateLimit, clientIp } from '@/lib/rate-limit';

export async function POST(request: Request) {
  const rl = rateLimit(`admin-login:${clientIp(request)}`, 10, 5 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, message: `로그인 시도가 너무 많습니다. ${rl.retryAfterSec}초 후 다시 시도해 주세요.` },
      { status: 429 }
    );
  }
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
