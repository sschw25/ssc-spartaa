import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { activeBackend, getOpenSessions, autoCloseSession } from '@/lib/store';

// 유휴(미퇴실) 세션 자동 마감 sweep.
// 학생이 하원 스캔을 깜빡한 세션이 며칠씩 열린 채로 남아 순공이 부풀거나
// '등원 중'으로 잘못 표시되는 것을 방지. 마감 시각(ATTEND_CLOSE_TIME, KST) 기준으로 정리.
// 자동 마감은 하원 시각만 남기고 minutes=null 로 둔다. 관리자 수동 입력 전까지 순공으로 인정하지 않는다.
//
// 호출 인증: 관리자 세션 OR (x-cron-secret/Authorization Bearer == CRON_SECRET).
// Vercel Cron: 매일 23:59 KST(UTC 14:59)에 GET 호출하도록 구성.
const DEFAULT_CLOSE_TIME = '23:59';
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

function getCloseTime(): string {
  const closeHm = (process.env.ATTEND_CLOSE_TIME || DEFAULT_CLOSE_TIME).trim();
  return HM.test(closeHm) ? closeHm : DEFAULT_CLOSE_TIME;
}

function isCronRequest(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const headerSecret = request.headers.get('x-cron-secret');
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return !!cronSecret && (headerSecret === cronSecret || bearer === cronSecret);
}

async function handleSweep(request: Request) {
  if (!isCronRequest(request) && !(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  if (activeBackend() !== 'supabase') {
    return NextResponse.json({ success: true, configured: false, closed: 0, scannedOpen: 0 });
  }

  try {
    // 마감 시각 (KST). 형식 HH:MM, 기본 23:59
    const safeHm = getCloseTime();
    const now = new Date();
    const openSessions = await getOpenSessions();
    let closed = 0;

    for (const s of openSessions) {
      // 세션의 등원 날짜(KST) 마감 시각을 UTC 시점으로 환산 (KST=UTC+9, DST 없음)
      const closeAt = new Date(`${s.date}T${safeHm}:00+09:00`);
      // 마감 시각이 이미 지난 세션만 정리 (오늘 진행 중인 학생은 건드리지 않음)
      if (now.getTime() >= closeAt.getTime()) {
        await autoCloseSession(s, closeAt);
        closed += 1;
      }
    }

    return NextResponse.json({
      success: true,
      configured: true,
      scannedOpen: openSessions.length,
      closed,
      closeTime: safeHm,
      minutesCounted: false,
    });
  } catch (e: any) {
    console.error('attendance/sweep error:', e);
    return NextResponse.json(
      { success: false, message: e?.message || '세션 정리에 실패했습니다.' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return handleSweep(request);
}

export async function POST(request: Request) {
  return handleSweep(request);
}
