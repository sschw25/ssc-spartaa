import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import {
  activeBackend,
  getStudentsSummary,
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
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  // Supabase 미설정(로컬 개발)에선 출결 데이터가 없으므로 비활성 응답 — 위젯이 안내 상태를 띄움
  if (activeBackend() !== 'supabase') {
    return NextResponse.json({ success: true, configured: false });
  }

  try {
    const { todayStr, weekStart } = getPeriodBounds();
    const [students, openSessions, todaySessions, weekMinutesByStudent] = await Promise.all([
      getStudentsSummary(),
      getOpenSessions(),
      getSessionsByDate(todayStr),
      getStudyMinutesByStudent(weekStart),
    ]);

    const studentMap = new Map(students.map((s) => [s.id, s]));
    const openIds = new Set(
      openSessions
        .filter((s) => s.date === todayStr)
        .map((s) => s.student_id)
    );
    const nowMs = Date.now();

    const todayByStudent = new Map<string, typeof todaySessions>();
    for (const s of todaySessions) {
      if (!studentMap.has(s.student_id)) continue;
      const arr = todayByStudent.get(s.student_id) || [];
      arr.push(s);
      todayByStudent.set(s.student_id, arr);
    }

    // 현재 등원 중 (미퇴실 세션 보유, 오늘 날짜인 경우만 등원 중으로 판정)
    const present = openSessions
      .filter((s) => studentMap.has(s.student_id) && s.date === todayStr)
      .map((s) => {
        const stu = studentMap.get(s.student_id)!;
        const completedMinutes = (todayByStudent.get(stu.id) || [])
          .filter((session) => session.check_out)
          .reduce((sum, session) => sum + (session.minutes || 0), 0);
        const minutesSoFar = Math.max(0, Math.round((nowMs - new Date(s.check_in).getTime()) / 60000));
        return {
          id: stu.id,
          name: stu.name,
          campus: stu.campus,
          checkInAt: seoulHm(s.check_in),
          minutesSoFar,
          todayMinutes: completedMinutes + minutesSoFar,
          weekMinutes: weekMinutesByStudent[stu.id] || 0,
        };
      });

    // 오늘 하원 완료 — 학생 단위로 묶음 (한 학생이 여러 번 등하원해도 1회만, 순공은 합산)
    const leftToday = Array.from(todayByStudent.entries())
      .filter(([sid, arr]) => !openIds.has(sid) && arr.some((s) => s.check_out))
      .map(([sid, arr]) => {
        const stu = studentMap.get(sid)!;
        const closed = arr.filter((s) => s.check_out);
        const firstIn = arr.reduce((min, s) => (s.check_in < min ? s.check_in : min), arr[0].check_in);
        const lastClosed = closed.reduce((max, s) => (s.check_out! > max.check_out! ? s : max), closed[0]);
        const lastOut = lastClosed.check_out!;
        const recognizedMinutes = closed
          .map((s) => s.minutes)
          .filter((minutes): minutes is number => typeof minutes === 'number');
        const todayMinutes = recognizedMinutes.length
          ? recognizedMinutes.reduce((a, minutes) => a + minutes, 0)
          : null;
        const autoClosed = lastClosed.source === 'auto-sweep' && lastClosed.minutes == null;
        return {
          id: stu.id,
          name: stu.name,
          campus: stu.campus,
          checkInAt: seoulHm(firstIn),
          checkOutAt: autoClosed ? null : seoulHm(lastOut),
          minutes: todayMinutes,
          autoClosed,
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

    // 캠퍼스 관리자는 본인 캠퍼스 학생만 조회 가능 (슈퍼는 전원)
    const inCampus = <T extends { campus: string }>(arr: T[]) =>
      session.campus === 'all' ? arr : arr.filter((r) => r.campus === session.campus);
    const visiblePresent = inCampus(present);
    const visibleLeftToday = inCampus(leftToday);
    const visibleAbsent = inCampus(absent);
    const visibleStudents = session.campus === 'all'
      ? students
      : students.filter((s) => s.campus === session.campus);
    const visibleIds = new Set(visibleStudents.map((s) => s.id));
    const visibleWeekMinutes = session.campus === 'all'
      ? weekMinutesByStudent
      : Object.fromEntries(Object.entries(weekMinutesByStudent).filter(([sid]) => visibleIds.has(sid)));

    return NextResponse.json({
      success: true,
      configured: true,
      today: todayStr,
      summary: {
        total: visibleStudents.length,
        present: visiblePresent.length,
        leftToday: visibleLeftToday.length,
        absent: visibleAbsent.length,
      },
      present: visiblePresent,
      leftToday: visibleLeftToday,
      absent: visibleAbsent,
      weekMinutesByStudent: visibleWeekMinutes,
    });
  } catch (e: any) {
    console.error('attendance/today error:', e);
    return NextResponse.json(
      { success: false, message: e?.message || '출결 현황 조회에 실패했습니다.' },
      { status: 500 }
    );
  }
}
