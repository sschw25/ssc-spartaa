import { NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { getStudentById } from '@/lib/store';
import { computeAttendanceStreak, findRepairableGap } from '@/lib/streak';
import { loadStreakInputs, STREAK_REPAIR_COST, STREAK_REPAIR_WINDOW_DAYS } from '@/lib/streak-data';

// 홈 연속출석 카드 전용 경량 엔드포인트 — streak/streakRepair/leaveCoupons 만 계산한다.
// (missions-hub 는 오늘계획·건강지수·추천·OT/모의/행사 조회까지 하는 무거운 집계라, 스트릭 카드가
//  그걸 부르면 초기 렌더가 늦어짐. 여기선 출결 스트릭 계산만 하고 불필요한 DB 왕복을 뺀다.)
export async function GET() {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }
  const student = await getStudentById(studentId);
  if (!student) {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }

  const now = new Date();
  const streakInputs = await loadStreakInputs(student, now);
  const streakOpts = {
    today: now,
    justifiedDateKeys: streakInputs.justifiedDateKeys,
    skipDateKeys: streakInputs.skipDateKeys,
  };
  const streak = computeAttendanceStreak(streakInputs.attendedDateKeys, streakOpts);
  const gap = findRepairableGap(streakInputs.attendedDateKeys, { ...streakOpts, repairWindowDays: STREAK_REPAIR_WINDOW_DAYS });
  const streakRepair = gap ? { date: gap.date, restoredStreak: gap.restoredStreak, cost: STREAK_REPAIR_COST } : null;

  return NextResponse.json({
    success: true,
    streak,
    streakRepair,
    leaveCoupons: student.leaveCoupons ?? 0,
  });
}
