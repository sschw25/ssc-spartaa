import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { createAttendToken, verifyKioskKey, ATTEND_WINDOW_MS } from '@/lib/attendance-token';

// 키오스크용 짧은 만료 QR 토큰 발급.
// 관리자 세션 또는 ATTEND_KIOSK_KEY가 있는 전용 키오스크에서만 발급한다.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get('key') || request.headers.get('x-kiosk-key');

  const allowed = verifyKioskKey(key) || (await isAdmin());
  if (!allowed) {
    return NextResponse.json(
      { success: false, message: '권한이 없습니다. 관리자 로그인 또는 키오스크 키가 필요합니다.' },
      { status: 401 }
    );
  }

  return NextResponse.json({ success: true, token: createAttendToken(), windowMs: ATTEND_WINDOW_MS });
}
