import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { runDueMealRoutineTemplates } from '@/lib/meal-routines';

function isCronRequest(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const headerSecret = request.headers.get('x-cron-secret');
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return !!cronSecret && (headerSecret === cronSecret || bearer === cronSecret);
}

async function handle() {
  try {
    const results = await runDueMealRoutineTemplates();
    const notDue = results.filter((result) => result.skippedReason === 'not_due');
    return NextResponse.json({
      success: true,
      created: results.filter((result) => result.created).length,
      notified: results.filter((result) => result.notified).length,
      // 생성 시각(createDay/createTime)이 아직 안 돼 건너뛴 템플릿 수 + 다음 예정 라벨("월 14:00")
      skippedNotDue: notDue.length,
      nextDue: Array.from(new Set(notDue.map((result) => result.nextDueLabel).filter(Boolean))),
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : '반복 템플릿 실행 실패' },
      { status: 500 },
    );
  }
}

// GET 은 외부 크론 전용(CRON_SECRET 필수). 도시락 일괄 생성이 일반 관리자 세션의 단순 GET으로 실행되지 못하게 막는다.
export async function GET(request: Request) {
  if (!isCronRequest(request)) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  return handle();
}

// POST 는 관리자 '반복 실행' 버튼 또는 크론.
export async function POST(request: Request) {
  if (!isCronRequest(request) && !(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  return handle();
}

