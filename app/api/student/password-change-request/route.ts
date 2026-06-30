import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { getStudentAuthRecords, getStudentById, updateStudentById } from '@/lib/store';
import { normalizeAttendanceCode, validateAttendanceCode } from '@/lib/attendance-code';

const normalizeName = (value: unknown) => String(value || '').trim().replace(/\s+/g, '').toLowerCase();

// 공개: 학생 비밀번호(출결번호) 변경 '신청'. 본인 확인(현재 비번) 후 새 출결번호를 대기열에 적재한다.
// 실제 적용은 관리자가 승인할 때 이뤄진다(student_state.passwordChange 에 해시 보관).
export async function POST(request: Request) {
  const rl = rateLimit(`pw-change:${clientIp(request)}`, 5, 10 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, message: `요청이 너무 많습니다. ${rl.retryAfterSec}초 후 다시 시도해 주세요.` },
      { status: 429 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const loginIdRaw = String(body.loginId ?? '').trim().toLowerCase();
  const currentPassword = String(body.currentPassword ?? '');
  const newCode = normalizeAttendanceCode(body.newPassword);

  if (!loginIdRaw || !currentPassword) {
    return NextResponse.json({ success: false, message: '아이디와 현재 출결번호를 입력해 주세요.' }, { status: 400 });
  }

  try {
    // 본인 확인: 아이디(또는 이름) + 현재 비밀번호 일치
    const records = await getStudentAuthRecords();
    const verified = [];
    for (const r of records) {
      const matches = (r.login_id && r.login_id.toLowerCase() === loginIdRaw)
        || (r.name && normalizeName(r.name) === normalizeName(loginIdRaw));
      if (matches && r.password_hash && await bcrypt.compare(currentPassword, r.password_hash)) {
        verified.push(r);
      }
    }
    if (verified.length === 0) {
      return NextResponse.json({ success: false, message: '아이디 또는 현재 출결번호가 올바르지 않습니다.' }, { status: 401 });
    }
    if (verified.length > 1) {
      return NextResponse.json({ success: false, message: '동명이인이 있어 관리자 확인이 필요합니다.' }, { status: 409 });
    }

    const me = verified[0];
    const student = await getStudentById(me.id);
    if (!student) {
      return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 새 출결번호: 숫자 6자리 + 본인/학부모 휴대폰과 비중복
    const codeError = validateAttendanceCode(newCode, [student.studentPhone, student.parentPhone]);
    if (codeError) {
      return NextResponse.json({ success: false, message: codeError }, { status: 400 });
    }

    const newHash = await bcrypt.hash(newCode, 10);
    const result = await updateStudentById(me.id, (s) => {
      s.studentState = { ...(s.studentState || {}), passwordChange: { hash: newHash, requestedAt: new Date().toISOString() } };
    });
    if (typeof result === 'string') {
      return NextResponse.json({ success: false, message: '신청 처리가 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' }, { status: 409 });
    }

    return NextResponse.json({ success: true, message: '출결번호 변경 신청이 접수되었습니다. 관리자 승인 후 적용됩니다.' });
  } catch (error) {
    console.error('password-change-request error:', error);
    return NextResponse.json({ success: false, message: '신청 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
