import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { isAdmin } from '@/lib/auth';
import { setStudentPasswordHash } from '@/lib/store';

// 관리자: 학생 포털 비밀번호 설정/초기화 (평문은 저장하지 않고 해시만 저장)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  const { id } = await params;
  try {
    const { password } = await request.json();
    if (!password || String(password).length < 4) {
      return NextResponse.json({ success: false, message: '비밀번호는 4자 이상이어야 합니다.' }, { status: 400 });
    }
    const hash = await bcrypt.hash(String(password), 10);
    await setStudentPasswordHash(id, hash);
    return NextResponse.json({ success: true, message: '비밀번호가 설정되었습니다.' });
  } catch (e: any) {
    console.error('set student password error:', e);
    return NextResponse.json({ success: false, message: e?.message || '비밀번호 설정 실패' }, { status: 500 });
  }
}
