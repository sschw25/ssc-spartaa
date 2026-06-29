import { NextResponse } from 'next/server';
import { getStudentById, saveStudent } from '@/lib/store';
import { isSupabaseConfigured } from '@/lib/supabase';
import { randomBytes, randomInt } from 'crypto';
import { hash } from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';
import { canAdminAccessStudent } from '@/lib/auth';

async function patchSupabaseToken(
  id: string,
  token: string | null,
  expiresAt: string | null,
  passwordHash: string | null,
) {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) as string;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await sb
    .from('students')
    .update({
      share_token: token,
      share_token_expires_at: expiresAt,
      share_password: passwordHash,
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
  const { id } = await params;
  if (!(await canAdminAccessStudent(id))) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });
  }

  const token = randomBytes(16).toString('hex');
  const password = String(randomInt(100000, 999999)); // 6자리 숫자 — 일회성 노출 후 해시만 보관
  const passwordHash = await hash(password, 10);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  try {
    if (isSupabaseConfigured()) {
      await patchSupabaseToken(id, token, expiresAt, passwordHash);
    } else {
      const student = await getStudentById(id);
      if (!student) return NextResponse.json({ success: false, message: '학생을 찾을 수 없습니다.' }, { status: 404 });
      student.shareToken = token;
      student.shareTokenExpiresAt = expiresAt;
      student.sharePasswordHash = passwordHash;
      await saveStudent(student);
    }
    // plaintext password는 응답에 한 번만 포함 — 이후 DB에서는 해시만 존재
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
  const { id } = await params;
  if (!(await canAdminAccessStudent(id))) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });
  }

  try {
    if (isSupabaseConfigured()) {
      await patchSupabaseToken(id, null, null, null);
    } else {
      const student = await getStudentById(id);
      if (!student) return NextResponse.json({ success: false, message: '학생을 찾을 수 없습니다.' }, { status: 404 });
      student.shareToken = undefined;
      student.shareTokenExpiresAt = undefined;
      student.sharePasswordHash = undefined;
      await saveStudent(student);
    }
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('share-token DELETE error:', e?.message || e);
    return NextResponse.json({ success: false, message: e?.message || '링크 폐기에 실패했습니다.' }, { status: 500 });
  }
}
