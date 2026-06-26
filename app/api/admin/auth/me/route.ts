import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';

export async function GET() {
  const session = await getAdminSession();
  if (session) {
    return NextResponse.json({
      authenticated: true,
      id: session.id,
      username: session.username,
      campus: session.campus,
      role: session.role,
    });
  }
  return NextResponse.json({ authenticated: false }, { status: 401 });
}

