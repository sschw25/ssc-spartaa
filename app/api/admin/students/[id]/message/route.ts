import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { getStudentById, saveStudent } from '@/lib/store';
import { sendCustomSms } from '@/lib/sms';
import type { SmsLog } from '@/lib/types/student';

// 관리자: 개별 학생에게 커스텀 SMS 발송
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  const { id } = await params;

  let body: { message?: unknown; targets?: unknown; sentBy?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
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

  const student = await getStudentById(id);
  if (!student) {
    return NextResponse.json({ success: false, message: '해당 원생을 찾을 수 없습니다.' }, { status: 404 });
  }

  const recipients: string[] = [];
  if (targets.includes('parent') && student.parentPhone) recipients.push(student.parentPhone);
  if (targets.includes('student') && student.studentPhone) recipients.push(student.studentPhone);

  const { sent, skipped, failed } = await sendCustomSms(recipients, message);
  if (failed) {
    return NextResponse.json(
      { success: false, message: '문자 발송에 실패했습니다.', detail: failed },
      { status: 502 }
    );
  }

  const nowIso = new Date().toISOString();
  const log: SmsLog = {
    id: `sms_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    sentAt: nowIso,
    message,
    targets,
    sentCount: sent,
    sentBy,
  };
  student.smsLogs = [...(student.smsLogs || []), log];
  await saveStudent(student);

  return NextResponse.json({ success: true, sent, skipped, log });
}
