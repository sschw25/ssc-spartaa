import { NextResponse } from 'next/server';
import { getStudentSessionId, isAdmin } from '@/lib/auth';
import { activeBackend, getStudents, getSessionsByDate, getStudentById } from '@/lib/store';
import { getPeriodBounds } from '@/lib/study-stats';
import { getDayStudyItems, summarizeDayStudy } from '@/lib/student-calendar';

// '오늘 등원한 우리 캠퍼스 원생들'의 오늘 계획 달성도 평균(동기부여용). 보는 학생의 캠퍼스로 스코프.
// 계획이 없는 등원 학생은 분모에서 제외한다. 캠퍼스별 60초 인메모리 캐시.
const cacheByCampus = new Map<string, { at: number; body: Record<string, unknown> }>();
const CACHE_MS = 60_000;

export async function GET() {
  const sid = await getStudentSessionId();
  if (!sid && !(await isAdmin())) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }
  if (activeBackend() !== 'supabase') {
    return NextResponse.json({ success: true, configured: false });
  }

  // 스코프 캠퍼스: 학생 세션이면 그 학생의 캠퍼스, 아니면 전체('all').
  let campus = 'all';
  if (sid) {
    const me = await getStudentById(sid);
    if (me?.campus) campus = me.campus;
  }

  const hit = cacheByCampus.get(campus);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return NextResponse.json(hit.body);
  }

  try {
    const { todayStr } = getPeriodBounds();
    const [allStudents, sessions] = await Promise.all([
      getStudents(),
      getSessionsByDate(todayStr),
    ]);
    const students = campus === 'all' ? allStudents : allStudents.filter((s) => s.campus === campus);

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
      campus,                   // 스코프 캠퍼스(학생 소속)
      avgPercent,
      studentCount,             // 계획이 있어 달성도 산정에 포함된 등원 학생 수
      checkedInCount: checkedIn.length, // 오늘 등원한(계획 유무 무관) 캠퍼스 학생 수
    };
    cacheByCampus.set(campus, { at: Date.now(), body });
    return NextResponse.json(body);
  } catch (e: any) {
    console.error('daily-plan-average error:', e);
    return NextResponse.json({ success: false, message: e?.message || '평균 달성도 조회 실패' }, { status: 500 });
  }
}
