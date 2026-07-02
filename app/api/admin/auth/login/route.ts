import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { timingSafeEqual } from 'crypto';
import { sharedRateLimit, clientIp } from '@/lib/rate-limit';
import { getAdminAccountByUsername } from '@/lib/store';
import { signAdminSession } from '@/lib/auth';

// 마스터 비밀번호 상수시간 비교 (타이밍 공격 방지). 길이 다르면 즉시 false.
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

const SESSION_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 60 * 60 * 24,
  path: '/',
};

export async function POST(request: Request) {
  const rl = await sharedRateLimit(`admin-login:${clientIp(request)}`, 10, 5 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, message: `로그인 시도가 너무 많습니다. ${rl.retryAfterSec}초 후 다시 시도해 주세요.` },
      { status: 429 }
    );
  }
  const correctPassword = process.env.ADMIN_PASSWORD;
  const sessionSecret = process.env.ADMIN_SESSION_SECRET;
  if (!correctPassword || !sessionSecret) {
    console.error('[admin/login] ADMIN_PASSWORD 또는 ADMIN_SESSION_SECRET 환경변수가 설정되지 않았습니다.');
    return NextResponse.json({ success: false, message: '서버 설정 오류입니다.' }, { status: 500 });
  }

  try {
    const { username: rawUsername, password } = await request.json();
    const username = String(rawUsername ?? '').trim();

    // 1. 마스터 관리자(환경변수) 검사
    if (username === 'admin' && typeof correctPassword === 'string' && correctPassword.length > 0 && safeEqual(String(password), correctPassword)) {
      const token = signAdminSession({
        id: 'super_admin',
        username: 'admin',
        campus: 'all',
        role: 'super',
      });
      const cookieStore = await cookies();
      cookieStore.set('admin-session', token, SESSION_COOKIE_OPTS);
      return NextResponse.json({ success: true, message: '로그인에 성공했습니다.' });
    }

    // 2. DB 등록 관리자 검사
    const dbAdmin = await getAdminAccountByUsername(username);
    if (dbAdmin && dbAdmin.passwordHash) {
      const match = await bcrypt.compare(String(password), dbAdmin.passwordHash);
      if (match) {
        const token = signAdminSession({
          id: dbAdmin.id,
          username: dbAdmin.username,
          campus: dbAdmin.campus,
          role: dbAdmin.role,
        });
        const cookieStore = await cookies();
        cookieStore.set('admin-session', token, SESSION_COOKIE_OPTS);
        return NextResponse.json({ success: true, message: '로그인에 성공했습니다.' });
      }
    }

    return NextResponse.json(
      { success: false, message: '아이디 또는 비밀번호가 올바르지 않습니다.' },
      { status: 401 }
    );
  } catch (error: any) {
    console.error('Login error:', error);
    const errMsg = error?.message || '';
    if (errMsg.includes('relation "admin_accounts" does not exist') || error?.code === '42P01') {
      return NextResponse.json({
        success: false,
        message: '데이터베이스에 admin_accounts 테이블이 없습니다. supabase/migration-admin-accounts.sql 스크립트를 Supabase SQL Editor에서 실행해 주세요.'
      }, { status: 500 });
    }
    return NextResponse.json(
      { success: false, message: '서버 에러가 발생했습니다: ' + errMsg },
      { status: 500 }
    );
  }
}

