import { NextRequest, NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { getStudentById, saveStudent } from '@/lib/store';
import { readActivityEnvelope, writeActivityEnvelope, serializeClientActivityNoteFromStudent } from '@/lib/student-activity';

function sanitizeNotificationIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item.length > 0 && item.length <= 160),
    ),
  ).slice(0, 200);
}

export async function POST(req: NextRequest) {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const dismissedNotificationIds = sanitizeNotificationIds(body.dismissedNotificationIds);

  const student = await getStudentById(studentId);
  if (!student) {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }

  const noteObj = readActivityEnvelope(student);
  if (dismissedNotificationIds.length > 0) {
    noteObj.dismissed_notifications = dismissedNotificationIds;
  } else {
    delete noteObj.dismissed_notifications;
  }

  writeActivityEnvelope(student, noteObj);
  await saveStudent(student);

  return NextResponse.json({
    success: true,
    dismissedNotificationIds,
    specialNote: serializeClientActivityNoteFromStudent(student),
  });
}
