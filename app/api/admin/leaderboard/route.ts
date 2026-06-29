import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { activeBackend, getStudentsSummary, getStudyMinutesByStudent, getOpenSessions } from '@/lib/store';
import { getPeriodBounds } from '@/lib/study-stats';

// 관리자: 전체 순공 랭킹 (관리관점 — 실명·전원 노출, 0분 학생도 하위에 포함).
export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  if (activeBackend() !== 'supabase') {
    return NextResponse.json({ success: true, configured: false });
  }

  try {
    const { weekStart, todayStr } = getPeriodBounds();
    const [students, weekMin, dayMin, openSessions] = await Promise.all([
      getStudentsSummary(),
      getStudyMinutesByStudent(weekStart),
      getStudyMinutesByStudent(todayStr),
      getOpenSessions(),
    ]);
    const openIds = new Set(openSessions.map((s) => s.student_id));

    // 캠퍼스 관리자는 본인 캠퍼스 학생만 랭킹 노출 (슈퍼는 전원)
    const visibleStudents = session.campus === 'all'
      ? students
      : students.filter((s) => s.campus === session.campus);

    const sorted = visibleStudents
      .map((s) => ({
        id: s.id, name: s.name, campus: s.campus,
        weekMinutes: weekMin[s.id] || 0,
        dayMinutes: dayMin[s.id] || 0,
        isOpen: openIds.has(s.id),
      }))
      .sort((a, b) => b.weekMinutes - a.weekMinutes || a.name.localeCompare(b.name, 'ko'));

    // 표준 경쟁 순위 (동점=동일등수), 0분 학생도 하위 등수로 포함
    let lastMin: number | null = null;
    let lastRank = 0;
    const rows = sorted.map((r, i) => {
      const rank = lastMin !== null && r.weekMinutes === lastMin ? lastRank : i + 1;
      lastMin = r.weekMinutes; lastRank = rank;
      return { ...r, rank };
    });

    const studied = rows.filter((r) => r.weekMinutes > 0).length;
    const avgWeekMin = studied > 0 ? Math.round(rows.reduce((a, r) => a + r.weekMinutes, 0) / rows.length) : 0;

    // 라이브 카운트도 본인 캠퍼스 학생 기준으로 집계 (슈퍼는 전체)
    const visibleIds = new Set(visibleStudents.map((s) => s.id));
    const liveCount = session.campus === 'all'
      ? openSessions.length
      : openSessions.filter((s) => visibleIds.has(s.student_id)).length;

    return NextResponse.json({
      success: true,
      configured: true,
      weekStart,
      today: todayStr,
      liveCount,
      summary: { total: rows.length, studied, notStudied: rows.length - studied, avgWeekMin },
      rows,
    });
  } catch (e: any) {
    console.error('admin/leaderboard error:', e);
    return NextResponse.json({ success: false, message: e?.message || '랭킹 조회 실패' }, { status: 500 });
  }
}
