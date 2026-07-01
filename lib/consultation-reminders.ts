import { getConsultationBookingsForCampuses, createConsultationReminderAlert } from '@/lib/store';

// 상담 D-1 리마인더의 순수 실행 로직 (라우트/스케줄러 디스패처 공용).
// 내일(KST) 예정된 정규 상담 예약자에게 리마인더 알림을 생성한다(멱등 — 이미 생성됐으면 false).
const ALL_CAMPUSES = ['wonju', 'chuncheon', 'chungju'];

// 내일(KST) 날짜 YYYY-MM-DD
export function tomorrowKst(now: Date = new Date()): string {
  const kstNow = new Date(now.getTime() + 9 * 3600 * 1000);
  kstNow.setUTCDate(kstNow.getUTCDate() + 1);
  return kstNow.toISOString().slice(0, 10);
}

export interface ReminderResult {
  created: number;
  target: string;
}

export async function runConsultationReminders(now: Date = new Date()): Promise<ReminderResult> {
  const target = tomorrowKst(now);
  const all = await getConsultationBookingsForCampuses(ALL_CAMPUSES);
  const due = all.filter((b) => b.status === 'booked' && b.kind === 'regular' && b.date === target);
  let created = 0;
  for (const b of due) {
    if (await createConsultationReminderAlert(b)) created++;
  }
  return { created, target };
}
