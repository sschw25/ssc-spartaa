import { activeBackend, getOpenSessions, autoCloseSession } from '@/lib/store';

// 유휴(미퇴실) 세션 자동 마감의 순수 실행 로직 (라우트/스케줄러 디스패처 공용).
// 하원 스캔을 깜빡해 며칠씩 열린 세션이 순공을 부풀리거나 '등원 중'으로 오표시되는 것을 막는다.
// 마감 시각(ATTEND_CLOSE_TIME, KST) 기준으로 정리하고, 하원 시각만 남기고 minutes=null 로 둔다.
const DEFAULT_CLOSE_TIME = '23:59';
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function getAttendCloseTime(): string {
  const closeHm = (process.env.ATTEND_CLOSE_TIME || DEFAULT_CLOSE_TIME).trim();
  return HM.test(closeHm) ? closeHm : DEFAULT_CLOSE_TIME;
}

export interface SweepResult {
  configured: boolean;
  scannedOpen: number;
  closed: number;
  closeTime: string;
  minutesCounted: false;
}

export async function runAttendanceSweep(now: Date = new Date()): Promise<SweepResult> {
  const closeTime = getAttendCloseTime();
  if (activeBackend() !== 'supabase') {
    return { configured: false, scannedOpen: 0, closed: 0, closeTime, minutesCounted: false };
  }
  const openSessions = await getOpenSessions();
  let closed = 0;
  for (const s of openSessions) {
    // 세션의 등원 날짜(KST) 마감 시각을 UTC 시점으로 환산 (KST=UTC+9, DST 없음)
    const closeAt = new Date(`${s.date}T${closeTime}:00+09:00`);
    // 마감 시각이 이미 지난 세션만 정리 (오늘 진행 중인 학생은 건드리지 않음)
    if (now.getTime() >= closeAt.getTime()) {
      await autoCloseSession(s, closeAt);
      closed += 1;
    }
  }
  return { configured: true, scannedOpen: openSessions.length, closed, closeTime, minutesCounted: false };
}
