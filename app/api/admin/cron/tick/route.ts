import { NextResponse } from 'next/server';
import { getAppSetting, setAppSetting } from '@/lib/store';
import {
  SCHEDULED_JOBS, normalizeJobConfig, dueOccurrenceKey, kstStamp,
} from '@/lib/scheduled-jobs';
import { JOB_RUNNERS } from '@/lib/scheduled-jobs-runners';

// 예약 스케줄러 디스패처.
// GitHub Actions 가 15분마다 이 엔드포인트를 두드리면(틱), 관리자 설정(scheduled_jobs)과
// 현재 KST 시각을 비교해 "실행 시각에 도달 + 이번 주기 미실행"인 작업만 실행한다.
// 멱등: 작업별 마지막 실행 주기키를 scheduled_jobs_runs 에 기록(하루/한주/한달 1회).
//  - 각 작업 자체도 멱등(rewards_log·마감시각·알림중복 방지)이라 이중 실행돼도 무해.
//  - 워크플로 concurrency group 으로 틱 중첩도 방지됨.
// ?force=<jobId> : 스케줄/주기 무시하고 특정 작업 즉시 실행(테스트용, 주기키 기록 안 함).
const CONFIG_KEY = 'scheduled_jobs';
const RUNS_KEY = 'scheduled_jobs_runs';

function isCronRequest(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const headerSecret = request.headers.get('x-cron-secret');
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return !!cronSecret && (headerSecret === cronSecret || bearer === cronSecret);
}

interface RanEntry { id: string; occurrence: string | null; forced: boolean; result?: unknown; error?: string }

async function dispatch(now: Date, force?: string) {
  const [rawCfg, rawRuns] = await Promise.all([getAppSetting(CONFIG_KEY), getAppSetting(RUNS_KEY)]);
  const cfg = normalizeJobConfig(rawCfg);
  const runs: Record<string, string> = (rawRuns && typeof rawRuns === 'object') ? { ...(rawRuns as Record<string, string>) } : {};
  const ran: RanEntry[] = [];
  let runsChanged = false;

  for (const meta of SCHEDULED_JOBS) {
    const sched = cfg[meta.id];
    const occurrence = dueOccurrenceKey(meta, sched, now); // 최근 발생분 키 (비활성이면 null)
    const forced = force === meta.id;
    // 정상: 발생분이 있고 아직 그 발생분을 안 돌렸을 때. 강제: 스케줄 무시하고 실행.
    const due = forced || (occurrence !== null && runs[meta.id] !== occurrence);
    if (!due) continue;
    const runner = JOB_RUNNERS[meta.id];
    if (!runner) continue;
    try {
      const result = await runner({ occurrence, forced, now });
      // 강제 실행은 발생분 키를 소모하지 않는다(테스트가 정상 스케줄을 건너뛰지 않도록).
      if (!forced && occurrence !== null) { runs[meta.id] = occurrence; runsChanged = true; }
      ran.push({ id: meta.id, occurrence, forced, result });
    } catch (e) {
      // 실패 시 발생분 키를 기록하지 않아 다음 틱에 재시도된다(자가복구).
      ran.push({ id: meta.id, occurrence, forced, error: e instanceof Error ? e.message : 'failed' });
    }
  }

  if (runsChanged) await setAppSetting(RUNS_KEY, runs);
  return { at: now.toISOString(), kst: kstStamp(now), ranCount: ran.length, ran };
}

export async function GET(request: Request) {
  if (!isCronRequest(request)) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  const force = new URL(request.url).searchParams.get('force')?.trim() || undefined;
  try {
    const out = await dispatch(new Date(), force);
    return NextResponse.json({ success: true, ...out });
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : 'tick 실패' },
      { status: 500 },
    );
  }
}
