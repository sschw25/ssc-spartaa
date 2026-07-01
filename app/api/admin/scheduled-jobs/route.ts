import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { getAppSetting, mergeAppSettingObject } from '@/lib/store';
import { SCHEDULED_JOBS, normalizeJobConfig, normalizeSchedule, type JobSchedule } from '@/lib/scheduled-jobs';

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
  const raw = (body?.config && typeof body.config === 'object') ? (body.config as Record<string, unknown>) : null;
  if (!raw) {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }
  // 요청에 포함된(=화면에 표시돼 편집된) 잡만 정규화해 부분 병합 — 미포함 잡은 서버 보관값을 유지한다.
  // 임베드 패널(일부 잡만 표시)이 저장해도 다른 화면/관리자가 바꾼 나머지 잡 설정을 되돌리지 않는다.
  const patch: Record<string, JobSchedule> = {};
  for (const meta of SCHEDULED_JOBS) {
    if (meta.id in raw) patch[meta.id] = normalizeSchedule(meta, raw[meta.id]);
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ success: false, message: '저장할 예약 설정이 없습니다.' }, { status: 400 });
  }
  const merged = await mergeAppSettingObject(CONFIG_KEY, patch);
  return NextResponse.json({ success: true, config: normalizeJobConfig(merged) });
}
