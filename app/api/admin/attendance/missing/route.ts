import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { activeBackend, getStudentsSummary, getSessionsByDate } from '@/lib/store';
import { arrivalDeadlineMin, normalizeArrival } from '@/lib/attendance-time';

// 단계별 미등원(노쇼) 조회 — 등원 마감 시각이 지났는데 당일 등원 기록이 없는 학생.
//
// 운영 의도(단계별 알림):
//  · 08:20 체크포인트 → 08:20까지 와야 하는데 안 온 학생
//  · 09:00 체크포인트 → 09:00까지 와야 하는데 안 온 학생
//  · 그 이후 수동 시각(예: 09:40) → 해당 시각마다 안 온 학생
// 외부 스케줄러(크론)가 각 시각에 이 엔드포인트를 호출해 dueNow 목록을 알림으로 발송하면 된다.
// (08:20·09:00은 수기 체크가 있으나, 그 이후 수동 시각은 교시 쉬는시간에만 확인되므로 별도 알림이 필요.)
//
// 호출 인증: 관리자 세션 OR (x-cron-secret/Authorization Bearer == CRON_SECRET).
// 파라미터: ?at=HH:MM 으로 체크포인트 시각 강제(크론/테스트용). 없으면 현재 KST 시각.

function isCronRequest(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const headerSecret = request.headers.get('x-cron-secret');
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return !!cronSecret && (headerSecret === cronSecret || bearer === cronSecret);
}

function kstNow(): { date: string; min: number } {
  const now = new Date();
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(now);
  const hm = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(now);
  const [h, m] = hm.split(':').map(Number);
  return { date, min: h * 60 + m };
}

export async function GET(request: Request) {
  if (!isCronRequest(request) && !(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  if (activeBackend() !== 'supabase') {
    return NextResponse.json({ success: true, configured: false, rows: [], dueNow: [] });
  }

  try {
    const { date, min: liveMin } = kstNow();
    const url = new URL(request.url);
    const atParam = url.searchParams.get('at');
    const checkpointMin = atParam ? arrivalDeadlineMin(atParam) : liveMin;

    const [students, sessions] = await Promise.all([
      getStudentsSummary(),
      getSessionsByDate(date),
    ]);

    const checkedInIds = new Set(sessions.map((s) => s.student_id));

    // 마감이 지났는데 미등원인 학생
    const overdue = students
      .filter((stu) => {
        if (checkedInIds.has(stu.id)) return false;
        // 등록 만료/기타 캠퍼스는 제외
        if (stu.campus === 'etc') return false;
        const deadline = arrivalDeadlineMin(stu.expectedArrival);
        return deadline <= checkpointMin;
      })
      .map((stu) => ({
        id: stu.id,
        name: stu.name,
        campus: stu.campus,
        expectedArrival: normalizeArrival(stu.expectedArrival),
        deadlineMin: arrivalDeadlineMin(stu.expectedArrival),
      }))
      .sort((a, b) => a.deadlineMin - b.deadlineMin || a.name.localeCompare(b.name, 'ko'));

    // 이번 체크포인트에 새로 마감을 넘긴 학생(=정확히 이 시각 알림 대상)
    const dueNow = overdue.filter((r) => r.deadlineMin === checkpointMin);

    return NextResponse.json({
      success: true,
      configured: true,
      date,
      checkpoint: `${String(Math.floor(checkpointMin / 60)).padStart(2, '0')}:${String(checkpointMin % 60).padStart(2, '0')}`,
      total: overdue.length,
      rows: overdue,
      dueNow,
    });
  } catch (e: any) {
    console.error('attendance/missing error:', e);
    return NextResponse.json({ success: false, message: e?.message || '미등원 조회 실패' }, { status: 500 });
  }
}
