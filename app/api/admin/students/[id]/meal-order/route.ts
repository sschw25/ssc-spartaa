import { NextResponse } from 'next/server';
import { canAdminAccessStudent } from '@/lib/auth';
import { getStudentById, saveStudent } from '@/lib/store';
import { MEAL_DAYS, withSelection } from '@/lib/meal';
import type { MealOrder } from '@/lib/types/student';

// selections 정규화 — 신뢰할 수 없는 입력에서 요일×끼니 boolean 만 추출
function sanitizeSelections(raw: unknown): MealOrder['selections'] {
  const out: MealOrder['selections'] = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const day of MEAL_DAYS) {
    const cell = (raw as Record<string, unknown>)[day];
    if (!cell || typeof cell !== 'object') continue;
    const lunch = Boolean((cell as Record<string, unknown>).lunch);
    const dinner = Boolean((cell as Record<string, unknown>).dinner);
    if (lunch || dinner) {
      out[day] = {};
      if (lunch) out[day]!.lunch = true;
      if (dinner) out[day]!.dinner = true;
    }
  }
  return out;
}

// 관리자: 학생 도시락 신청 처리.
//  - 대리입력:   { planId, selections }          → 해당 라운드 selections 덮어쓰기
//  - 추가신청 승인/반려: { planId, requestId, approve|reject } → addRequest 처리(+승인 시 selections 반영)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!(await canAdminAccessStudent(id))) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });
  }

  let body: { planId?: unknown; selections?: unknown; requestId?: unknown; approve?: unknown; reject?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const planId = String(body?.planId ?? '').trim();
  if (!planId) return NextResponse.json({ success: false, message: 'planId가 필요합니다.' }, { status: 400 });

  const student = await getStudentById(id);
  if (!student) {
    return NextResponse.json({ success: false, message: '해당 원생을 찾을 수 없습니다.' }, { status: 404 });
  }

  const orders = [...(student.mealOrders || [])];
  const idx = orders.findIndex((o) => o.planId === planId);
  const now = new Date().toISOString();

  // 1) 추가신청 승인/반려
  const requestId = String(body?.requestId ?? '').trim();
  if (requestId) {
    if (idx < 0) return NextResponse.json({ success: false, message: '해당 신청을 찾을 수 없습니다.' }, { status: 404 });
    const order = { ...orders[idx] };
    const reqs = [...(order.addRequests || [])];
    const rIdx = reqs.findIndex((r) => r.id === requestId);
    if (rIdx < 0) return NextResponse.json({ success: false, message: '해당 추가신청을 찾을 수 없습니다.' }, { status: 404 });
    const approve = Boolean(body?.approve) && !body?.reject;
    const req = { ...reqs[rIdx], status: (approve ? 'approved' : 'rejected') as 'approved' | 'rejected', reviewedAt: now };
    reqs[rIdx] = req;
    order.addRequests = reqs;
    if (approve) {
      order.selections = withSelection(order.selections, req.day, req.meal, true);
    }
    order.updatedAt = now;
    orders[idx] = order;
    student.mealOrders = orders;
    await saveStudent(student);
    return NextResponse.json({ success: true, order });
  }

  // 2) 대리입력 (selections 덮어쓰기)
  const selections = sanitizeSelections(body?.selections);
  const base: MealOrder = idx >= 0 ? { ...orders[idx] } : { planId, selections: {}, updatedAt: now };
  base.selections = selections;
  base.updatedAt = now;
  base.respondedBy = 'admin';
  if (idx >= 0) orders[idx] = base;
  else orders.push(base);
  student.mealOrders = orders;
  await saveStudent(student);
  return NextResponse.json({ success: true, order: base });
}
