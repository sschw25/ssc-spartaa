import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import {
  activeBackend,
  getStudents,
  getOpenSessions,
  getSessionsByDate,
  getStudyMinutesByStudent,
} from '@/lib/store';
import { getPeriodBounds } from '@/lib/study-stats';

// KST 'HH:MM'
function seoulHm(iso: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

// 관리자: 오늘 출결 현황(등원중/하원/미등원) + 주간 순공 집계
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  // Supabase 미설정(로컬 개발)에선 출결 데이터가 없으므로 비활성 응답 — 위젯이 안내 상태를 띄움
  if (activeBackend() !== 'supabase') {
    return NextResponse.json({ success: true, configured: false });
  }

  try {
    const { todayStr, weekStart } = getPeriodBounds();
    const [students, openSessions, todaySessions, weekMinutesByStudent] = await Promise.all([
      getStudents(),
      getOpenSessions(),
      getSessionsByDate(todayStr),
      getStudyMinutesByStudent(weekStart),
    ]);

    const studentMap = new Map(students.map((s) => [s.id, s]));
    const openIds = new Set(openSessions.map((s) => s.student_id));
    const nowMs = Date.now();

    // 현재 등원 중 (미퇴실 세션 보유)
    const present = openSessions
      .filter((s) => studentMap.has(s.student_id))
      .map((s) => {
        const stu = studentMap.get(s.student_id)!;
        return {
          id: stu.id,
          name: stu.name,
          campus: stu.campus,
          checkInAt: seoulHm(s.check_in),
          minutesSoFar: Math.max(0, Math.round((nowMs - new Date(s.check_in).getTime()) / 60000)),
          weekMinutes: weekMinutesByStudent[stu.id] || 0,
        };
      });

    // 오늘 하원 완료 (퇴실했고, 지금은 재등원 중이 아님)
    const leftToday = todaySessions
      .filter((s) => s.check_out && studentMap.has(s.student_id) && !openIds.has(s.student_id))
      .map((s) => {
        const stu = studentMap.get(s.student_id)!;
        return {
          id: stu.id,
          name: stu.name,
          campus: stu.campus,
          checkInAt: seoulHm(s.check_in),
          checkOutAt: s.check_out ? seoulHm(s.check_out) : '',
          minutes: s.minutes || 0,
          weekMinutes: weekMinutesByStudent[stu.id] || 0,
        };
      });

    // 오늘 단 한 번도 출결 기록이 없는 학생 = 미등원
    const seenToday = new Set(todaySessions.map((s) => s.student_id));
    openSessions.forEach((s) => seenToday.add(s.student_id));
    const absent = students
      .filter((s) => !seenToday.has(s.id))
      .map((s) => ({
        id: s.id,
        name: s.name,
        campus: s.campus,
        weekMinutes: weekMinutesByStudent[s.id] || 0,
      }));

    return NextResponse.json({
      success: true,
      configured: true,
      today: todayStr,
      summary: {
        total: students.length,
        present: present.length,
        leftToday: leftToday.length,
        absent: absent.length,
      },
      present,
      leftToday,
      absent,
      weekMinutesByStudent,
    });
  } catch (e: any) {
    console.error('attendance/today error:', e);
    return NextResponse.json(
      { success: false, message: e?.message || '출결 현황 조회에 실패했습니다.' },
      { status: 500 }
    );
  }
}
