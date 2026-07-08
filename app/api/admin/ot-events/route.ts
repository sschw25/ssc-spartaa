import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { canMutateCampusScopedResource, filterCampusScopedResources } from '@/lib/campus-scope';
import { getOtEvents, saveOtEvent, deleteOtEvent, notifyOtEvent } from '@/lib/store';
import type { OtEvent } from '@/lib/types/student';

const CAMPUSES = ['wonju', 'chuncheon', 'chungju'];

// 관리자: OT 일정 목록 조회 (센터 범위 관리자는 자기 센터 + 전체센터 일정만)
export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  try {
    const all = await getOtEvents();
    const events = filterCampusScopedResources(all, session.campus);
    return NextResponse.json({ success: true, events });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : '조회 실패' }, { status: 500 });
  }
}

// 관리자: OT 일정 등록 (센터별)
export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  let body: { name?: unknown; date?: unknown; message?: unknown; targetExamTypes?: unknown; campus?: unknown };
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
  const message = String(body?.message ?? '').trim().slice(0, 500) || undefined;
  const targetExamTypes: string[] = Array.isArray(body?.targetExamTypes)
    ? (body.targetExamTypes as unknown[]).filter((t): t is string => typeof t === 'string')
    : [];

  // 센터: 범위 관리자는 자기 센터로 강제, 전체 관리자는 body 값(미지정/all = 전체)
  let campus: string | undefined;
  if (session.campus !== 'all') {
    campus = session.campus;
  } else {
    const raw = String(body?.campus ?? '').trim();
    campus = CAMPUSES.includes(raw) ? raw : undefined;
  }

  const event: OtEvent = {
    id: `ot_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    date,
    message,
    targetExamTypes,
    campus,
    createdAt: new Date().toISOString(),
  };
  try {
    const saved = await saveOtEvent(event);
    return NextResponse.json({ success: true, event: saved });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : '저장 실패' }, { status: 500 });
  }
}

// 관리자: 학생에게 OT 참여 확인 알림 발송/취소 (notifiedAt 설정/해제)
export async function PATCH(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  let body: { eventId?: unknown; action?: unknown; studentIds?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }
  const eventId = String(body?.eventId ?? '').trim();
  if (!eventId) return NextResponse.json({ success: false, message: 'eventId가 필요합니다.' }, { status: 400 });
  try {
    const existing = (await getOtEvents()).find((e) => e.id === eventId);
    if (!existing) {
      return NextResponse.json({ success: false, message: '해당 OT 일정을 찾을 수 없습니다.' }, { status: 404 });
    }
    if (!canMutateCampusScopedResource(session.campus, existing.campus)) {
      return NextResponse.json({ success: false, message: '해당 캠퍼스 OT 일정을 변경할 권한이 없습니다.' }, { status: 403 });
    }
    const cancel = body?.action === 'cancel';
    // 발송 시 체크된 명시 수신자 목록(studentIds). 정의되면 이 학생에게만 노출(미정의면 targetExamTypes 폴백).
    // 취소 시엔 []로 초기화 — notifiedAt=null 후 D-3 자동노출이 이전 수신자에 갇히지 않고 폴백으로 복귀.
    let recipientStudentIds: string[] | undefined;
    if (cancel) {
      recipientStudentIds = [];
    } else if (Array.isArray(body?.studentIds)) {
      recipientStudentIds = [...new Set(
        (body.studentIds as unknown[]).filter((v): v is string => typeof v === 'string' && v.length > 0),
      )].slice(0, 2000);
    }
    const event = await notifyOtEvent(eventId, cancel ? null : new Date().toISOString(), recipientStudentIds);
    return NextResponse.json({ success: true, event });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : '처리 실패' }, { status: 500 });
  }
}

// 관리자: OT 일정 삭제
export async function DELETE(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  const eventId = new URL(request.url).searchParams.get('eventId');
  if (!eventId) return NextResponse.json({ success: false, message: 'eventId가 필요합니다.' }, { status: 400 });
  try {
    const existing = (await getOtEvents()).find((e) => e.id === eventId);
    if (!existing) {
      return NextResponse.json({ success: false, message: '해당 OT 일정을 찾을 수 없습니다.' }, { status: 404 });
    }
    if (!canMutateCampusScopedResource(session.campus, existing.campus)) {
      return NextResponse.json({ success: false, message: '해당 캠퍼스 OT 일정을 삭제할 권한이 없습니다.' }, { status: 403 });
    }
    await deleteOtEvent(eventId);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : '삭제 실패' }, { status: 500 });
  }
}
