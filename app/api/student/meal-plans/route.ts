import { NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { getMealPlans, getStudentById } from '@/lib/store';
import { isPastDeadline } from '@/lib/meal';

// 해당 주(월요일 weekStart)의 금요일이 오늘(KST) 이전이면 지난 주로 간주 → 숨김
function weekIsActive(weekStart: string, todayYmd: string): boolean {
  const [y, m, d] = weekStart.split('-').map(Number);
  if (!y || !m || !d) return true;
  const fri = new Date(Date.UTC(y, m - 1, d));
  fri.setUTCDate(fri.getUTCDate() + 4);
  return fri.toISOString().slice(0, 10) >= todayYmd;
}

// 학생: 알림된 도시락 라운드 + 본인 신청 내역. (마감 전 수정 / 마감 후 추가신청 안내)
export async function GET() {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }
  const student = await getStudentById(studentId);
  if (!student) {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }

  // meal_plans 테이블 미생성(마이그레이션 미실행) 등은 빈 목록으로 graceful 처리.
  let allPlans: Awaited<ReturnType<typeof getMealPlans>> = [];
  try {
    allPlans = await getMealPlans();
  } catch {
    return NextResponse.json({ success: true, plans: [] });
  }

  const todayYmd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

  const myOrders = new Map((student.mealOrders || []).map((o) => [o.planId, o]));

  const plans = allPlans
    .filter((p) => p.notifiedAt)
    .filter((p) => !p.campus || p.campus === 'all' || p.campus === student.campus)
    .filter((p) => weekIsActive(p.weekStart, todayYmd))
    .map((p) => ({
      ...p,
      myOrder: myOrders.get(p.id) || null,
      pastDeadline: isPastDeadline(p),
    }));

  return NextResponse.json({ success: true, plans });
}
