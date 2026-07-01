// 서버 전용 — 일일 브리핑 생성/저장 로직. cron 라우트와 예약 스케줄러 러너가 공유(중복 없음).
// app/api/cron/daily-digest/route.ts, lib/scheduled-jobs-runners.ts 가 이 함수를 호출한다.
import { getStudents, getSeatAbsenceMarks, getAttendedDays, getAppSetting, setAppSetting } from '@/lib/store';
import { buildDailyDigest, type DailyDigestResult } from '@/lib/daily-digest';
import { DEFAULT_HEALTH_WEIGHTS, type HealthWeights } from '@/lib/health-score';

const HEALTH_WEIGHTS_KEY = 'health_score_weights';
const DAILY_DIGEST_KEY = 'daily_digest';
// 연속결석/이탈급증 트리거 계산에 필요한 최소 lookback + 여유(넉넉히 60일)
const WINDOW_DAYS = 60;

function kstToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

export interface RunDailyDigestResult {
  skipped: boolean;      // 같은 날짜 브리핑이 이미 저장돼 있어 재작성을 건너뛴 경우 true(멱등)
  generatedDate: string; // 브리핑이 커버하는 날짜(어제, Seoul YYYY-MM-DD)
}

// 어제 기준 브리핑을 계산해 app_settings(daily_digest)에 저장. 하루 중복 실행은 멱등 skip.
export async function runDailyDigest(): Promise<RunDailyDigestResult> {
  const to = kstToday();
  const fromDate = new Date(`${to}T00:00:00+09:00`);
  fromDate.setDate(fromDate.getDate() - (WINDOW_DAYS - 1));
  const from = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(fromDate);

  const [marks, attended, students, rawWeights, previousDigest] = await Promise.all([
    getSeatAbsenceMarks(from, to),
    getAttendedDays(from, to),
    getStudents(),
    getAppSetting(HEALTH_WEIGHTS_KEY),
    getAppSetting(DAILY_DIGEST_KEY) as Promise<DailyDigestResult | null>,
  ]);

  const weights: HealthWeights = { ...DEFAULT_HEALTH_WEIGHTS, ...(rawWeights || {}) };

  // 어제 브리핑의 위험밴드 학생 id 집합 → 오늘 위험밴드의 isNew(신규 진입) 판정에 사용
  const previousRiskStudentIds = new Set<string>();
  if (previousDigest?.campuses) {
    for (const campus of Object.values(previousDigest.campuses)) {
      for (const entry of campus.riskBand) previousRiskStudentIds.add(entry.studentId);
    }
  }

  const digest = buildDailyDigest(students, marks, attended, { weights, previousRiskStudentIds });

  // 멱등성: 이미 같은 날짜(어제 기준) 브리핑이 저장돼 있으면 재작성하지 않음(하루 중복 실행 방지)
  if (previousDigest?.generatedDate === digest.generatedDate) {
    return { skipped: true, generatedDate: digest.generatedDate };
  }

  await setAppSetting(DAILY_DIGEST_KEY, digest);
  return { skipped: false, generatedDate: digest.generatedDate };
}
