import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { activeBackend, getStudents, getStudyMinutesByStudent, getOpenSessions } from '@/lib/store';
import { getPeriodBounds } from '@/lib/study-stats';

// 관리자: 전체 순공 랭킹 (관리관점 — 실명·전원 노출, 0분 학생도 하위에 포함).
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  if (activeBackend() !== 'supabase') {
    return NextResponse.json({ success: true, configured: false });
  }

  try {
    const { weekStart, todayStr } = getPeriodBounds();
    const [students, weekMin, dayMin, openSessions] = await Promise.all([
      getStudents(),
      getStudyMinutesByStudent(weekStart),
      getStudyMinutesByStudent(todayStr),
      getOpenSessions(),
    ]);
    const openIds = new Set(openSessions.map((s) => s.student_id));

    const sorted = students
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

    return NextResponse.json({
      success: true,
      configured: true,
      weekStart,
      today: todayStr,
      liveCount: openSessions.length,
      summary: { total: rows.length, studied, notStudied: rows.length - studied, avgWeekMin },
      rows,
    });
  } catch (e: any) {
    console.error('admin/leaderboard error:', e);
    return NextResponse.json({ success: false, message: e?.message || '랭킹 조회 실패' }, { status: 500 });
  }
}
