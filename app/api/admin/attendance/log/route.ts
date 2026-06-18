import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { activeBackend, getStudents, getSessionsByDate, getOpenSessions } from '@/lib/store';
import { getPeriodBounds } from '@/lib/study-stats';

// KST 'HH:MM' 및 자정 기준 분
function seoulHm(iso: string): { label: string; min: number } {
  const label = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso));
  const [h, m] = label.split(':').map(Number);
  return { label, min: h * 60 + m };
}

// 지각 분류: 08:20(500분)·09:00(540분) 두 기준
function lateStatus(checkInMin: number): 'ontime' | 'late0820' | 'late0900' {
  if (checkInMin <= 8 * 60 + 20) return 'ontime';
  if (checkInMin <= 9 * 60) return 'late0820';
  return 'late0900';
}

// 관리자: 특정 날짜의 학생별 출결 로그 (이름/등원/하원/체류/지각). 정렬은 클라이언트에서.
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

  try {
    const [students, sessions, openSessions] = await Promise.all([
      getStudents(),
      getSessionsByDate(date),
      getOpenSessions(),
    ]);
    const studentMap = new Map(students.map((s) => [s.id, s]));
    const openIds = new Set(openSessions.map((s) => s.student_id));

    // 학생별로 그날 세션 집계 (최초 등원 ~ 최종 하원, 순공 합산)
    const byStudent = new Map<string, typeof sessions>();
    for (const s of sessions) {
      if (!studentMap.has(s.student_id)) continue;
      const arr = byStudent.get(s.student_id) || [];
      arr.push(s);
      byStudent.set(s.student_id, arr);
    }

    const rows = Array.from(byStudent.entries()).map(([sid, arr]) => {
      const stu = studentMap.get(sid)!;
      const firstIn = arr.reduce((min, s) => (s.check_in < min ? s.check_in : min), arr[0].check_in);
      const closed = arr.filter((s) => s.check_out);
      const lastOut = closed.length
        ? closed.reduce((max, s) => (s.check_out! > max ? s.check_out! : max), closed[0].check_out!)
        : null;
      const minutes = closed.reduce((a, s) => a + (s.minutes || 0), 0);
      const stillOpen = openIds.has(sid) && arr.some((s) => !s.check_out);
      const ci = seoulHm(firstIn);
      const co = lastOut ? seoulHm(lastOut) : null;
      return {
        id: stu.id, name: stu.name, campus: stu.campus,
        checkIn: ci.label, checkInMin: ci.min,
        checkOut: co?.label ?? null, checkOutMin: co?.min ?? null,
        minutes, isOpen: stillOpen,
        late: lateStatus(ci.min),
      };
    });

    const lateCount = {
      late0820: rows.filter((r) => r.late === 'late0820').length,
      late0900: rows.filter((r) => r.late === 'late0900').length,
      ontime: rows.filter((r) => r.late === 'ontime').length,
    };

    return NextResponse.json({
      success: true,
      configured: true,
      date,
      total: students.length,
      attended: rows.length,
      lateCount,
      rows,
    });
  } catch (e: any) {
    console.error('attendance/log error:', e);
    return NextResponse.json({ success: false, message: e?.message || '출결 로그 조회 실패' }, { status: 500 });
  }
}
