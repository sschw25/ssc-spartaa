import { NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { getStudentById } from '@/lib/store';
import { getMissionConfig } from '@/lib/mission-engine';
import { readActivityEnvelope } from '@/lib/student-activity';
import { getPeriodBounds } from '@/lib/study-stats';
import { MISSION_ORDER, MISSION_META, type MissionId } from '@/lib/missions';
import { COUPONS_PER_EXTRA_HALFDAY } from '@/lib/leave';

// 학생: 활성 미션 목록(+진행 상태) + 내 쿠폰 잔액 + 최근 적립 내역
export async function GET() {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }
  const [student, config] = await Promise.all([getStudentById(studentId), getMissionConfig()]);
  if (!student) {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }

  // 학생 활동 상태 (rewards_log / pomodoro_sessions) — student_state ↔ specialNote 머지
  const note: any = readActivityEnvelope(student);
  const rewardsLog: any[] = Array.isArray(note.rewards_log) ? note.rewards_log : [];

  const { todayStr, weekStart, monthStart } = getPeriodBounds();
  const monthKey = monthStart.slice(0, 7);

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

  const progressOf = (id: MissionId): string | null => {
    const c = config[id];
    switch (id) {
      case 'monthly_no_penalty':
        return monthPenalty === 0 ? '이번 달 벌점 0점 — 유지 중' : `이번 달 벌점 ${monthPenalty}점`;
      case 'daily_pomodoro':
        return `오늘 ${todayPomodoro}/${c.pomodoroSessions ?? 2} 세션`;
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

  return NextResponse.json({
    success: true,
    missions,
    coupons: student.leaveCoupons ?? 0,
    couponsPerHalfday: COUPONS_PER_EXTRA_HALFDAY,
    recent,
  });
}
