import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { canMutateCampusScopedResource, filterCampusScopedResources } from '@/lib/campus-scope';
import { getMealPlans, saveMealPlan, deleteMealPlan, notifyMealPlan } from '@/lib/store';
import { CAMPUSES, mondayOf, MEAL_DAYS } from '@/lib/meal';
import type { MealDay, MealKind, MealPlan } from '@/lib/types/student';

function sanitizeClosedDays(raw: unknown): MealDay[] {
  if (!Array.isArray(raw)) return [];
  return MEAL_DAYS.filter((d) => (raw as unknown[]).includes(d));
}

// 관리자: 도시락 라운드 목록 (센터 범위 관리자는 자기 센터 + 전체센터만)
export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  try {
    const all = await getMealPlans();
    const plans = filterCampusScopedResources(all, session.campus);
    return NextResponse.json({ success: true, plans });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : '조회 실패' }, { status: 500 });
  }
}

// 관리자: 도시락 라운드 등록 (주차·끼니·마감·단가·센터)
export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  let body: {
    weekStart?: unknown; meals?: unknown; campus?: unknown;
    deadline?: unknown; lunchPrice?: unknown; dinnerPrice?: unknown; closedDays?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const rawWeek = String(body?.weekStart ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawWeek)) {
    return NextResponse.json({ success: false, message: '주차(날짜) 형식이 올바르지 않습니다.' }, { status: 400 });
  }
  const weekStart = mondayOf(rawWeek); // 어떤 요일을 골라도 그 주 월요일로 정규화

  const mealsRaw = Array.isArray(body?.meals) ? body.meals : [];
  const meals = (mealsRaw.filter((m): m is MealKind => m === 'lunch' || m === 'dinner'));
  if (meals.length === 0) {
    return NextResponse.json({ success: false, message: '점심/저녁 중 하나 이상 선택해주세요.' }, { status: 400 });
  }

  const deadline = body?.deadline ? new Date(String(body.deadline)).toISOString() : undefined;
  const toPrice = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
  };

  // 센터: 범위 관리자는 자기 센터로 강제, 전체 관리자는 body 값(미지정/all = 전체)
  let campus: string | undefined;
  if (session.campus !== 'all') {
    campus = session.campus;
  } else {
    const raw = String(body?.campus ?? '').trim();
    campus = CAMPUSES.includes(raw) ? raw : undefined;
  }

  // 주·센터당 1라운드 불변조건을 서버에서도 강제 — 동시 생성·구화면 생성 경로의 중복 라운드 차단.
  try {
    const dup = (await getMealPlans()).some(
      (p) => p.weekStart === weekStart && (p.campus || 'all') === (campus || 'all'),
    );
    if (dup) {
      return NextResponse.json(
        { success: false, message: '해당 주·센터에는 이미 도시락 라운드가 있습니다. 기존 라운드를 수정하세요.' },
        { status: 409 },
      );
    }
  } catch { /* 조회 실패 시 생성 자체는 막지 않는다(기존 동작 유지) */ }

  const plan: MealPlan = {
    id: `meal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    weekStart,
    meals,
    campus,
    deadline,
    lunchPrice: toPrice(body?.lunchPrice),
    dinnerPrice: toPrice(body?.dinnerPrice),
    closedDays: sanitizeClosedDays(body?.closedDays),
    createdAt: new Date().toISOString(),
  };
  try {
    const saved = await saveMealPlan(plan);
    return NextResponse.json({ success: true, plan: saved });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : '저장 실패' }, { status: 500 });
  }
}

// 관리자: 알림 발송/취소(notifiedAt) 또는 휴무 요일(closedDays) 수정.
//  - { planId, closedDays } → 휴무 요일 갱신
//  - { planId }            → 학생 알림 발송
//  - { planId, action:'cancel' } → 학생 알림 취소
export async function PATCH(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  let body: { planId?: unknown; closedDays?: unknown; action?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }
  const planId = String(body?.planId ?? '').trim();
  if (!planId) return NextResponse.json({ success: false, message: 'planId가 필요합니다.' }, { status: 400 });
  try {
    const plan = (await getMealPlans()).find((p) => p.id === planId);
    if (!plan) return NextResponse.json({ success: false, message: '해당 라운드를 찾을 수 없습니다.' }, { status: 404 });
    if (!canMutateCampusScopedResource(session.campus, plan.campus)) {
      return NextResponse.json({ success: false, message: '해당 캠퍼스 도시락 라운드를 변경할 권한이 없습니다.' }, { status: 403 });
    }
    // 휴무 요일 수정
    if ('closedDays' in (body || {})) {
      const saved = await saveMealPlan({ ...plan, closedDays: sanitizeClosedDays(body.closedDays) });
      return NextResponse.json({ success: true, plan: saved });
    }
    // 학생 알림 발송/취소
    const cancel = body?.action === 'cancel';
    const updatedPlan = await notifyMealPlan(planId, cancel ? null : new Date().toISOString());
    return NextResponse.json({ success: true, plan: updatedPlan });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : '처리 실패' }, { status: 500 });
  }
}

// 관리자: 도시락 라운드 삭제
export async function DELETE(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  const planId = new URL(request.url).searchParams.get('planId');
  if (!planId) return NextResponse.json({ success: false, message: 'planId가 필요합니다.' }, { status: 400 });
  try {
    const plan = (await getMealPlans()).find((p) => p.id === planId);
    if (!plan) return NextResponse.json({ success: false, message: '해당 라운드를 찾을 수 없습니다.' }, { status: 404 });
    if (!canMutateCampusScopedResource(session.campus, plan.campus)) {
      return NextResponse.json({ success: false, message: '해당 캠퍼스 도시락 라운드를 삭제할 권한이 없습니다.' }, { status: 403 });
    }
    await deleteMealPlan(planId);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : '삭제 실패' }, { status: 500 });
  }
}
