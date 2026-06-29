import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { runDueMealRoutineTemplates } from '@/lib/meal-routines';

function isCronRequest(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const headerSecret = request.headers.get('x-cron-secret');
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return !!cronSecret && (headerSecret === cronSecret || bearer === cronSecret);
}

async function handle(request: Request) {
  if (!isCronRequest(request) && !(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  try {
    const results = await runDueMealRoutineTemplates();
    return NextResponse.json({
      success: true,
      created: results.filter((result) => result.created).length,
      notified: results.filter((result) => result.notified).length,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : '반복 템플릿 실행 실패' },
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

