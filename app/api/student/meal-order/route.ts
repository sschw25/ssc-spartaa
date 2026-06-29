import { NextRequest, NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { getMealPlans, getStudentById, saveStudent } from '@/lib/store';
import { MEAL_DAYS, isMealDay, isMealKind, isPastDeadline } from '@/lib/meal';
import type { MealAddRequest, MealOrder } from '@/lib/types/student';

// plan 이 제공하는 끼니로 한정해 selections 정규화 (휴무 요일 제외)
function sanitizeSelections(
  raw: unknown,
  offered: ReadonlyArray<'lunch' | 'dinner'>,
  closedDays: ReadonlyArray<string>,
): MealOrder['selections'] {
  const out: MealOrder['selections'] = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const day of MEAL_DAYS) {
    if (closedDays.includes(day)) continue;
    const cell = (raw as Record<string, unknown>)[day];
    if (!cell || typeof cell !== 'object') continue;
    const c = cell as Record<string, unknown>;
    const lunch = offered.includes('lunch') && Boolean(c.lunch);
    const dinner = offered.includes('dinner') && Boolean(c.dinner);
    if (lunch || dinner) {
      out[day] = {};
      if (lunch) out[day]!.lunch = true;
      if (dinner) out[day]!.dinner = true;
    }
  }
  return out;
}

// 학생: 도시락 신청. 마감 전이면 selections 저장, 마감 후면 추가신청(승인 대기) 접수.
export async function POST(req: NextRequest) {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }

  let body: { planId?: unknown; selections?: unknown; addRequest?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const planId = String(body?.planId ?? '').trim();
  if (!planId) return NextResponse.json({ success: false, message: 'planId가 필요합니다.' }, { status: 400 });

  const plan = (await getMealPlans()).find((p) => p.id === planId);
  if (!plan || !plan.notifiedAt) {
    return NextResponse.json({ success: false, message: '신청 가능한 도시락 일정이 아닙니다.' }, { status: 404 });
  }

  const student = await getStudentById(studentId);
  if (!student) {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }
  // 센터 불일치 차단
  if (plan.campus && plan.campus !== 'all' && plan.campus !== student.campus) {
    return NextResponse.json({ success: false, message: '신청 대상 센터가 아닙니다.' }, { status: 403 });
  }

  const orders = [...(student.mealOrders || [])];
  const idx = orders.findIndex((o) => o.planId === planId);
  const now = new Date().toISOString();
  const past = isPastDeadline(plan);

  // 마감 후 → 추가신청(승인 대기)
  if (past) {
    const ar = body?.addRequest as { day?: unknown; meal?: unknown; reason?: unknown } | undefined;
    if (!ar || !isMealDay(ar.day) || !isMealKind(ar.meal)) {
      return NextResponse.json({ success: false, message: '신청이 마감되었습니다. 추가 신청은 요일/끼니를 선택해주세요.' }, { status: 400 });
    }
    if (!plan.meals.includes(ar.meal)) {
      return NextResponse.json({ success: false, message: '해당 끼니는 이 라운드에서 제공하지 않습니다.' }, { status: 400 });
    }
    if ((plan.closedDays || []).includes(ar.day)) {
      return NextResponse.json({ success: false, message: '휴무일은 신청할 수 없습니다.' }, { status: 400 });
    }
    const request: MealAddRequest = {
      id: `madd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      day: ar.day,
      meal: ar.meal,
      reason: String(ar.reason ?? '').trim().slice(0, 200) || undefined,
      status: 'pending',
      createdAt: now,
    };
    const base: MealOrder = idx >= 0 ? { ...orders[idx] } : { planId, selections: {}, updatedAt: now };
    base.addRequests = [...(base.addRequests || []), request];
    base.updatedAt = now;
    if (idx >= 0) orders[idx] = base;
    else orders.push(base);
    student.mealOrders = orders;
    await saveStudent(student);
    return NextResponse.json({ success: true, order: base, pendingAddition: true });
  }

  // 마감 전 → selections 저장
  const selections = sanitizeSelections(body?.selections, plan.meals, plan.closedDays || []);
  const base: MealOrder = idx >= 0 ? { ...orders[idx] } : { planId, selections: {}, updatedAt: now };
  base.selections = selections;
  base.updatedAt = now;
  base.respondedBy = 'student';
  if (idx >= 0) orders[idx] = base;
  else orders.push(base);
  student.mealOrders = orders;
  await saveStudent(student);
  return NextResponse.json({ success: true, order: base });
}
