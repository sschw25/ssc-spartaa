// 서버 전용 — 예약 작업 id → 실제 실행 함수 매핑.
// 각 러너는 기존 크론 엔드포인트가 쓰던 것과 동일한 내부 로직을 호출한다(중복 구현 없음).
import { runAttendanceSweep } from '@/lib/attendance-sweep';
import { runConsultationReminders } from '@/lib/consultation-reminders';
import { runDueMealRoutineTemplates } from '@/lib/meal-routines';
import { settleMissions } from '@/lib/mission-engine';
import { runDailyDigest } from '@/lib/daily-digest-run';

export const JOB_RUNNERS: Record<string, () => Promise<unknown>> = {
  sweep: () => runAttendanceSweep(),
  meal: () => runDueMealRoutineTemplates(),
  // 주간 미션만 평가(이번 주 기준).
  weekly_settle: () => settleMissions({ scope: 'weekly' }),
  // 월간 미션은 항상 '지난달' 전체(이미 종료)를 평가 — 실행일 무관하게 정합적.
  monthly_settle: () => settleMissions({ scope: 'monthly', monthOffset: -1 }),
  remind: () => runConsultationReminders(),
  // 일일 브리핑(어제 기준) 생성·저장. 자체 멱등(같은 날짜 재작성 skip).
  daily_digest: () => runDailyDigest(),
};
