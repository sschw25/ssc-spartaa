import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { getConsultationBookingsForCampuses, createConsultationReminderAlert } from '@/lib/store';

function isCronRequest(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const headerSecret = request.headers.get('x-cron-secret');
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return !!cronSecret && (headerSecret === cronSecret || bearer === cronSecret);
}

// 내일(KST) 날짜 YYYY-MM-DD
function tomorrowKst(): string {
  const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
  kstNow.setUTCDate(kstNow.getUTCDate() + 1);
  return kstNow.toISOString().slice(0, 10);
}

const ALL_CAMPUSES = ['wonju', 'chuncheon', 'chungju'];

export async function GET(request: Request) {
  // 크론 시크릿 또는 관리자 세션 허용
  if (!isCronRequest(request)) {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ success: false, message: 'unauthorized' }, { status: 401 });
    }
  }

  const target = tomorrowKst();
  const all = await getConsultationBookingsForCampuses(ALL_CAMPUSES);
  const due = all.filter((b) => b.status === 'booked' && b.kind === 'regular' && b.date === target);

  let created = 0;
  for (const b of due) {
    if (await createConsultationReminderAlert(b)) created++;
  }
  return NextResponse.json({ success: true, created, target });
}
