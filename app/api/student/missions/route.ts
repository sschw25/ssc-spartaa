import { NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { getStudentById } from '@/lib/store';
import { getMissionConfig } from '@/lib/mission-engine';
import { MISSION_ORDER, MISSION_META } from '@/lib/missions';
import { COUPONS_PER_EXTRA_HALFDAY } from '@/lib/leave';

// 학생: 활성 미션 목록 + 내 쿠폰 잔액 + 최근 적립 내역
export async function GET() {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }
  const [student, config] = await Promise.all([getStudentById(studentId), getMissionConfig()]);
  if (!student) {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }

  const missions = MISSION_ORDER
    .filter((id) => config[id].enabled)
    .map((id) => ({
      id,
      name: MISSION_META[id].name,
      period: MISSION_META[id].period,
      coupons: config[id].coupons,
      describe: MISSION_META[id].describe(config[id]),
    }));

  // 최근 적립 내역 (specialNote.rewards_log)
  let recent: Array<{ missionName: string; rewardGranted: number; date: string }> = [];
  try {
    const note = student.specialNote ? JSON.parse(student.specialNote) : {};
    if (note && Array.isArray(note.rewards_log)) {
      recent = note.rewards_log
        .slice(-6)
        .reverse()
        .map((l: any) => ({ missionName: l.missionName, rewardGranted: l.rewardGranted || 0, date: l.date }));
    }
  } catch { /* specialNote 평문 — 무시 */ }

  return NextResponse.json({
    success: true,
    missions,
    coupons: student.leaveCoupons ?? 0,
    couponsPerHalfday: COUPONS_PER_EXTRA_HALFDAY,
    recent,
  });
}
