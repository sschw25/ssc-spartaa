import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';

export async function GET() {
  if (await isAdmin()) {
    return NextResponse.json({ authenticated: true, role: 'admin' });
  }
  return NextResponse.json({ authenticated: false }, { status: 401 });
}
