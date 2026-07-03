import { NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { getStudentById, getStudySessions, getStudyMinutesByStudent } from '@/lib/store';
import { getActiveMissionConfig } from '@/lib/mission-engine';
import { readActivityEnvelope } from '@/lib/student-activity';
import { getPeriodBounds } from '@/lib/study-stats';
import { MISSION_ORDER, MISSION_META, type MissionId } from '@/lib/missions';
import {
  addDateDays,
  getDeadlineZeroOverdueStats,
  getMockReviewStats,
  getPhoneFocusStats,
  getWeeklyPlanCompletionStats,
} from '@/lib/mission-metrics';
import { COUPONS_PER_EXTRA_HALFDAY, REWARD_CATALOG } from '@/lib/leave';

const weekdayOfYmd = (ymd: string) => new Date(`${ymd}T12:00:00Z`).getUTCDay(); // 0=일 6=토
const fmtMin = (m: number) => {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return h > 0 ? `${h}시간 ${mm}분` : `${mm}분`;
};

// 학생: 활성 미션 목록(+진행 상태) + 내 쿠폰 잔액 + 최근 적립 내역
export async function GET() {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }
  const [student, config] = await Promise.all([getStudentById(studentId), getActiveMissionConfig()]);
  if (!student) {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }

  // 학생 활동 상태 (rewards_log / pomodoro_sessions) — student_state ↔ specialNote 머지
  const note: any = readActivityEnvelope(student);
  const rewardsLog: any[] = Array.isArray(note.rewards_log) ? note.rewards_log : [];

  const { todayStr, weekStart, monthStart } = getPeriodBounds();
  const monthKey = monthStart.slice(0, 7);
  const previousWeekStart = addDateDays(weekStart, -7);
  const previousWeekEnd = addDateDays(weekStart, -1);

  // 미션별 현재 기간 키 (적립 시 사용한 date 키와 일치)
  const periodKeyOf = (id: MissionId): string | null => {
    const p = MISSION_META[id].period;
    if (p === 'monthly') return monthKey;
    if (p === 'weekly') return weekStart;
    if (p === 'daily') return todayStr;
    return null; // event(OT)는 단일 기간 없음
  };
  const earnedFor = (id: MissionId): boolean => {
    const key = periodKeyOf(id);
    if (!key) return false;
    const name = MISSION_META[id].name;
    return rewardsLog.some((l) => l.date === key && l.missionName === name && (l.rewardGranted || 0) > 0);
  };

  // 저비용 진행 힌트 (세션 추가 조회 없이 student 객체/봉투만 사용)
  const monthPenalty = (student.penalties || [])
    .filter((p) => p.type === 'penalty' && (p.date || '').startsWith(monthKey))
    .reduce((sum, p) => sum + (p.points || 0), 0);
  const todayPomodoro = note.pomodoro_sessions?.[todayStr] || 0;
  const weeklyPlanStats = getWeeklyPlanCompletionStats(student, weekStart, todayStr);
  const phoneFocusStats = getPhoneFocusStats(student, weekStart, todayStr);
  const deadlineStats = getDeadlineZeroOverdueStats(student, new Date(), todayStr);
  const mockReviewStats = getMockReviewStats(student, weekStart, todayStr, config.mock_review_complete.mockReviewMinChars ?? 10);

  // 세션 기반 진행도 (주말 집중 / 주간 순공 랭킹) — 활성 미션일 때만 조회
  let weekendHits = 0;
  let weeklyMinutes = 0;
  let weeklyRank: number | null = null;
  let previousWeeklyMinutes = 0;
  try {
    if (config.weekend_study.enabled) {
      const needMin = (config.weekend_study.weekendHours ?? 3) * 60;
      const monthSessions = await getStudySessions(studentId, monthStart);
      const perDay = new Map<string, number>();
      for (const s of monthSessions) {
        if (s.minutes == null) continue;
        perDay.set(s.date, (perDay.get(s.date) || 0) + s.minutes);
      }
      for (const [date, min] of perDay) {
        const dow = weekdayOfYmd(date);
        if ((dow === 0 || dow === 6) && min >= needMin) weekendHits++;
      }
    }
    if (config.weekly_top_rank.enabled || config.weekly_growth.enabled) {
      const weekMin = await getStudyMinutesByStudent(weekStart, todayStr);
      weeklyMinutes = weekMin[studentId] || 0;
      if (config.weekly_top_rank.enabled && weeklyMinutes > 0) {
        const ranked = Object.values(weekMin).filter((m) => m > 0).sort((a, b) => b - a);
        weeklyRank = ranked.indexOf(weeklyMinutes) + 1; // 동점이면 상위 등수
      }
      if (config.weekly_growth.enabled) {
        const prevMin = await getStudyMinutesByStudent(previousWeekStart, previousWeekEnd);
        previousWeeklyMinutes = prevMin[studentId] || 0;
      }
    }
  } catch { /* 세션 백엔드 미설정 등 — 진행도 생략 */ }

  const progressOf = (id: MissionId): string | null => {
    const c = config[id];
    switch (id) {
      case 'monthly_no_penalty':
        return monthPenalty === 0 ? '이번 달 벌점 0점 — 유지 중' : `이번 달 벌점 ${monthPenalty}점`;
      case 'daily_pomodoro':
        return `오늘 ${todayPomodoro}/${c.pomodoroSessions ?? 2} 세션`;
      case 'weekend_study':
        return `이번 달 주말 ${weekendHits}/${c.weekendCount ?? 2}회 달성`;
      case 'weekly_top_rank':
        if (weeklyMinutes <= 0) return '이번 주 순공 기록 없음';
        return `이번 주 순공 ${fmtMin(weeklyMinutes)} · 현재 ${weeklyRank}등 (상위 ${c.topN ?? 3}명 지급)`;
      case 'weekly_plan_completion': {
        const need = c.planCompletionRate ?? 85;
        if (weeklyPlanStats.expected <= 0 || weeklyPlanStats.rate === null) return '이번 주 배정된 일일 계획 없음';
        return `이번 주 계획 ${weeklyPlanStats.completed}/${weeklyPlanStats.expected}개 완료 · ${Math.round(weeklyPlanStats.rate * 100)}%/${need}%`;
      }
      case 'phone_focus_week':
        return `이번 주 휴대폰 제출/보관 ${phoneFocusStats.count}/${c.phoneFocusDays ?? 5}일`;
      case 'weekly_growth': {
        const needHours = c.growthMinHours ?? 20;
        const needGrowth = c.growthPercent ?? 15;
        if (weeklyMinutes <= 0) return `이번 주 순공 기록 없음 · 최소 ${needHours}시간 필요`;
        if (previousWeeklyMinutes <= 0) return `이번 주 ${fmtMin(weeklyMinutes)} · 지난주 기록이 있어야 성장률 계산 가능`;
        const growth = ((weeklyMinutes - previousWeeklyMinutes) / previousWeeklyMinutes) * 100;
        return `이번 주 ${fmtMin(weeklyMinutes)} · 전주 대비 ${Math.round(growth)}%/${needGrowth}% · 최소 ${needHours}시간`;
      }
      case 'deadline_zero_overdue':
        if (deadlineStats.activeCount <= 0) return '진행 중인 기간 목표 없음';
        return `기간 목표 ${deadlineStats.activeCount}개 중 지연 위험 ${deadlineStats.riskCount}건`;
      case 'mock_review_complete':
        return mockReviewStats.count > 0
          ? `이번 주 오답분석 ${mockReviewStats.count}건 제출`
          : `이번 주 오답분석 제출 전 · 각 항목 ${c.mockReviewMinChars ?? 10}자 이상`;
      default:
        return null;
    }
  };

  const missions = MISSION_ORDER
    .filter((id) => config[id].enabled)
    .map((id) => ({
      id,
      name: MISSION_META[id].name,
      period: MISSION_META[id].period,
      coupons: config[id].coupons,
      describe: MISSION_META[id].describe(config[id]),
      earned: earnedFor(id),
      progress: progressOf(id),
    }));

  const recent = rewardsLog
    .filter((l) => (l.rewardGranted || 0) > 0)
    .slice(-6)
    .reverse()
    .map((l) => ({ missionName: l.missionName, rewardGranted: l.rewardGranted || 0, date: l.date }));

  // 쿠폰 교환 카탈로그(3=반차권/6=휴식권/9=상품권·플래너) + 내 교환 신청/내역
  const redemptions = (student.rewardRedemptions || [])
    .slice()
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    .map((r) => ({ id: r.id, type: r.type, cost: r.cost, status: r.status, createdAt: r.createdAt, voucherCode: r.voucherCode, note: r.note, fulfilledAt: r.fulfilledAt }));
  const committed = (student.rewardRedemptions || [])
    .filter((r) => r.status === 'requested' || r.status === 'pending')
    .reduce((sum, r) => sum + (r.cost || 0), 0);

  return NextResponse.json({
    success: true,
    missions,
    coupons: student.leaveCoupons ?? 0,
    couponsAvailable: Math.max(0, (student.leaveCoupons ?? 0) - committed),
    couponsPerHalfday: COUPONS_PER_EXTRA_HALFDAY,
    rewardCatalog: REWARD_CATALOG,
    redemptions,
    recent,
  });
}
