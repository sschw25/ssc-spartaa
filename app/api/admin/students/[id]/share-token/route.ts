import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getStudentById, saveStudent } from '@/lib/store';
import { isSupabaseConfigured } from '@/lib/supabase';
import { randomBytes, randomInt } from 'crypto';
import { createClient } from '@supabase/supabase-js';

async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('admin-session')?.value;
  return sessionToken === 'ssc-admin-authorized-token-2026';
}

async function patchSupabaseToken(
  id: string,
  token: string | null,
  expiresAt: string | null,
  password: string | null,
) {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) as string;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await sb
    .from('students')
    .update({
      share_token: token,
      share_token_expires_at: expiresAt,
      share_password: password,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
}

// 학부모 공유 링크 + 비밀번호 생성 (7일 유효)
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  const { id } = await params;

  const token = randomBytes(16).toString('hex');
  const password = String(randomInt(100000, 999999)); // 6자리 숫자
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  try {
    if (isSupabaseConfigured()) {
      await patchSupabaseToken(id, token, expiresAt, password);
    } else {
      const student = await getStudentById(id);
      if (!student) return NextResponse.json({ success: false, message: '학생을 찾을 수 없습니다.' }, { status: 404 });
      student.shareToken = token;
      student.shareTokenExpiresAt = expiresAt;
      student.sharePassword = password;
      await saveStudent(student);
    }
    return NextResponse.json({ success: true, token, password, expiresAt });
  } catch (e: any) {
    console.error('share-token POST error:', e?.message || e);
    return NextResponse.json({ success: false, message: e?.message || '링크 생성에 실패했습니다.' }, { status: 500 });
  }
}

// 학부모 공유 링크 + 비밀번호 폐기
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  const { id } = await params;

  try {
    if (isSupabaseConfigured()) {
      await patchSupabaseToken(id, null, null, null);
    } else {
      const student = await getStudentById(id);
      if (!student) return NextResponse.json({ success: false, message: '학생을 찾을 수 없습니다.' }, { status: 404 });
      student.shareToken = undefined;
      student.shareTokenExpiresAt = undefined;
      student.sharePassword = undefined;
      await saveStudent(student);
    }
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('share-token DELETE error:', e?.message || e);
    return NextResponse.json({ success: false, message: e?.message || '링크 폐기에 실패했습니다.' }, { status: 500 });
  }
}
