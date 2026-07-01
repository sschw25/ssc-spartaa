import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { canMutateCampusScopedResource, filterCampusScopedResources } from '@/lib/campus-scope';
import { getCampusEvents, saveCampusEvent, deleteCampusEvent, notifyCampusEvent } from '@/lib/store';
import type { CampusEvent } from '@/lib/types/student';

const CAMPUSES = ['wonju', 'chuncheon', 'chungju'];

// 관리자: 캘린더 일정/미션 목록 (센터 범위 관리자는 자기 센터 + 전체센터 일정만)
export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  try {
    const all = await getCampusEvents();
    const events = filterCampusScopedResources(all, session.campus);
    return NextResponse.json({ success: true, events });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : '조회 실패' }, { status: 500 });
  }
}

// 관리자: 캘린더 일정/미션 등록
export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  let body: {
    title?: unknown; date?: unknown; endDate?: unknown; startTime?: unknown; endTime?: unknown;
    campus?: unknown; memo?: unknown; isMission?: unknown; couponReward?: unknown;
    targetMode?: unknown; targetStudentIds?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const title = String(body?.title ?? '').trim();
  if (!title) return NextResponse.json({ success: false, message: '일정 이름을 입력해주세요.' }, { status: 400 });
  const date = String(body?.date ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ success: false, message: '날짜 형식이 올바르지 않습니다.' }, { status: 400 });
  }
  const endDateRaw = String(body?.endDate ?? '').trim();
  const endDate = /^\d{4}-\d{2}-\d{2}$/.test(endDateRaw) && endDateRaw >= date ? endDateRaw : undefined;
  const timeRe = /^\d{2}:\d{2}$/;
  const startTime = timeRe.test(String(body?.startTime ?? '')) ? String(body.startTime) : undefined;
  const endTime = timeRe.test(String(body?.endTime ?? '')) ? String(body.endTime) : undefined;
  const memo = String(body?.memo ?? '').trim().slice(0, 1000) || undefined;

  // 센터: 범위 관리자는 자기 센터로 강제, 전체 관리자는 body 값(미지정/all = 전체)
  let campus: string | undefined;
  if (session.campus !== 'all') {
    campus = session.campus;
  } else {
    const raw = String(body?.campus ?? '').trim();
    campus = CAMPUSES.includes(raw) ? raw : undefined;
  }

  const isMission = Boolean(body?.isMission);
  let couponReward: number | undefined;
  let targetMode: 'campus' | 'students' | undefined;
  let targetStudentIds: string[] = [];
  if (isMission) {
    couponReward = Math.max(0, Math.min(99, Number(body?.couponReward) || 0));
    targetMode = body?.targetMode === 'students' ? 'students' : 'campus';
    if (targetMode === 'students') {
      targetStudentIds = Array.isArray(body?.targetStudentIds)
        ? (body.targetStudentIds as unknown[]).filter((t): t is string => typeof t === 'string')
        : [];
    }
  }

  const event: CampusEvent = {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title,
    date,
    endDate,
    startTime,
    endTime,
    campus,
    category: isMission ? 'mission' : 'general',
    memo,
    isMission,
    couponReward,
    targetMode,
    targetStudentIds,
    createdAt: new Date().toISOString(),
    createdBy: session.username,
  };
  try {
    const saved = await saveCampusEvent(event);
    return NextResponse.json({ success: true, event: saved });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : '저장 실패' }, { status: 500 });
  }
}

// 관리자: 참여 미션 알림 발송/취소 (notifiedAt 설정/해제)
export async function PATCH(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  let body: { eventId?: unknown; action?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }
  const eventId = String(body?.eventId ?? '').trim();
  if (!eventId) return NextResponse.json({ success: false, message: 'eventId가 필요합니다.' }, { status: 400 });
  try {
    const existing = (await getCampusEvents()).find((e) => e.id === eventId);
    if (!existing) {
      return NextResponse.json({ success: false, message: '해당 일정을 찾을 수 없습니다.' }, { status: 404 });
    }
    if (!canMutateCampusScopedResource(session.campus, existing.campus)) {
      return NextResponse.json({ success: false, message: '해당 캠퍼스 일정을 변경할 권한이 없습니다.' }, { status: 403 });
    }
    const cancel = body?.action === 'cancel';
    const event = await notifyCampusEvent(eventId, cancel ? null : new Date().toISOString());
    return NextResponse.json({ success: true, event });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : '처리 실패' }, { status: 500 });
  }
}

// 관리자: 캘린더 일정/미션 삭제
export async function DELETE(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  const eventId = new URL(request.url).searchParams.get('eventId');
  if (!eventId) return NextResponse.json({ success: false, message: 'eventId가 필요합니다.' }, { status: 400 });
  try {
    const existing = (await getCampusEvents()).find((e) => e.id === eventId);
    if (!existing) {
      return NextResponse.json({ success: false, message: '해당 일정을 찾을 수 없습니다.' }, { status: 404 });
    }
    if (!canMutateCampusScopedResource(session.campus, existing.campus)) {
      return NextResponse.json({ success: false, message: '해당 캠퍼스 일정을 삭제할 권한이 없습니다.' }, { status: 403 });
    }
    await deleteCampusEvent(eventId);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : '삭제 실패' }, { status: 500 });
  }
}
