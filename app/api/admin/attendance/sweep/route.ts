import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { runAttendanceSweep } from '@/lib/attendance-sweep';

// 유휴(미퇴실) 세션 자동 마감 sweep.
// 실행 로직은 lib/attendance-sweep(runAttendanceSweep)에 있고, 예약 스케줄러 디스패처
// (/api/admin/cron/tick)와 이 라우트가 공유한다.
// 호출 인증: 관리자 세션 OR (x-cron-secret/Authorization Bearer == CRON_SECRET).
function isCronRequest(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const headerSecret = request.headers.get('x-cron-secret');
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return !!cronSecret && (headerSecret === cronSecret || bearer === cronSecret);
}

async function handleSweep() {
  try {
    const result = await runAttendanceSweep();
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    console.error('attendance/sweep error:', e);
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '세션 정리에 실패했습니다.' },
      { status: 500 },
    );
  }
}

// GET 은 외부 크론 전용(CRON_SECRET 필수). 세션 정리가 일반 관리자 세션의 단순 GET으로 실행되지 못하게 막는다.
export async function GET(request: Request) {
  if (!isCronRequest(request)) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  return handleSweep();
}

// POST 는 관리자 세션 또는 크론.
export async function POST(request: Request) {
  if (!isCronRequest(request) && !(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  return handleSweep();
}
