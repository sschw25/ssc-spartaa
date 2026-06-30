import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { getStudentsSummary, getStudentAuthRecords, getStudentById } from '@/lib/store';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { signStudentSession, STUDENT_SESSION_COOKIE } from '@/lib/auth';

const kstToday = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());

// 이용 시작일 게이트: enrollStartDate 가 오늘(KST) 이후면 로그인 차단(승인됐지만 아직 시작 전).
// 차단 시 NextResponse, 통과 시 null.
async function startDateGate(studentId: string): Promise<NextResponse | null> {
  const student = await getStudentById(studentId);
  const start = student?.enrollStartDate;
  if (start && /^\d{4}-\d{2}-\d{2}$/.test(start) && start > kstToday()) {
    const [, m, d] = start.split('-');
    return NextResponse.json(
      { success: false, message: `이용 시작일은 ${Number(m)}월 ${Number(d)}일입니다. 시작일부터 로그인하실 수 있습니다.` },
      { status: 403 },
    );
  }
  return null;
}

const SESSION_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 60 * 60 * 24 * 30,
  path: '/',
};

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
    const body = await request.json();
    const { loginId, password, name, authCode, phoneLast4 } = body;

    // 1. 아이디/비밀번호 로그인
    if (loginId && password) {
      const normalizedId = String(loginId).trim().toLowerCase();
      const records = await getStudentAuthRecords();
      const verified = [];

      for (const r of records) {
        const matchesLoginId = r.login_id && r.login_id.toLowerCase() === normalizedId;
        const matchesName = r.name && normalizeName(r.name) === normalizeName(normalizedId);

        if ((matchesLoginId || matchesName) && r.password_hash) {
          if (await bcrypt.compare(String(password), r.password_hash)) {
            verified.push(r);
          }
        }
      }

      if (verified.length === 0) {
        return NextResponse.json(
          { success: false, message: '아이디 또는 비밀번호가 올바르지 않습니다.' },
          { status: 401 }
        );
      }

      if (verified.length > 1) {
        return NextResponse.json(
          { success: false, message: '중복된 로그인 ID가 발견되었습니다. 관리자에게 문의하세요.' },
          { status: 409 }
        );
      }

      const me = verified[0];
      const gate = await startDateGate(me.id);
      if (gate) return gate;
      const cookieStore = await cookies();
      cookieStore.set(STUDENT_SESSION_COOKIE, signStudentSession(me.id), SESSION_COOKIE_OPTS);
      return NextResponse.json({ success: true, studentName: me.name, reportUrl: `/report/${me.id}?audience=student` });
    }

    // 2. 하위 호환 폴백: 이름 + 비밀번호/확인코드 로그인
    const normalizedName = normalizeName(name);
    if (normalizedName) {
      if (password) {
        const records = await getStudentAuthRecords();
        const verified = [];
        for (const r of records) {
          if (normalizeName(r.name) === normalizedName && r.password_hash) {
            if (await bcrypt.compare(String(password), r.password_hash)) verified.push(r);
          }
        }
        if (verified.length > 0) {
          if (verified.length > 1) {
            return NextResponse.json({ success: false, message: '동명이인이 있어 관리자 확인이 필요합니다.' }, { status: 409 });
          }
          const me = verified[0];
          const gate = await startDateGate(me.id);
          if (gate) return gate;
          const cookieStore = await cookies();
          cookieStore.set(STUDENT_SESSION_COOKIE, signStudentSession(me.id), SESSION_COOKIE_OPTS);
          return NextResponse.json({ success: true, studentName: me.name, reportUrl: `/report/${me.id}?audience=student` });
        }
      }

      // 취약 폴백(이름 + 전화 끝 4자리). 학생 ID 끝 4자리 추측 경로는 제거했고,
      // 남은 전화 끝 4자리 경로도 기본 비활성 — ALLOW_LEGACY_STUDENT_LOGIN=1 일 때만 허용한다.
      // (정식 경로는 로그인ID+비밀번호. 비밀번호 미설정 학생은 관리자가 비밀번호를 발급해야 한다.)
      const legacyPhoneLoginEnabled = process.env.ALLOW_LEGACY_STUDENT_LOGIN === '1';
      const normalizedCode = normalizeCode(authCode || phoneLast4);
      if (legacyPhoneLoginEnabled && normalizedCode.length === 4) {
        const students = await getStudentsSummary();
        const matches = students.filter((student) => {
          const studentName = normalizeName(student.name);
          const contactDigits = onlyDigits(student.contact);
          const matchesPhone = /^\d{4}$/.test(normalizedCode) && contactDigits.endsWith(normalizedCode);
          return studentName === normalizedName && matchesPhone;
        });

        if (matches.length > 0) {
          if (matches.length > 1) {
            return NextResponse.json({ success: false, message: '동명이인이 있어 관리자 확인이 필요합니다.' }, { status: 409 });
          }
          const student = matches[0];
          const gate = await startDateGate(student.id);
          if (gate) return gate;
          const cookieStore = await cookies();
          cookieStore.set(STUDENT_SESSION_COOKIE, signStudentSession(student.id), SESSION_COOKIE_OPTS);
          return NextResponse.json({
            success: true,
            studentName: student.name,
            reportUrl: `/report/${student.id}?audience=student`,
          });
        }
      }
    }

    return NextResponse.json(
      { success: false, message: '아이디와 비밀번호를 올바르게 입력해 주세요.' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Student login error:', error);
    return NextResponse.json(
      { success: false, message: '로그인 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
