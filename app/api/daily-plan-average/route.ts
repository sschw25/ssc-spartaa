import { NextResponse } from 'next/server';
import { getStudentSessionId, isAdmin } from '@/lib/auth';
import { activeBackend, getStudents, getSessionsByDate } from '@/lib/store';
import { getPeriodBounds } from '@/lib/study-stats';
import { getDayStudyItems, summarizeDayStudy } from '@/lib/student-calendar';

// 오늘 등원한 학생들의 '오늘 계획 달성도' 학원 평균(동기부여용). 특정 학생을 식별하지 않는 집계라
// 로그인(학생/관리자)만 요구한다. 계획이 없는 등원 학생은 분모에서 제외한다.

// 60초 인메모리 캐시 — 학생 홈이 열릴 때마다 전 학생 로드를 반복하지 않는다(값 특성상 분 단위 신선도면 충분).
let cached: { at: number; body: Record<string, unknown> } | null = null;
const CACHE_MS = 60_000;

export async function GET() {
  const sid = await getStudentSessionId();
  if (!sid && !(await isAdmin())) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }

  if (activeBackend() !== 'supabase') {
    return NextResponse.json({ success: true, configured: false });
  }

  if (cached && Date.now() - cached.at < CACHE_MS) {
    return NextResponse.json(cached.body);
  }

  try {
    const { todayStr } = getPeriodBounds();
    const [students, sessions] = await Promise.all([
      getStudents(),
      getSessionsByDate(todayStr),
    ]);

    // 오늘 출결 기록이 한 번이라도 있으면 '오늘 등원'. (열린 세션도 date=todayStr 로 포함됨)
    const seenToday = new Set(sessions.map((s) => s.student_id));
    const checkedIn = students.filter((s) => seenToday.has(s.id));

    // 등원 학생별 오늘 계획 달성도(%)를 구해 평균. 목표 항목이 없는 학생은 산정에서 제외.
    const percents: number[] = [];
    for (const s of checkedIn) {
      const { planned, done } = summarizeDayStudy(getDayStudyItems(s, todayStr));
      if (planned <= 0) continue;
      percents.push(Math.round((done / planned) * 100));
    }

    const studentCount = percents.length;
    const avgPercent = studentCount > 0
      ? Math.round(percents.reduce((a, b) => a + b, 0) / studentCount)
      : 0;

    const body = {
      success: true,
      configured: true,
      today: todayStr,
      avgPercent,
      studentCount,             // 계획이 있어 달성도 산정에 포함된 등원 학생 수
      checkedInCount: checkedIn.length,
    };
    cached = { at: Date.now(), body };
    return NextResponse.json(body);
  } catch (e: any) {
    console.error('daily-plan-average error:', e);
    return NextResponse.json({ success: false, message: e?.message || '평균 달성도 조회 실패' }, { status: 500 });
  }
}
