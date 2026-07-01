import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { sharedRateLimit, clientIp } from '@/lib/rate-limit';
import { getStudentAuthRecords, getStudentApplications, addStudentApplication } from '@/lib/store';
import { normalizeAttendanceCode, validateAttendanceCode } from '@/lib/attendance-code';
import type { StudentApplication } from '@/lib/types/student';

const onlyDigits = (value: unknown) => String(value ?? '').replace(/\D/g, '');
const normalizeLoginId = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
const ALLOWED_CAMPUS = ['wonju', 'chuncheon', 'chungju'];

// 공개: 학생 셀프 가입신청 접수 (승인 대기열에 적재).
// 학생이 이름·아이디·비밀번호·연락처·목표시험·희망캠퍼스를 직접 입력해 보낸다.
// 정식 원생은 관리자가 승인할 때 생성되므로, 이 단계에서는 로그인 불가.
export async function POST(request: Request) {
  // 무차별/스팸 방지: IP당 10분에 5회
  const rl = await sharedRateLimit(`student-signup:${clientIp(request)}`, 5, 10 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, message: `신청이 너무 많습니다. ${rl.retryAfterSec}초 후 다시 시도해 주세요.` },
      { status: 429 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const name = String(body.name ?? '').trim().slice(0, 40);
  const loginId = normalizeLoginId(body.loginId);
  const code = normalizeAttendanceCode(body.password); // 비밀번호 = 출결번호(숫자 6자리)
  const studentPhone = onlyDigits(body.studentPhone);
  const parentPhone = onlyDigits(body.parentPhone);
  const contact = String(body.contact ?? '').trim().slice(0, 40);
  const campusRaw = String(body.campus ?? '').trim();
  const campus = ALLOWED_CAMPUS.includes(campusRaw) ? campusRaw : undefined;
  const smsTargets = Array.isArray(body.smsTargets)
    ? (body.smsTargets.filter((t): t is 'parent' | 'student' => t === 'parent' || t === 'student'))
    : [];

  if (!name) {
    return NextResponse.json({ success: false, message: '이름을 입력해 주세요.' }, { status: 400 });
  }
  if (loginId.length < 4) {
    return NextResponse.json({ success: false, message: '로그인 아이디는 영문/숫자 4자 이상이어야 합니다.' }, { status: 400 });
  }
  if (!studentPhone && !parentPhone) {
    return NextResponse.json({ success: false, message: '본인 또는 학부모 연락처 중 하나는 입력해 주세요.' }, { status: 400 });
  }
  // 출결번호(비밀번호): 숫자 6자리 + 휴대폰 번호와 비중복
  const codeError = validateAttendanceCode(code, [studentPhone, parentPhone]);
  if (codeError) {
    return NextResponse.json({ success: false, message: codeError }, { status: 400 });
  }

  try {
    // 아이디 중복 확인: 기존 정식 원생 + 이미 접수된 대기 신청 양쪽 모두
    const [authRecords, pending] = await Promise.all([
      getStudentAuthRecords(),
      getStudentApplications(),
    ]);
    const takenByStudent = authRecords.some((r) => (r.login_id || '').toLowerCase() === loginId);
    const takenByPending = pending.some((a) => a.loginId.toLowerCase() === loginId);
    if (takenByStudent || takenByPending) {
      return NextResponse.json({ success: false, message: '이미 사용 중인 아이디입니다. 다른 아이디를 입력해 주세요.' }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(code, 10);
    const application: StudentApplication = {
      id: `app_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      loginId,
      passwordHash,
      studentPhone: studentPhone || undefined,
      parentPhone: parentPhone || undefined,
      smsTargets,
      contact: contact || undefined,
      campus,
      createdAt: new Date().toISOString(),
    };
    await addStudentApplication(application);

    return NextResponse.json({ success: true, message: '가입신청이 접수되었습니다. 승인 후 로그인하실 수 있습니다.' });
  } catch (error) {
    console.error('student signup error:', error);
    return NextResponse.json({ success: false, message: '신청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' }, { status: 500 });
  }
}
