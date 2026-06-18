import { NextResponse } from 'next/server';
import { getStudentSessionId, isAdmin } from '@/lib/auth';
import { activeBackend, getStudents, getStudyMinutesByStudent, getOpenSessions } from '@/lib/store';
import { getPeriodBounds, buildLeaderboard, type Leaderboard } from '@/lib/study-stats';

const TOP_N = 10;

// 학생에게는 전체 인원/절대 등수를 노출하지 않음.
// 상위 10명 + "내가 10위까지 얼마나 더 채우면 되는지"만 제공 (동기부여, 프라이버시).
function toStudentBoard(board: Leaderboard) {
  const top = board.top.slice(0, TOP_N);
  const meInTop = top.find((e) => e.isMe) || null;
  const myMinutes = board.my?.minutes ?? 0;
  // 10위(마지막 노출) 순공 — 진입 기준선
  const threshold = top.length ? top[top.length - 1].minutes : 0;
  const inTop = !!meInTop;
  return {
    top,
    me: {
      inTop,
      rank: inTop ? meInTop!.rank : null, // 10위 밖이면 등수 비노출 (총원 추정 방지)
      myMinutes,
      hasRecord: myMinutes > 0,
      // 10위 진입까지 더 필요한 순공(분). 자리가 10개 미만이면 0(빈 자리 존재).
      minutesToEnterTop: inTop || top.length < TOP_N ? 0 : Math.max(0, threshold - myMinutes),
    },
  };
}

// 순공 랭킹 (열품타식 동기부여). 로그인 학생 본인 또는 관리자만.
// 이름 마스킹 + 총원/절대등수 비노출. 'liveCount'는 지금 등원 중 인원.
export async function GET() {
  const sid = await getStudentSessionId();
  const admin = await isAdmin();
  if (!sid && !admin) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
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

    const roster = students.map((s) => ({ id: s.id, name: s.name, campus: s.campus }));
    const week = toStudentBoard(buildLeaderboard(weekMin, roster, sid || '', TOP_N));
    const day = toStudentBoard(buildLeaderboard(dayMin, roster, sid || '', TOP_N));

    return NextResponse.json({
      success: true,
      configured: true,
      weekStart,
      today: todayStr,
      week,
      day,
      liveCount: openSessions.length,
    });
  } catch (e: any) {
    console.error('leaderboard error:', e);
    return NextResponse.json({ success: false, message: e?.message || '랭킹 조회 실패' }, { status: 500 });
  }
}
