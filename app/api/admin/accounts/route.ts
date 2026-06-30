import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getAdminSession, isValidAdminCampus, isValidAdminRole } from '@/lib/auth';
import { getAdminAccounts, getAdminAccountByUsername, saveAdminAccount } from '@/lib/store';
import { AdminAccount } from '@/lib/types/student';

// 1. 관리자 계정 목록 조회 (슈퍼 관리자 전용)
export async function GET() {
  const session = await getAdminSession();
  if (!session || session.role !== 'super') {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });
  }

  try {
    const accounts = await getAdminAccounts();
    // 보안을 위해 비밀번호 해시는 제외하고 응답
    const sanitized = accounts.map(({ passwordHash: _, ...rest }) => rest);
    return NextResponse.json({ success: true, data: sanitized });
  } catch (error: any) {
    console.error('API GET /admin/accounts error:', error);
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

// 2. 신규 관리자 계정 추가 (슈퍼 관리자 전용)
export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session || session.role !== 'super') {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });
  }

  try {
    const { username, password, campus, role } = await request.json();

    if (!username || !password || !campus || !role) {
      return NextResponse.json({ success: false, message: '필수 정보를 모두 입력해 주세요.' }, { status: 400 });
    }

    // campus/role 은 허용된 값만 (임의 문자열로 권한·소속을 위조하지 못하게)
    if (!isValidAdminCampus(campus) || !isValidAdminRole(role)) {
      return NextResponse.json({ success: false, message: '캠퍼스 또는 역할 값이 올바르지 않습니다.' }, { status: 400 });
    }

    // 세션 토큰 구분자(':')·서명 구분자('.') 오염 방지
    if (String(username).includes(':') || String(username).includes('.')) {
      return NextResponse.json({ success: false, message: '아이디에 : 또는 . 는 사용할 수 없습니다.' }, { status: 400 });
    }

    // 아이디 중복 확인 (대소문자 구분 없이 확인)
    const existing = await getAdminAccountByUsername(username);
    if (existing || username.toLowerCase() === 'admin') {
      return NextResponse.json({ success: false, message: '이미 존재하는 관리자 아이디입니다.' }, { status: 409 });
    }

    // 비밀번호 해싱
    const passwordHash = await bcrypt.hash(String(password), 10);
    const now = new Date().toISOString();

    const newAdmin: AdminAccount = {
      id: `adm_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      username: username.trim(),
      passwordHash,
      campus,
      role,
      createdAt: now,
      updatedAt: now,
    };

    const saved = await saveAdminAccount(newAdmin);
    const { passwordHash: _, ...safeData } = saved;

    return NextResponse.json({ success: true, data: safeData });
  } catch (error: any) {
    console.error('API POST /admin/accounts error:', error);
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
