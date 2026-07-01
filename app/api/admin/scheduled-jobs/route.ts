import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { getAppSetting, setAppSetting } from '@/lib/store';
import { SCHEDULED_JOBS, normalizeJobConfig } from '@/lib/scheduled-jobs';

// 관리자: 예약 스케줄 설정 조회/저장.
// 스케줄은 센터 구분이 없는 전역 인프라 설정이라 일반 관리자 세션(isAdmin)으로 접근한다.
const CONFIG_KEY = 'scheduled_jobs';
const RUNS_KEY = 'scheduled_jobs_runs';

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  const [rawCfg, rawRuns] = await Promise.all([getAppSetting(CONFIG_KEY), getAppSetting(RUNS_KEY)]);
  return NextResponse.json({
    success: true,
    jobs: SCHEDULED_JOBS,
    config: normalizeJobConfig(rawCfg),
    runs: (rawRuns && typeof rawRuns === 'object') ? rawRuns : {},
  });
}

export async function PUT(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  let body: { config?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }
  const config = normalizeJobConfig(body?.config);
  await setAppSetting(CONFIG_KEY, config);
  return NextResponse.json({ success: true, config });
}
