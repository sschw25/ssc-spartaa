import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { activeBackend, getStudentsSummary, getSessionsByDate, getOpenSessions } from '@/lib/store';
import { getPeriodBounds } from '@/lib/study-stats';
import { arrivalDeadlineMin, normalizeArrival } from '@/lib/attendance-time';

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
      getStudentsSummary(),
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
      const lastClosed = closed.length
        ? closed.reduce((max, session) => (session.check_out! > max.check_out! ? session : max), closed[0])
        : null;
      const lastOut = lastClosed?.check_out ?? null;
      const recognizedMinutes = closed
        .map((session) => session.minutes)
        .filter((minutes): minutes is number => typeof minutes === 'number');
      const minutes = recognizedMinutes.length
        ? recognizedMinutes.reduce((sum, value) => sum + value, 0)
        : null;
      const autoClosed = lastClosed?.source === 'auto-sweep' && lastClosed.minutes == null;
      const stillOpen = openIds.has(sid) && arr.some((session) => !session.check_out);
      const ci = seoulHm(firstIn);
      const co = lastOut ? seoulHm(lastOut) : null;
      const expectedArrival = normalizeArrival(stu.expectedArrival);
      const isLate = ci.min > arrivalDeadlineMin(expectedArrival);
      return {
        id: stu.id,
        name: stu.name,
        campus: stu.campus,
        checkIn: ci.label,
        checkInMin: ci.min,
        checkOut: autoClosed ? null : co?.label ?? null,
        checkOutMin: autoClosed ? null : co?.min ?? null,
        minutes,
        autoClosed,
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
            const expectedArrival = normalizeArrival(stu.expectedArrival);
            return {
              id: stu.id,
              name: stu.name,
              campus: stu.campus,
              checkIn: '',
              checkInMin: Number.MAX_SAFE_INTEGER,
              checkOut: null,
              checkOutMin: null,
              minutes: null,
              autoClosed: false,
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
