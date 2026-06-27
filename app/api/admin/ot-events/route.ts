import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { getOtEvents, saveOtEvent, deleteOtEvent, notifyOtEvent } from '@/lib/store';
import type { OtEvent } from '@/lib/types/student';

// 관리자: OT 일정 목록 조회
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  try {
    const events = await getOtEvents();
    return NextResponse.json({ success: true, events });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : '조회 실패' }, { status: 500 });
  }
}

// 관리자: OT 일정 등록
export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  let body: { name?: unknown; date?: unknown; targetExamTypes?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }
  const name = String(body?.name ?? '').trim();
  if (!name) return NextResponse.json({ success: false, message: 'OT명을 입력해주세요.' }, { status: 400 });
  const date = String(body?.date ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ success: false, message: '날짜 형식이 올바르지 않습니다.' }, { status: 400 });
  }
  const targetExamTypes: string[] = Array.isArray(body?.targetExamTypes)
    ? (body.targetExamTypes as unknown[]).filter((t): t is string => typeof t === 'string')
    : [];

  const event: OtEvent = {
    id: `ot_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    date,
    targetExamTypes,
    createdAt: new Date().toISOString(),
  };
  try {
    const saved = await saveOtEvent(event);
    return NextResponse.json({ success: true, event: saved });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : '저장 실패' }, { status: 500 });
  }
}

// 관리자: 학생에게 OT 참여 확인 알림 발송 (notifiedAt 설정)
export async function PATCH(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  let body: { eventId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }
  const eventId = String(body?.eventId ?? '').trim();
  if (!eventId) return NextResponse.json({ success: false, message: 'eventId가 필요합니다.' }, { status: 400 });
  try {
    const event = await notifyOtEvent(eventId, new Date().toISOString());
    return NextResponse.json({ success: true, event });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : '발송 실패' }, { status: 500 });
  }
}

// 관리자: OT 일정 삭제
export async function DELETE(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  const eventId = new URL(request.url).searchParams.get('eventId');
  if (!eventId) return NextResponse.json({ success: false, message: 'eventId가 필요합니다.' }, { status: 400 });
  try {
    await deleteOtEvent(eventId);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : '삭제 실패' }, { status: 500 });
  }
}
