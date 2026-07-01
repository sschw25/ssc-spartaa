import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { getStudents, getSeatAbsenceMarks, getAttendedDays, getAppSetting, setAppSetting } from '@/lib/store';
import { buildDailyDigest, type DailyDigestResult } from '@/lib/daily-digest';
import { DEFAULT_HEALTH_WEIGHTS, type HealthWeights } from '@/lib/health-score';

// 일일 브리핑(스마트화 Wave1 #2+#3) 생성 크론. 매일 자정 이후 KST 1회 실행 권장(Vercel Cron).
// 호출 인증: 관리자 세션 OR (x-cron-secret/Authorization Bearer == CRON_SECRET) —
// app/api/admin/attendance/sweep/route.ts, app/api/admin/consultation/remind/route.ts와 동일 패턴.
const HEALTH_WEIGHTS_KEY = 'health_score_weights';
const DAILY_DIGEST_KEY = 'daily_digest';
// 연속결석/이탈급증 트리거 계산에 필요한 최소 lookback + 여유(넉넉히 60일)
const WINDOW_DAYS = 60;

function isCronRequest(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const headerSecret = request.headers.get('x-cron-secret');
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return !!cronSecret && (headerSecret === cronSecret || bearer === cronSecret);
}

function kstToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

async function handleGenerate() {
  try {
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
      return NextResponse.json({ success: true, skipped: true, generatedDate: digest.generatedDate });
    }

    await setAppSetting(DAILY_DIGEST_KEY, digest);
    return NextResponse.json({ success: true, skipped: false, generatedDate: digest.generatedDate });
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
