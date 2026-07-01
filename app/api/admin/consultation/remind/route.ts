import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { runConsultationReminders } from '@/lib/consultation-reminders';

// 상담 D-1 리마인더. 실행 로직은 lib/consultation-reminders(runConsultationReminders)에 있고,
// 예약 스케줄러 디스패처(/api/admin/cron/tick)와 이 라우트가 공유한다.
function isCronRequest(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const headerSecret = request.headers.get('x-cron-secret');
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return !!cronSecret && (headerSecret === cronSecret || bearer === cronSecret);
}

export async function GET(request: Request) {
  // 크론 시크릿 또는 관리자 세션 허용
  if (!isCronRequest(request)) {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ success: false, message: 'unauthorized' }, { status: 401 });
    }
  }
  const result = await runConsultationReminders();
  return NextResponse.json({ success: true, ...result });
}
