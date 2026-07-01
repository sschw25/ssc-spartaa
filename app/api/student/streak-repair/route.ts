import { NextRequest, NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { getStudentById, updateStudentById } from '@/lib/store';
import { computeAttendanceStreak, findRepairableGap } from '@/lib/streak';
import {
  loadStreakInputs,
  getStreakRepairs,
  STREAK_REPAIR_COST,
  STREAK_REPAIR_WINDOW_DAYS,
  type StreakRepairEntry,
} from '@/lib/streak-data';

// 학생: 쿠폰으로 연속출석 스트릭 잇기(듀오링고식 streak repair).
// 최근 결손 1일을 정당사유 처리해 끊긴 스트릭을 이전 기록과 다시 연결한다.
//  · 대상 결손일은 서버가 재계산해 확정한다(클라이언트가 임의 날짜를 정당사유 처리할 수 없음).
//  · 쿠폰은 환금성 인앱 통화 → 잔액 검사·차감·기록을 낙관적 잠금(updateStudentById)으로 원자 처리.
//  · 사용 내역은 student_state.streakRepairs(jsonb)에 보관 — 별도 컬럼/마이그레이션 불필요.
export async function POST(req: NextRequest) {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }
  const student = await getStudentById(studentId);
  if (!student) {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }

  let body: { date?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // date 미지정 요청도 허용 — 서버가 확정한 결손일로 진행
  }

  const now = new Date();
  const inputs = await loadStreakInputs(student, now);
  const streakOpts = {
    today: now,
    justifiedDateKeys: inputs.justifiedDateKeys,
    skipDateKeys: inputs.skipDateKeys,
  };
  const gap = findRepairableGap(inputs.attendedDateKeys, {
    ...streakOpts,
    repairWindowDays: STREAK_REPAIR_WINDOW_DAYS,
  });
  if (!gap) {
    return NextResponse.json(
      { success: false, message: '지금은 이을 수 있는 스트릭 결손이 없어요.' },
      { status: 400 },
    );
  }
  // 클라이언트가 날짜를 보냈다면 서버 판정과 일치해야 함(화면이 낡은 상태로 결제되는 것 방지)
  if (typeof body.date === 'string' && body.date !== gap.date) {
    return NextResponse.json(
      { success: false, message: '스트릭 상태가 바뀌었어요. 화면을 새로고침해 주세요.' },
      { status: 409 },
    );
  }

  const nowIso = now.toISOString();
  let errorResponse: NextResponse | null = null;
  const result = await updateStudentById(studentId, (fresh) => {
    // 이미 같은 날을 이었으면(더블클릭/다중탭) 중복 차감 방지
    if (getStreakRepairs(fresh).some((r) => r.date === gap.date)) {
      errorResponse = NextResponse.json(
        { success: false, message: '이미 이어진 날이에요. 화면을 새로고침해 주세요.' },
        { status: 409 },
      );
      return false;
    }
    // 가용 쿠폰 = 잔액 - 승인 대기 중(미차감 신청) 교환에 묶인 쿠폰 (reward 교환과 동일 규칙)
    const balance = fresh.leaveCoupons ?? 0;
    const committed = (fresh.rewardRedemptions || [])
      .filter((r) => r.status === 'requested' || r.status === 'pending')
      .reduce((sum, r) => sum + (r.cost || 0), 0);
    const available = balance - committed;
    if (available < STREAK_REPAIR_COST) {
      errorResponse = NextResponse.json(
        { success: false, message: `쿠폰이 부족합니다. (가용 ${available} / 필요 ${STREAK_REPAIR_COST})` },
        { status: 400 },
      );
      return false;
    }
    const repair: StreakRepairEntry = { date: gap.date, usedAt: nowIso };
    fresh.leaveCoupons = balance - STREAK_REPAIR_COST;
    fresh.studentState = {
      ...(fresh.studentState || {}),
      streakRepairs: [...getStreakRepairs(fresh), repair],
    };
  });

  if (errorResponse) return errorResponse;
  if (result === 'not_found') {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }
  if (typeof result === 'string') {
    return NextResponse.json(
      { success: false, message: '처리 충돌이 발생했습니다. 다시 시도해주세요.' },
      { status: 409 },
    );
  }

  // 이은 날을 반영해 스트릭 재계산 후 반환 — 클라이언트가 즉시 새 스트릭을 그릴 수 있게.
  const streak = computeAttendanceStreak(inputs.attendedDateKeys, {
    ...streakOpts,
    justifiedDateKeys: new Set([...inputs.justifiedDateKeys, gap.date]),
  });
  return NextResponse.json({
    success: true,
    repairedDate: gap.date,
    streak,
    leaveCoupons: result.leaveCoupons ?? 0,
  });
}
