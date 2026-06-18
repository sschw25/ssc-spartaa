import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { getStudents, getStudentAuthRecords } from '@/lib/store';
import { rateLimit, clientIp } from '@/lib/rate-limit';

const normalizeName = (value: unknown) =>
  String(value || '').trim().replace(/\s+/g, '').toLowerCase();

const onlyDigits = (value: unknown) => String(value || '').replace(/\D/g, '');
const normalizeCode = (value: unknown) =>
  String(value || '').trim().replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

export async function POST(request: Request) {
  // 무차별 대입 방지: IP당 5분에 10회 시도 제한
  const rl = rateLimit(`student-login:${clientIp(request)}`, 10, 5 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, message: `로그인 시도가 너무 많습니다. ${rl.retryAfterSec}초 후 다시 시도해 주세요.` },
      { status: 429 }
    );
  }
  try {
    const { name, authCode, phoneLast4, password } = await request.json();
    const normalizedName = normalizeName(name);

    if (!normalizedName) {
      return NextResponse.json({ success: false, message: '이름을 입력해 주세요.' }, { status: 400 });
    }

    // 비밀번호 로그인 (권장) — 해시 비교
    if (password) {
      const records = await getStudentAuthRecords();
      const verified = [];
      for (const r of records) {
        if (normalizeName(r.name) === normalizedName && r.password_hash) {
          if (await bcrypt.compare(String(password), r.password_hash)) verified.push(r);
        }
      }
      if (verified.length === 0) {
        return NextResponse.json(
          { success: false, message: '이름 또는 비밀번호가 올바르지 않습니다. (비밀번호 미설정 시 관리자에게 문의)' },
          { status: 401 }
        );
      }
      if (verified.length > 1) {
        return NextResponse.json({ success: false, message: '동명이인이 있어 관리자 확인이 필요합니다.' }, { status: 409 });
      }
      const me = verified[0];
      const cookieStore = await cookies();
      cookieStore.set('student-session', me.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30,
        path: '/',
      });
      return NextResponse.json({ success: true, studentName: me.name, reportUrl: `/report/${me.id}?audience=student` });
    }

    // 확인코드(전화 뒷자리/학생코드) 로그인 — 비밀번호 미설정 학생용 폴백
    const normalizedCode = normalizeCode(authCode || phoneLast4);
    if (normalizedCode.length !== 4) {
      return NextResponse.json(
        { success: false, message: '비밀번호 또는 확인코드 4자리를 입력해 주세요.' },
        { status: 400 }
      );
    }

    const students = await getStudents();
    const matches = students.filter((student) => {
      const studentName = normalizeName(student.name);
      const contactDigits = onlyDigits(student.contact);
      const studentCode = normalizeCode(student.id).slice(-4);
      const matchesPhone = /^\d{4}$/.test(normalizedCode) && contactDigits.endsWith(normalizedCode);
      const matchesStudentCode = studentCode === normalizedCode;
      return studentName === normalizedName && (matchesPhone || matchesStudentCode);
    });

    if (matches.length === 0) {
      return NextResponse.json(
        { success: false, message: '일치하는 학생 정보를 찾을 수 없습니다.' },
        { status: 401 }
      );
    }

    if (matches.length > 1) {
      return NextResponse.json(
        { success: false, message: '동명이인이 있어 관리자 확인이 필요합니다.' },
        { status: 409 }
      );
    }

    const student = matches[0];
    const cookieStore = await cookies();
    cookieStore.set('student-session', student.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    });

    return NextResponse.json({
      success: true,
      studentName: student.name,
      reportUrl: `/report/${student.id}?audience=student`,
    });
  } catch (error) {
    console.error('Student login error:', error);
    return NextResponse.json(
      { success: false, message: '로그인 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
