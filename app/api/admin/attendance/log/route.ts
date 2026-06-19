import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { activeBackend, getStudents, getSessionsByDate, getOpenSessions } from '@/lib/store';
import { getPeriodBounds } from '@/lib/study-stats';

function seoulHm(iso: string): { label: string; min: number } {
  const label = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
  const [h, m] = label.split(':').map(Number);
  return { label, min: h * 60 + m };
}

const DEADLINE_MIN: Record<string, number> = { '08:20': 8 * 60 + 20, '09:00': 9 * 60 };

// 관리자: 특정 날짜의 학생별 출결 로그.
// includeAbsent=1이면 당일 출결 기록이 없는 학생도 함께 내려준다.
export async function GET(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  if (activeBackend() !== 'supabase') {
    return NextResponse.json({ success: true, configured: false });
  }

  const url = new URL(request.url);
  const dateParam = url.searchParams.get('date');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateParam || '') ? dateParam! : getPeriodBounds().todayStr;
  const includeAbsent = url.searchParams.get('includeAbsent') === '1';

  try {
    const [students, sessions, openSessions] = await Promise.all([
      getStudents(),
      getSessionsByDate(date),
      getOpenSessions(),
    ]);
    const studentMap = new Map(students.map((s) => [s.id, s]));
    const openIds = new Set(openSessions.map((s) => s.student_id));

    const byStudent = new Map<string, typeof sessions>();
    for (const session of sessions) {
      if (!studentMap.has(session.student_id)) continue;
      const arr = byStudent.get(session.student_id) || [];
      arr.push(session);
      byStudent.set(session.student_id, arr);
    }

    const attendedRows = Array.from(byStudent.entries()).map(([sid, arr]) => {
      const stu = studentMap.get(sid)!;
      const firstIn = arr.reduce((min, session) => (session.check_in < min ? session.check_in : min), arr[0].check_in);
      const closed = arr.filter((session) => session.check_out);
      const lastOut = closed.length
        ? closed.reduce((max, session) => (session.check_out! > max ? session.check_out! : max), closed[0].check_out!)
        : null;
      const minutes = closed.reduce((sum, session) => sum + (session.minutes || 0), 0);
      const stillOpen = openIds.has(sid) && arr.some((session) => !session.check_out);
      const ci = seoulHm(firstIn);
      const co = lastOut ? seoulHm(lastOut) : null;
      const expectedArrival = (stu.expectedArrival === '09:00' ? '09:00' : '08:20') as '08:20' | '09:00';
      const isLate = ci.min > DEADLINE_MIN[expectedArrival];
      return {
        id: stu.id,
        name: stu.name,
        campus: stu.campus,
        checkIn: ci.label,
        checkInMin: ci.min,
        checkOut: co?.label ?? null,
        checkOutMin: co?.min ?? null,
        minutes,
        isOpen: stillOpen,
        expectedArrival,
        isLate,
        isAbsent: false,
      };
    });

    const absentRows = includeAbsent
      ? students
          .filter((stu) => !byStudent.has(stu.id))
          .map((stu) => {
            const expectedArrival = (stu.expectedArrival === '09:00' ? '09:00' : '08:20') as '08:20' | '09:00';
            return {
              id: stu.id,
              name: stu.name,
              campus: stu.campus,
              checkIn: '',
              checkInMin: Number.MAX_SAFE_INTEGER,
              checkOut: null,
              checkOutMin: null,
              minutes: 0,
              isOpen: false,
              expectedArrival,
              isLate: false,
              isAbsent: true,
            };
          })
      : [];

    const rows = [...attendedRows, ...absentRows];
    const summary = {
      ontime: attendedRows.filter((r) => !r.isLate).length,
      late: attendedRows.filter((r) => r.isLate).length,
      group0820: {
        total: attendedRows.filter((r) => r.expectedArrival === '08:20').length,
        late: attendedRows.filter((r) => r.expectedArrival === '08:20' && r.isLate).length,
      },
      group0900: {
        total: attendedRows.filter((r) => r.expectedArrival === '09:00').length,
        late: attendedRows.filter((r) => r.expectedArrival === '09:00' && r.isLate).length,
      },
    };

    return NextResponse.json({
      success: true,
      configured: true,
      date,
      total: students.length,
      attended: attendedRows.length,
      summary,
      rows,
    });
  } catch (e: any) {
    console.error('attendance/log error:', e);
    return NextResponse.json({ success: false, message: e?.message || '출결 로그 조회 실패' }, { status: 500 });
  }
}
