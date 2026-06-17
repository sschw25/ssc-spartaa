import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete('admin-session');
  return NextResponse.json({ success: true, message: '로그아웃 되었습니다.' });
}
