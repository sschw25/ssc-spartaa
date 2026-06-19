import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// 학생 포털 로그아웃 — student-session 쿠키 제거
export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete('student-session');
  return NextResponse.json({ success: true });
}
