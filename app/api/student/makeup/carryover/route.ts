import { NextRequest, NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { getStudentById, patchStudentProgress } from '@/lib/store';
import type { MakeupCarryover } from '@/lib/types/student';
import { getMakeupAmount, getLeaveDates, getLeaveExemptions } from '@/lib/progress-plan';
import { kstToday } from '@/lib/leave';
import {
  CARRYOVER_COUPON_COST,
  canCarryLeaveType,
  hasCarryoverInRealWeek,
  weekKeyOf,
  nextWeekKey,
  addDaysToDateKey,
  getCarryoverNet,
  formatCarryoverMessage,
} from '@/lib/makeup-carryover';

// 학생이 이번 주 보강을 다음 주로 이월(쿠폰 3 소모, 주당 1회, 반차·휴식권 계열만)
export async function POST(req: NextRequest) {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }

  let body: { leaveId?: unknown; subjectId?: unknown; materialId?: unknown; materialType?: unknown; amount?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const leaveId = String(body?.leaveId ?? '').trim();
  const subjectId = String(body?.subjectId ?? '').trim();
  const materialId = String(body?.materialId ?? '').trim();
  const materialType = body?.materialType === 'lecture' ? 'lecture' : 'book';
  const reqAmount = Math.floor(Number(body?.amount ?? 0));
  if (!leaveId || !subjectId || !materialId || !(reqAmount > 0)) {
    return NextResponse.json({ success: false, message: '이월 정보가 올바르지 않습니다.' }, { status: 400 });
  }

  const thisWeek = weekKeyOf(kstToday());

  // 낙관적 잠금 재시도 — 동시 저장(쿠폰 적립/관리자 처리)에 덮이지 않게 fresh 재조회 후 조건부 저장.
  for (let attempt = 0; attempt < 3; attempt++) {
    const student = await getStudentById(studentId);
    if (!student) {
      return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
    }
    const originalUpdatedAt = student.updatedAt ?? '';

    // 1) 사유 휴가 검증: 승인·이월가능(반차/휴식권)·이번 주 발생
    const leave = (student.leaveRequests || []).find((r) => r.id === leaveId);
    if (!leave || leave.status !== 'approved') {
      return NextResponse.json({ success: false, message: '이월 근거가 되는 승인된 휴가를 찾을 수 없습니다.' }, { status: 404 });
    }
    if (!canCarryLeaveType(leave.type)) {
      return NextResponse.json({ success: false, message: '병가·개인사정 보강은 이월할 수 없어요. 이번 주 안에 보강해 주세요.' }, { status: 403 });
    }
    if (weekKeyOf(leave.date) !== thisWeek) {
      return NextResponse.json({ success: false, message: '이번 주에 발생한 휴가만 이월할 수 있어요.' }, { status: 403 });
    }

    // 2) 주당 1회 캡 — 실제 캘린더 주(createdAt) 기준.
    if (hasCarryoverInRealWeek(student.makeupCarryovers, thisWeek)) {
      return NextResponse.json({ success: false, code: 'WEEK_LIMIT', message: '이번 주 이월은 이미 사용했어요. (주 1회)' }, { status: 403 });
    }

    // 3) 쿠폰 잔액
    if ((student.leaveCoupons ?? 0) < CARRYOVER_COUPON_COST) {
      return NextResponse.json({ success: false, code: 'NO_COUPON', message: `이월권은 쿠폰 ${CARRYOVER_COUPON_COST}장이 필요해요.` }, { status: 403 });
    }

    // 4) 대상 자료·이번 주 활성 deadline 창 확인 + 이월량 상한(남은 목표 이내)
    const subject = (student.subjects || []).find((s) => s.id === subjectId);
    const material = subject && (materialType === 'book'
      ? (subject.books || []).find((b) => b.id === materialId)
      : (subject.lectures || []).find((l) => l.id === materialId));
    if (!subject || !material) {
      return NextResponse.json({ success: false, message: '대상 학습 자료를 찾을 수 없습니다.' }, { status: 404 });
    }
    const plans = material.detailedPlans || [];
    const todayKey = kstToday();
    const inWindow = (p: { startDate: string; endDate: string }) => p.startDate <= todayKey && todayKey <= p.endDate;
    const deadlinePlan = plans.find((p) => p.periodType === 'deadline' && inWindow(p));
    const dailyActive = deadlinePlan ? undefined : plans.find((p) => !p.periodType && inWindow(p));
    const activePlan = deadlinePlan || dailyActive;
    if (!activePlan) {
      return NextResponse.json({ success: false, message: '이번 주 이월할 활성 계획이 없어요.' }, { status: 400 });
    }
    // ⚠️ weekKey 는 소비 측과 반드시 같은 키로 잡는다.
    //    deadline: 오버레이(deriveDeadlineGoals)가 weekKeyOf(plan.startDate)로 대조하므로 활성 창 startDate 기준.
    //      (deadline 창은 월요일 정렬이 아니라 생성일부터 7일 — weekKeyOf(오늘)로 잡으면 어긋남)
    //    daily: 소비(getMakeupAmount)가 weekKeyOf(오늘)로 대조하므로 실제 캘린더 주(thisWeek) 기준.
    //      (운영에 UTC 직렬화 산물인 일요일 시작 daily plan 이 있어 startDate 기준이면 out 이 전주 키로
    //       저장돼 이번 주 보강이 안 줄고 쿠폰만 소모된다)
    const carryWeekKey = deadlinePlan ? weekKeyOf(deadlinePlan.startDate) : thisWeek;
    const destWeekKey = nextWeekKey(carryWeekKey);

    // 5) 이월 도착지(다음 주) 계획 창이 실제로 존재해야 한다. 마지막 주에서 이월하면 도착 창이 없어
    //    들어온 이월(carriedIn)이 오버레이에 다시 반영될 곳이 없고 → 보강량이 소실된다(쿠폰만 소모).
    //    deadline: 각 창 startDate 가 7일 간격 체인이라 weekKey 동치로 대조.
    //    daily: 창이 월요일 정렬이 아닐 수 있으므로(일요일 시작 데이터) "다음 실주를 덮는 창 존재"로 판정.
    const destWeekEnd = addDaysToDateKey(destWeekKey, 6); // 다음 실주 일요일
    const hasDestWindow = deadlinePlan
      ? plans.some((p) => p.periodType === 'deadline' && weekKeyOf(p.startDate) === destWeekKey)
      : plans.some((p) => !p.periodType && p.startDate <= destWeekEnd && destWeekKey <= p.endDate);
    if (!hasDestWindow) {
      return NextResponse.json({ success: false, code: 'NO_NEXT_WINDOW', message: '다음 주 계획이 없어 이월할 수 없어요. 이번 주 안에 보강해 주세요.' }, { status: 400 });
    }

    // 6) 이월 상한(cap): 오늘이 속한 활성 계획 창 기준.
    //    deadline = 남은 목표 − 이미 이 창에서 이월해 나간 양(alreadyOut). 창이 두 실주(週)에 걸치면
    //      주 1회 캡을 통과한 2건이 같은 창의 남은 목표를 각각 소진할 수 있어 alreadyOut 을 빼 이중집계를 막는다.
    //    daily = 이번 주 보강량(getMakeupAmount 가 이미 net.out 을 차감하므로 추가 차감하지 않는다).
    let cap = 0;
    if (deadlinePlan) {
      const alreadyOut = getCarryoverNet(student.makeupCarryovers, materialId, carryWeekKey).out;
      cap = Math.max(0, Number(deadlinePlan.targetAmount || 0) - Number(deadlinePlan.actualAmount || 0) - alreadyOut);
    } else {
      const todayDate = new Date(`${todayKey}T00:00:00`);
      cap = getMakeupAmount(material, todayDate, subject.studyDays, getLeaveDates(student), getLeaveExemptions(student), subject.studyTime, student.makeupCarryovers).makeupTotal;
    }
    if (cap <= 0) {
      return NextResponse.json({ success: false, message: '이번 주 이월할 보강이 없어요.' }, { status: 400 });
    }
    const amount = Math.min(reqAmount, cap);
    const unit = materialType === 'book' ? ((material as { unit?: string }).unit || 'p') : '강';
    const title = materialType === 'book' ? (material as { title?: string }).title || '' : (material as { name?: string }).name || '';

    const record: MakeupCarryover = {
      id: `carry_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
      weekKey: carryWeekKey,
      nextWeekKey: destWeekKey,
      subjectId,
      subjectName: subject.name,
      materialId,
      materialType,
      materialTitle: title,
      amount,
      unit,
      leaveDate: leave.date,
      leaveType: leave.type,
      couponCost: CARRYOVER_COUPON_COST,
    };

    student.leaveCoupons = (student.leaveCoupons ?? 0) - CARRYOVER_COUPON_COST;
    // append-only 무한증가 방지 — 최근 60개만 유지(오버레이는 최근 2주 창만 참조).
    student.makeupCarryovers = [...(student.makeupCarryovers || []), record].slice(-60);

    const saved = await patchStudentProgress(student, originalUpdatedAt);
    if (saved === 'conflict') continue;
    return NextResponse.json({ success: true, carryover: record, message: formatCarryoverMessage(record) });
  }
  return NextResponse.json({ success: false, message: '저장이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' }, { status: 409 });
}
