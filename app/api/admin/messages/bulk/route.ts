import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { getStudentById, updateStudentById } from '@/lib/store';
import { sendCustomSms } from '@/lib/sms';
import { sharedRateLimit } from '@/lib/rate-limit';
import type { SmsLog } from '@/lib/types/student';

// 관리자: 여러 학생에게 일괄 SMS 발송
export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  // 대량 발송 남용 방지: 관리자 개별 세션 기준 5분에 20회 제한.
  // (캠퍼스는 super 가 'all' 로 고정돼 여러 super 가 한 버킷을 공유하므로 세션 id 로만 키를 잡는다.)
  const rl = await sharedRateLimit(`messages-bulk:${session.id}`, 20, 5 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, message: `일괄 발송 요청이 너무 많습니다. ${rl.retryAfterSec}초 후 다시 시도해 주세요.` },
      { status: 429 }
    );
  }

  let body: { studentIds?: unknown; message?: unknown; targets?: unknown; sentBy?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  // 1회 발송 대상 상한(500명) — 과도한 대량 발송/오작동 방지.
  const studentIds = (Array.isArray(body?.studentIds) ? (body.studentIds as string[]) : []).slice(0, 500);
  if (studentIds.length === 0) {
    return NextResponse.json({ success: false, message: '발송 대상 학생을 선택해주세요.' }, { status: 400 });
  }

  // 메시지 길이 상한(500자).
  const message = String(body?.message ?? '').trim().slice(0, 500);
  if (!message) {
    return NextResponse.json({ success: false, message: '메시지 내용이 필요합니다.' }, { status: 400 });
  }

  const rawTargets = Array.isArray(body?.targets) ? body.targets : ['parent'];
  const targets: Array<'parent' | 'student'> = rawTargets.filter(
    (t: unknown): t is 'parent' | 'student' => t === 'parent' || t === 'student'
  );
  if (targets.length === 0) targets.push('parent');

  const sentBy = String(body?.sentBy ?? '관리자').trim().slice(0, 50);
  const nowIso = new Date().toISOString();

  let totalSent = 0;
  let skippedCount = 0;
  const failed: string[] = [];

  for (const studentId of studentIds) {
    try {
      const student = await getStudentById(studentId);
      if (!student) { failed.push(studentId); continue; }

      // 타 캠퍼스 학생은 발송 대상에서 제외 (슈퍼 관리자는 전원 허용)
      if (session.campus !== 'all' && student.campus !== session.campus) {
        skippedCount += 1;
        continue;
      }

      const recipients: string[] = [];
      if (targets.includes('parent') && student.parentPhone) recipients.push(student.parentPhone);
      if (targets.includes('student') && student.studentPhone) recipients.push(student.studentPhone);

      const { sent, skipped, failed: sendFailed } = await sendCustomSms(recipients, message);
      if (sendFailed) {
        failed.push(studentId);
        continue;
      }
      if (skipped && sent === 0) {
        failed.push(studentId);
        continue;
      }
      totalSent += sent;

      const log: SmsLog = {
        id: `sms_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        sentAt: nowIso,
        message,
        targets,
        sentCount: sent,
        sentBy,
      };
      await updateStudentById(student.id, (fresh) => {
        fresh.smsLogs = [...(fresh.smsLogs || []), log];
      });
    } catch {
      failed.push(studentId);
    }
  }

  const attempted = studentIds.length - skippedCount;
  const success = totalSent > 0 || failed.length < attempted || (attempted === 0 && skippedCount > 0);
  return NextResponse.json({
    success,
    totalSent,
    skippedCount,
    failedCount: failed.length,
    failed,
  }, { status: success ? 200 : 502 });
}
