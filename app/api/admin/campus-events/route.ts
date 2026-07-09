import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { canMutateCampusScopedResource, filterCampusScopedResources } from '@/lib/campus-scope';
import { getCampusEvents, saveCampusEvent, deleteCampusEvent, notifyCampusEvent, pruneOldNotices, getAnnouncementPublicUrl } from '@/lib/store';
import type { CampusEvent } from '@/lib/types/student';

const CAMPUSES = ['wonju', 'chuncheon', 'chungju'];
const NOTICE_RETENTION_DAYS = 90; // 이보다 오래된 사진 공지는 등록 시 자동 삭제

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
    responseMode?: unknown; postTaskLabel?: unknown; postTaskDueDate?: unknown; postTaskHref?: unknown;
    category?: unknown; imageUrl?: unknown; imagePath?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const isNotice = body?.category === 'notice';
  // 사진 공지는 제목이 없으면 기본값 사용(이미지가 본문). 일반 일정/미션은 제목 필수.
  const title = String(body?.title ?? '').trim() || (isNotice ? '학원 공지' : '');
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

  // 사진 공지 — 클라이언트가 준 URL은 신뢰하지 않고, 업로드로 받은 imagePath 로 서버가 공개 URL 재구성.
  // (임의 외부 URL 저장/렌더 방지 — 신뢰경계를 우리 Storage 로 고정)
  let imageUrl: string | undefined;
  let imagePath: string | undefined;
  if (isNotice) {
    imagePath = String(body?.imagePath ?? '').trim().slice(0, 500) || undefined;
    if (!imagePath) {
      return NextResponse.json({ success: false, message: '공지 이미지를 먼저 업로드해주세요.' }, { status: 400 });
    }
    imageUrl = getAnnouncementPublicUrl(imagePath);
  }

  const isMission = Boolean(body?.isMission) && !isNotice;
  let couponReward: number | undefined;
  let targetMode: 'campus' | 'students' | undefined;
  let targetStudentIds: string[] = [];
  if (isMission) {
    couponReward = Math.max(0, Math.min(99, Number(body?.couponReward) || 0));
    targetMode = body?.targetMode === 'students' ? 'students' : 'campus';
    if (targetMode === 'students') {
      targetStudentIds = Array.isArray(body?.targetStudentIds)
        ? (body.targetStudentIds as unknown[]).filter((t): t is string => typeof t === 'string').slice(0, 1000)
        : [];
    }
  }

  // 응답 모드 — 참여 미션은 항상 attendance(참여 응답)로 취급. 일반 일정은 관리자 선택값.
  const rawMode = String(body?.responseMode ?? '').trim();
  const responseMode: CampusEvent['responseMode'] = isMission
    ? 'attendance'
    : rawMode === 'attendance' ? 'attendance' : rawMode === 'postTask' ? 'postTask' : 'none';
  let postTaskLabel: string | undefined;
  let postTaskDueDate: string | undefined;
  let postTaskHref: string | undefined;
  if (responseMode === 'postTask') {
    postTaskLabel = String(body?.postTaskLabel ?? '').trim().slice(0, 200) || undefined;
    const dueRaw = String(body?.postTaskDueDate ?? '').trim();
    postTaskDueDate = /^\d{4}-\d{2}-\d{2}$/.test(dueRaw) ? dueRaw : undefined;
    const hrefRaw = String(body?.postTaskHref ?? '').trim().slice(0, 500);
    // 앱 내 경로(/로 시작, 단 //host 프로토콜-상대 URL 제외) 또는 http(s) 링크만 허용
    // — 그 외는 무시(오픈 리다이렉트/스킴 방지).
    postTaskHref = /^\/(?!\/)[^\s]*$/.test(hrefRaw) || /^https?:\/\//.test(hrefRaw) ? hrefRaw : undefined;
  }

  const event: CampusEvent = {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title,
    date,
    endDate,
    startTime,
    endTime,
    campus,
    category: isNotice ? 'notice' : isMission ? 'mission' : 'general',
    memo,
    imageUrl,
    imagePath,
    responseMode,
    postTaskLabel,
    postTaskDueDate,
    postTaskHref,
    isMission,
    couponReward,
    targetMode,
    targetStudentIds,
    createdAt: new Date().toISOString(),
    createdBy: session.username,
  };
  try {
    const saved = await saveCampusEvent(event);
    // 공지 등록 시 오래된 공지 자동 정리(이미지 + 행). 관리자가 매일 올리므로 자연 정리됨.
    if (isNotice) {
      try {
        // 업로드(created_at) 기준 N일 경과분만 삭제 → 방금 등록/백데이트 공지는 안전.
        const cutoffIso = new Date(Date.now() - NOTICE_RETENTION_DAYS * 86400000).toISOString();
        // 범위 관리자는 자기 센터만, 전체 관리자는 전체 정리.
        await pruneOldNotices(cutoffIso, session.campus !== 'all' ? session.campus : undefined);
      } catch { /* 정리 실패는 등록 성공에 영향 없음 */ }
    }
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
