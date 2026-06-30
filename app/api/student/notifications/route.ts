import { NextRequest, NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { updateStudentById } from '@/lib/store';
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

  // 낙관적 잠금 재시도로 저장 — 동시 저장(쿠폰/휴가/관리자 처리)에 덮이지 않게
  const result = await updateStudentById(studentId, (student) => {
    const noteObj = readActivityEnvelope(student);
    if (dismissedNotificationIds.length > 0) {
      noteObj.dismissed_notifications = dismissedNotificationIds;
    } else {
      delete noteObj.dismissed_notifications;
    }
    writeActivityEnvelope(student, noteObj);
  });
  if (result === 'not_found') {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }
  if (typeof result === 'string') {
    return NextResponse.json({ success: false, message: '저장이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' }, { status: 409 });
  }

  return NextResponse.json({
    success: true,
    dismissedNotificationIds,
    specialNote: serializeClientActivityNoteFromStudent(result),
  });
}
