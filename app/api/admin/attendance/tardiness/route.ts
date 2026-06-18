import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { activeBackend, getStudents, getSessionsInRange } from '@/lib/store';
import { getPeriodBounds } from '@/lib/study-stats';

const DEADLINE_MIN: Record<string, number> = { '08:20': 8 * 60 + 20, '09:00': 9 * 60 };

function seoulMin(iso: string): number {
  const label = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso));
  const [h, m] = label.split(':').map(Number);
  return h * 60 + m;
}

// 관리자: 이번 주(weekStart~오늘) 학생별 지각 누적 — 상습 지각 식별용
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  if (activeBackend() !== 'supabase') {
    return NextResponse.json({ success: true, configured: false });
  }

  try {
    const { weekStart, todayStr } = getPeriodBounds();
    const [students, sessions] = await Promise.all([
      getStudents(),
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
      const expectedArrival = (stu.expectedArrival === '09:00' ? '09:00' : '08:20') as '08:20' | '09:00';
      const deadline = DEADLINE_MIN[expectedArrival];
      const attendedDays = byDate.size;
      let lateDays = 0;
      byDate.forEach((min) => { if (min > deadline) lateDays += 1; });
      return {
        id: stu.id, name: stu.name, campus: stu.campus,
        expectedArrival, attendedDays, lateDays,
        lateRate: attendedDays > 0 ? Math.round((lateDays / attendedDays) * 100) : 0,
      };
    }).sort((a, b) => b.lateDays - a.lateDays || b.lateRate - a.lateRate || a.name.localeCompare(b.name, 'ko'));

    const summary = {
      weekStart, today: todayStr,
      lateStudents: rows.filter((r) => r.lateDays > 0).length,
      totalLateDays: rows.reduce((a, r) => a + r.lateDays, 0),
    };

    return NextResponse.json({ success: true, configured: true, weekStart, today: todayStr, summary, rows });
  } catch (e: any) {
    console.error('attendance/tardiness error:', e);
    return NextResponse.json({ success: false, message: e?.message || '지각 누적 조회 실패' }, { status: 500 });
  }
}
