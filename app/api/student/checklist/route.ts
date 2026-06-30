import { NextRequest, NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { getStudentById, patchStudentProgress } from '@/lib/store';
import { getSeoulDateKey, readActivityEnvelope, writeActivityEnvelope, serializeClientActivityNoteFromStudent } from '@/lib/student-activity';
import type { PhoneSubmission, Student } from '@/lib/types/student';

export async function POST(req: NextRequest) {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }

  let body: { sleepHours?: number; phoneSubmitted?: boolean; phoneStatus?: string; phoneReason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const { sleepHours } = body;
  if (sleepHours === undefined) {
    return NextResponse.json({ success: false, message: '필수 체크 항목이 누락되었습니다.' }, { status: 400 });
  }
  // 수면시간은 0~24의 유효 숫자만 허용 (NaN/음수/과대값이 리워드 판정에 새는 것 방지)
  const sleepHoursNum = Number(sleepHours);
  if (!Number.isFinite(sleepHoursNum) || sleepHoursNum < 0 || sleepHoursNum > 24) {
    return NextResponse.json({ success: false, message: '수면 시간 값이 올바르지 않습니다.' }, { status: 400 });
  }

  // 등원 시 휴대폰 처리: 제출완료(submitted) / 임시보관함(locker) / 전원종료후소지(off_hold)
  const raw = body.phoneStatus;
  const phoneStatus: 'submitted' | 'locker' | 'off_hold' =
    raw === 'locker' || raw === 'off_hold' || raw === 'submitted'
      ? raw
      : body.phoneSubmitted === false ? 'locker' : 'submitted'; // 레거시 boolean 폴백
  const phoneSubmitted = phoneStatus === 'submitted';
  const phoneReason = String(body.phoneReason ?? '').trim().slice(0, 300);
  // 제출완료가 아니면(임시보관함/전원종료후소지) 사유 필수 → 관리자에게 알림(phone_submission) 생성
  if (!phoneSubmitted && !phoneReason) {
    return NextResponse.json({ success: false, message: '휴대폰을 제출하지 않는 경우 사유를 입력해 주세요.' }, { status: 400 });
  }

  const todayKey = getSeoulDateKey();
  let checklistResult: Record<string, unknown> | undefined;

  // 낙관적 잠금 재시도: fresh 재조회 → 수정 → updated_at 조건부 저장.
  // 전체 row upsert 대신 버전 충돌을 감지·재시도하여 동시 저장(쿠폰/휴가/알림 등)이 서로를 덮지 않게 한다.
  let saved: Student | 'conflict' = 'conflict';
  for (let attempt = 0; attempt < 3; attempt++) {
    const student = await getStudentById(studentId);
    if (!student) {
      return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
    }
    const originalUpdatedAt = student.updatedAt ?? '';

    const noteObj = readActivityEnvelope(student);
    if (!noteObj.daily_checklist) noteObj.daily_checklist = {};
    const nowIso = new Date().toISOString();

    noteObj.daily_checklist[todayKey] = {
      sleep_hours: sleepHoursNum,
      phone_submitted: phoneSubmitted,
      phone_status: phoneStatus,
      submitted_at: nowIso,
    };
    writeActivityEnvelope(student, noteObj);

    // 휴대폰 미제출(임시보관함/소지) → 출결판 노출용 phone_submission 생성. 같은 날 대기중 학생 신청은 1건으로 갱신.
    const existing = (student.phoneSubmissions || []).filter(
      (p) => !(p.date === todayKey && p.status === 'pending'),
    );
    if (!phoneSubmitted) {
      const sub: PhoneSubmission = {
        id: `phone_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        date: todayKey,
        type: phoneStatus === 'locker' ? 'locker' : 'keep',
        reason: phoneReason || undefined,
        status: 'pending',
        createdAt: nowIso,
      };
      student.phoneSubmissions = [...existing, sub];
    } else {
      student.phoneSubmissions = existing;
    }

    saved = await patchStudentProgress(student, originalUpdatedAt);
    if (saved !== 'conflict') {
      checklistResult = noteObj.daily_checklist;
      break;
    }
  }
  if (saved === 'conflict') {
    return NextResponse.json({ success: false, message: '저장이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' }, { status: 409 });
  }

  // 리워드 미션 체크
  const { checkAndGrantRewards } = await import('@/lib/rewards-service');
  const rewardResult = await checkAndGrantRewards(studentId);
  const updatedStudent = await getStudentById(studentId);

  return NextResponse.json({
    success: true,
    checklist: checklistResult,
    specialNote: serializeClientActivityNoteFromStudent(updatedStudent || saved),
    leaveCoupons: updatedStudent?.leaveCoupons || 0,
    rewardGranted: rewardResult.granted,
    rewardReasons: rewardResult.reasons,
  });
}
