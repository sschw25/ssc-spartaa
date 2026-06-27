import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { settleMissions, type SettleOptions } from '@/lib/mission-engine';

// 쿠폰 미션 정산 — 활성 미션 조건을 평가하고 쿠폰을 지급(멱등).
// 관리자 '지금 정산' 버튼(POST) 또는 Vercel/외부 크론(GET, Authorization: Bearer CRON_SECRET).
// 쿼리: ?scope=all|weekly|monthly, ?prev=1 (월간 미션을 지난 달 기준으로 평가)
function isCronRequest(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const headerSecret = request.headers.get('x-cron-secret');
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return headerSecret === cronSecret || bearer === cronSecret;
}

function parseOptions(request: Request): SettleOptions {
  const sp = new URL(request.url).searchParams;
  const scopeRaw = sp.get('scope');
  const scope = scopeRaw === 'weekly' || scopeRaw === 'monthly' ? scopeRaw : 'all';
  const monthOffset = sp.get('prev') === '1' ? -1 : 0;
  return { scope, monthOffset };
}

async function handle(request: Request) {
  if (!isCronRequest(request) && !(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  try {
    const result = await settleMissions(parseOptions(request));
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '정산 실패' },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
