import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { getStudentById, updateStudentById } from '@/lib/store';
import { sendCustomSms } from '@/lib/sms';
import type { SmsLog } from '@/lib/types/student';

// 관리자: 여러 학생에게 일괄 SMS 발송
export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  let body: { studentIds?: unknown; message?: unknown; targets?: unknown; sentBy?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const studentIds = Array.isArray(body?.studentIds) ? (body.studentIds as string[]) : [];
  if (studentIds.length === 0) {
    return NextResponse.json({ success: false, message: '발송 대상 학생을 선택해주세요.' }, { status: 400 });
  }

  const message = String(body?.message ?? '').trim();
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

      const { sent, failed: sendFailed } = await sendCustomSms(recipients, message);
      if (sendFailed) {
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
