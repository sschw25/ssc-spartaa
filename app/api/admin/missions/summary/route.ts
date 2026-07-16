import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { getStudents } from '@/lib/store';
import { getPeriodBounds } from '@/lib/study-stats';
import { readActivityEnvelope } from '@/lib/student-activity';
import { MISSION_META, MISSION_LEGACY_NAMES } from '@/lib/missions';
import type { MissionId } from '@/lib/missions';

// 미션 개명 시 옛 이름 지급 로그를 현재 이름으로 병합 표시(합산은 원래 1회씩 — 표시 그룹핑만).
const LEGACY_NAME_TO_CURRENT: Record<string, string> = Object.fromEntries(
  (Object.entries(MISSION_LEGACY_NAMES) as Array<[MissionId, string[] | undefined]>).flatMap(
    ([id, legacyNames]) => (legacyNames || []).map((legacy) => [legacy, MISSION_META[id].name]),
  ),
);

// 관리자: 현재 기간(이번 주/이번 달/오늘) 쿠폰 미션 지급 현황 요약 (대시보드 위젯용)
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  try {
    const students = await getStudents();
    const { todayStr, weekStart, monthStart } = getPeriodBounds();
    const monthKey = monthStart.slice(0, 7);

    const bucket = () => ({ coupons: 0, students: 0 });
    const week = bucket();
    const month = bucket();
    const today = bucket();
    const byMission = new Map<string, { coupons: number; students: number }>();

    for (const s of students) {
      const env = readActivityEnvelope(s);
      const log = Array.isArray(env.rewards_log) ? (env.rewards_log as any[]) : [];
      let wHit = false, mHit = false, tHit = false;
      const seenMission = new Set<string>();
      for (const l of log) {
        const coupons = Number(l?.rewardGranted) || 0;
        if (coupons <= 0) continue;
        const date = String(l?.date || '');
        const rawName = String(l?.missionName || '기타');
        const name = LEGACY_NAME_TO_CURRENT[rawName] || rawName;
        let inPeriod = false;
        if (date === monthKey) { month.coupons += coupons; mHit = true; inPeriod = true; }
        else if (date === weekStart) { week.coupons += coupons; wHit = true; inPeriod = true; }
        else if (date === todayStr) { today.coupons += coupons; tHit = true; inPeriod = true; }
        if (inPeriod) {
          const cur = byMission.get(name) || { coupons: 0, students: 0 };
          cur.coupons += coupons;
          if (!seenMission.has(name)) { cur.students += 1; seenMission.add(name); }
          byMission.set(name, cur);
        }
      }
      if (wHit) week.students += 1;
      if (mHit) month.students += 1;
      if (tHit) today.students += 1;
    }

    return NextResponse.json({
      success: true,
      week: { key: weekStart, ...week },
      month: { key: monthKey, ...month },
      today: { key: todayStr, ...today },
      byMission: Array.from(byMission.entries())
        .map(([missionName, v]) => ({ missionName, ...v }))
        .sort((a, b) => b.coupons - a.coupons),
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '요약 조회 실패' },
      { status: 500 },
    );
  }
}
