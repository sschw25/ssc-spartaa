import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { runDailyDigest } from '@/lib/daily-digest-run';

// 일일 브리핑(스마트화 Wave1 #2+#3) 생성 크론. 매일 아침 KST 1회 실행 권장.
// 상시 스케줄은 관리자 예약 스케줄러(daily_digest 잡, /admin/cron/tick)로 돌아가며,
// 이 라우트는 외부 크론/수동 재생성용 진입점이다(계산 로직은 lib/daily-digest-run 공유).
// 호출 인증: 관리자 세션 OR (x-cron-secret/Authorization Bearer == CRON_SECRET) —
// app/api/admin/attendance/sweep/route.ts, app/api/admin/consultation/remind/route.ts와 동일 패턴.
function isCronRequest(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const headerSecret = request.headers.get('x-cron-secret');
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return !!cronSecret && (headerSecret === cronSecret || bearer === cronSecret);
}

async function handleGenerate() {
  try {
    const { skipped, generatedDate } = await runDailyDigest();
    return NextResponse.json({ success: true, skipped, generatedDate });
  } catch (e: any) {
    console.error('cron/daily-digest error:', e);
    return NextResponse.json(
      { success: false, message: e?.message || '브리핑 생성에 실패했습니다.' },
      { status: 500 },
    );
  }
}

// GET 은 외부 크론 전용(CRON_SECRET 필수).
export async function GET(request: Request) {
  if (!isCronRequest(request)) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  return handleGenerate();
}

// POST 는 관리자 세션 또는 크론(수동 재생성 트리거용).
export async function POST(request: Request) {
  if (!isCronRequest(request) && !(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  return handleGenerate();
}
