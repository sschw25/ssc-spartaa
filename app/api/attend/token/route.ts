import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { createAttendToken, ATTEND_WINDOW_MS } from '@/lib/attendance-token';

// 키오스크 전용: 짧은 만료 QR 토큰 발급 (관리자 세션 필요)
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  return NextResponse.json({ success: true, token: createAttendToken(), windowMs: ATTEND_WINDOW_MS });
}
