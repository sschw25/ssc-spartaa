import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('admin-session')?.value;

  if (sessionToken === 'ssc-admin-authorized-token-2026') {
    return NextResponse.json({ authenticated: true, role: 'admin' });
  }

  return NextResponse.json({ authenticated: false }, { status: 401 });
}
