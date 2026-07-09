import { NextResponse } from 'next/server';
import { getStudentSessionId, isAdmin, canViewStudent } from '@/lib/auth';
import { activeBackend, getStudents, getStudyMinutesByStudent, getOpenSessions } from '@/lib/store';
import { getPeriodBounds, buildMyStanding, focusMinutesByStudent } from '@/lib/study-stats';

// 내 순공 위치(동기부여) — 타인 명단 없이 본인 중심, 총원/절대등수(10위 밖) 비노출.
// studentId(리포트 주인공) 지정 시 canViewStudent 로 본인/관리자만 허용.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const studentId = url.searchParams.get('studentId') || '';

  let meId = '';
  if (studentId) {
    if (!(await canViewStudent(studentId))) {
      return NextResponse.json({ success: false, message: '열람 권한이 없습니다.' }, { status: 401 });
    }
    meId = studentId;
  } else {
    const sid = await getStudentSessionId();
    if (!sid && !(await isAdmin())) {
      return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
    }
    meId = sid || '';
  }

  if (activeBackend() !== 'supabase') {
    return NextResponse.json({ success: true, configured: false });
  }

  try {
    const { weekStart, todayStr } = getPeriodBounds();
    const [students, weekAtt, dayAtt, openSessions] = await Promise.all([
      getStudents(),
      getStudyMinutesByStudent(weekStart),
      getStudyMinutesByStudent(todayStr),
      getOpenSessions(),
    ]);
    const roster = students.map((s) => ({ id: s.id }));

    // 순위는 '집중(순공 타이머)' 기준 — 재석(출결) 상한으로 클램프. 재석은 참고로 병기.
    const dayFocus = focusMinutesByStudent(students, todayStr, todayStr, dayAtt);
    const weekFocus = focusMinutesByStudent(students, weekStart, todayStr, weekAtt);

    // 오늘 원생 평균 순공(집중 기록이 있는 학생 기준) — '평균보다 앞/뒤' 멘트용
    const dayValues = Object.values(dayFocus);
    const peerCountDay = dayValues.length;
    const peerAvgDay = peerCountDay > 0 ? Math.round(dayValues.reduce((a, b) => a + b, 0) / peerCountDay) : 0;

    return NextResponse.json({
      success: true,
      configured: true,
      weekStart,
      today: todayStr,
      week: buildMyStanding(weekFocus, roster, meId),
      day: buildMyStanding(dayFocus, roster, meId),
      // 재석(출결) 시간 — 랭킹과 별개로 화면에 병기
      attendance: { week: weekAtt[meId] || 0, day: dayAtt[meId] || 0 },
      peerAvgDay,
      peerCountDay,
      liveCount: openSessions.length,
    });
  } catch (e: any) {
    console.error('leaderboard error:', e);
    return NextResponse.json({ success: false, message: e?.message || '랭킹 조회 실패' }, { status: 500 });
  }
}
