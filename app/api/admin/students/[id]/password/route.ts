import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { canAdminAccessStudent } from '@/lib/auth';
import { setStudentPasswordHash, getStudentById, getStudentAuthRecords } from '@/lib/store';

// 관리자: 학생 포털 비밀번호 설정/초기화 (평문은 저장하지 않고 해시만 저장)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!(await canAdminAccessStudent(id))) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });
  }
  try {
    const { password } = await request.json();
    if (!password || String(password).length < 4) {
      return NextResponse.json({ success: false, message: '비밀번호는 4자 이상이어야 합니다.' }, { status: 400 });
    }

    const targetStudent = await getStudentById(id);
    if (!targetStudent) {
      return NextResponse.json({ success: false, message: '원생을 찾을 수 없습니다.' }, { status: 404 });
    }

    const normalizeName = (name: string) => name.trim().replace(/\s+/g, '').toLowerCase();
    const normalizedTargetName = normalizeName(targetStudent.name);

    // 동명이인 학생 중 이미 동일한 비밀번호를 사용하는 학생이 있는지 검사
    const authRecords = await getStudentAuthRecords();
    const sameNameOthers = authRecords.filter(
      (r) => r.id !== id && normalizeName(r.name) === normalizedTargetName && r.password_hash
    );

    for (const other of sameNameOthers) {
      if (await bcrypt.compare(String(password), other.password_hash!)) {
        return NextResponse.json(
          {
            success: false,
            message: '이미 동일한 이름과 비밀번호를 사용하는 다른 원생이 존재합니다. 로그인 중복 방지를 위해 다른 비밀번호를 설정해 주세요.',
          },
          { status: 400 }
        );
      }
    }

    const hash = await bcrypt.hash(String(password), 10);
    await setStudentPasswordHash(id, hash);
    return NextResponse.json({ success: true, message: '비밀번호가 설정되었습니다.' });
  } catch (e: any) {
    console.error('set student password error:', e);
    return NextResponse.json({ success: false, message: e?.message || '비밀번호 설정 실패' }, { status: 500 });
  }
}
