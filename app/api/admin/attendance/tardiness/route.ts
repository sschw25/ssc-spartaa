import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { activeBackend, getStudentsSummary, getSessionsInRange } from '@/lib/store';
import { getPeriodBounds } from '@/lib/study-stats';
import { arrivalDeadlineMin, normalizeArrival } from '@/lib/attendance-time';

function seoulMin(iso: string): number {
  const label = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso));
  const [h, m] = label.split(':').map(Number);
  return h * 60 + m;
}

// 관리자: 이번 주(weekStart~오늘) 학생별 지각 누적 — 상습 지각 식별용
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
    const [students, sessions] = await Promise.all([
      getStudentsSummary(),
      getSessionsInRange(weekStart, todayStr),
    ]);
    const studentMap = new Map(students.map((s) => [s.id, s]));

    // 학생 → 날짜 → 그날 최초 등원 분(min)
    const firstInByStudentDate = new Map<string, Map<string, number>>();
    for (const s of sessions) {
      if (!studentMap.has(s.student_id)) continue;
      const byDate = firstInByStudentDate.get(s.student_id) || new Map<string, number>();
      const cur = seoulMin(s.check_in);
      const prev = byDate.get(s.date);
      if (prev === undefined || cur < prev) byDate.set(s.date, cur);
      firstInByStudentDate.set(s.student_id, byDate);
    }

    const rows = Array.from(firstInByStudentDate.entries()).map(([sid, byDate]) => {
      const stu = studentMap.get(sid)!;
      const expectedArrival = normalizeArrival(stu.expectedArrival);
      const deadline = arrivalDeadlineMin(expectedArrival);
      const attendedDays = byDate.size;
      let lateDays = 0;
      byDate.forEach((min) => { if (min > deadline) lateDays += 1; });
      return {
        id: stu.id, name: stu.name, campus: stu.campus,
        expectedArrival, attendedDays, lateDays,
        lateRate: attendedDays > 0 ? Math.round((lateDays / attendedDays) * 100) : 0,
      };
    }).sort((a, b) => b.lateDays - a.lateDays || b.lateRate - a.lateRate || a.name.localeCompare(b.name, 'ko'));

    // 캠퍼스 관리자는 본인 캠퍼스 학생만 조회 가능 (슈퍼는 전원)
    const visibleRows = session.campus === 'all' ? rows : rows.filter((r) => r.campus === session.campus);

    const summary = {
      weekStart, today: todayStr,
      lateStudents: visibleRows.filter((r) => r.lateDays > 0).length,
      totalLateDays: visibleRows.reduce((a, r) => a + r.lateDays, 0),
    };

    return NextResponse.json({ success: true, configured: true, weekStart, today: todayStr, summary, rows: visibleRows });
  } catch (e: any) {
    console.error('attendance/tardiness error:', e);
    return NextResponse.json({ success: false, message: e?.message || '지각 누적 조회 실패' }, { status: 500 });
  }
}
