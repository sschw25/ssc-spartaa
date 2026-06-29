import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getAdminSession } from '@/lib/auth';
import { getAdminAccounts, saveAdminAccount, deleteAdminAccount } from '@/lib/store';
import { AdminAccount } from '@/lib/types/student';

// 1. 관리자 계정 수정 (슈퍼 관리자 전용)
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAdminSession();
  if (!session || (session.campus !== 'all' && session.role !== 'super')) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const { username, password, campus, role } = await request.json();

    // 세션 토큰 구분자(':')·서명 구분자('.') 오염 방지
    if (username && (String(username).includes(':') || String(username).includes('.'))) {
      return NextResponse.json({ success: false, message: '아이디에 : 또는 . 는 사용할 수 없습니다.' }, { status: 400 });
    }

    // 기존 계정 조회
    const accounts = await getAdminAccounts();
    const target = accounts.find((a) => a.id === id);
    if (!target) {
      return NextResponse.json({ success: false, message: '해당 관리자 계정을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 아이디 변경 시 중복 검증
    if (username && username.trim() !== target.username) {
      const dup = accounts.find(
        (a) => a.id !== id && a.username.toLowerCase() === username.trim().toLowerCase()
      );
      if (dup || username.trim().toLowerCase() === 'admin') {
        return NextResponse.json({ success: false, message: '이미 사용 중인 아이디입니다.' }, { status: 409 });
      }
    }

    let passwordHash = target.passwordHash;
    if (password && password.trim() !== '') {
      passwordHash = await bcrypt.hash(String(password), 10);
    }

    const updatedAdmin: AdminAccount = {
      ...target,
      username: username ? username.trim() : target.username,
      passwordHash,
      campus: campus || target.campus,
      role: role || target.role,
      updatedAt: new Date().toISOString(),
    };

    const saved = await saveAdminAccount(updatedAdmin);
    const { passwordHash: _, ...safeData } = saved;

    return NextResponse.json({ success: true, data: safeData });
  } catch (error: any) {
    console.error(`API PUT /admin/accounts/${id} error:`, error);
    const errMsg = error?.message || '';
    if (errMsg.includes('relation "admin_accounts" does not exist') || error?.code === '42P01') {
      return NextResponse.json({
        success: false,
        message: '데이터베이스에 admin_accounts 테이블이 없습니다. supabase/migration-admin-accounts.sql 스크립트를 Supabase SQL Editor에서 실행해 주세요.'
      }, { status: 500 });
    }
    return NextResponse.json({ success: false, message: '서버 에러가 발생했습니다: ' + errMsg }, { status: 500 });
  }
}

// 2. 관리자 계정 삭제 (슈퍼 관리자 전용)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAdminSession();
  if (!session || (session.campus !== 'all' && session.role !== 'super')) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });
  }

  const { id } = await params;

  // 본인 계정 삭제 제한
  if (session.id === id) {
    return NextResponse.json({ success: false, message: '로그인된 본인 계정은 삭제할 수 없습니다.' }, { status: 400 });
  }

  try {
    const success = await deleteAdminAccount(id);
    if (success) {
      return NextResponse.json({ success: true, message: '계정이 성공적으로 삭제되었습니다.' });
    }
    return NextResponse.json({ success: false, message: '삭제할 계정을 찾을 수 없습니다.' }, { status: 404 });
  } catch (error: any) {
    console.error(`API DELETE /admin/accounts/${id} error:`, error);
    const errMsg = error?.message || '';
    if (errMsg.includes('relation "admin_accounts" does not exist') || error?.code === '42P01') {
      return NextResponse.json({
        success: false,
        message: '데이터베이스에 admin_accounts 테이블이 없습니다. supabase/migration-admin-accounts.sql 스크립트를 Supabase SQL Editor에서 실행해 주세요.'
      }, { status: 500 });
    }
    return NextResponse.json({ success: false, message: '서버 에러가 발생했습니다: ' + errMsg }, { status: 500 });
  }
}
