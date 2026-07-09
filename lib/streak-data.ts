// 서버 전용 — 스트릭 계산 입력(등원일·정당사유일·스킵일) 로더.
// 미션 허브 GET(app/api/student/missions-hub)과 스트릭 잇기 POST(app/api/student/streak-repair)가
// 동일한 판정 데이터를 쓰도록 공유한다(한쪽만 바뀌어 잇기 가능/불가 판정이 어긋나는 것 방지).
import { getStudySessions, getStudentSeatAbsenceMarks, activeBackend } from '@/lib/store';
import { getSeoulDateKey } from '@/lib/student-activity';
import { parseSeatPeriodKey, OPERATING_PERIODS } from '@/lib/absence-stats';
import type { Student } from '@/lib/types/student';

// 조회창: 일요일(휴무일) 제외 시 ~340일 스트릭까지 커버 — 1년 이상 재원하는 개근생 대비.
export const STREAK_WINDOW_DAYS = 400;
// 쿠폰 "스트릭 잇기" 비용(쿠폰 개수)과 복구 가능 기간(결손일이 오늘로부터 며칠 이내인지)
export const STREAK_REPAIR_COST = 10;
export const STREAK_REPAIR_WINDOW_DAYS = 7;

export interface StreakRepairEntry { date: string; usedAt: string }

// student_state(jsonb)에 보관하는 스트릭 잇기 사용 내역 — 별도 컬럼/마이그레이션 불필요.
export function getStreakRepairs(student: Student): StreakRepairEntry[] {
  const raw = (student.studentState as Record<string, unknown> | undefined)?.streakRepairs;
  if (!Array.isArray(raw)) return [];
  return raw.filter((r): r is StreakRepairEntry => !!r && typeof (r as { date?: unknown }).date === 'string');
}

export interface StreakInputs {
  sinceDate: string;
  attendedDateKeys: Set<string>;
  justifiedDateKeys: Set<string>; // 승인휴가 + 쿠폰으로 이은 날
  skipDateKeys: Set<string>;      // 일괄결석(7교시 전부 X) 처리일 — 끊지도 카운트하지도 않음
}

export async function loadStreakInputs(student: Student, now: Date = new Date()): Promise<StreakInputs> {
  const sinceDate = getSeoulDateKey(new Date(now.getTime() - STREAK_WINDOW_DAYS * 24 * 60 * 60 * 1000));
  const todayKey = getSeoulDateKey(now);

  // 등원일 + 좌석 이탈마크 — 서로 독립적인 두 쿼리라 병렬로 조회한다(순차 대비 대기시간 절반).
  // 각각 실패해도 방어적으로 빈 결과 처리(스트릭 과대계산 방지).
  const [sessions, marks] = await Promise.all([
    activeBackend() === 'supabase' ? getStudySessions(student.id, sinceDate).catch(() => null) : Promise.resolve(null),
    getStudentSeatAbsenceMarks(student.id, sinceDate, todayKey).catch(() => null),
  ]);

  const attendedDateKeys = new Set<string>(sessions ? sessions.map((s) => s.date) : []);

  // 일괄결석 처리일: 그 날 seat 마크가 운영 교시(1~7) 전부 X면 센터 사정의 하루 전체 처리로 보고,
  // 등원 스캔이 없어도 스트릭이 끊기지 않는 스킵일로 취급한다(운영 정책).
  const skipDateKeys = new Set<string>();
  if (marks) {
    const byDate = new Map<string, Set<number>>();
    for (const m of marks) {
      const p = parseSeatPeriodKey(m.seatKey);
      if (!p || p.periodIdx < 0 || p.periodIdx > OPERATING_PERIODS - 1) continue;
      let idxs = byDate.get(m.date);
      if (!idxs) { idxs = new Set(); byDate.set(m.date, idxs); }
      idxs.add(p.periodIdx);
    }
    for (const [date, idxs] of byDate) {
      if (idxs.size === OPERATING_PERIODS) skipDateKeys.add(date);
    }
  }

  const justifiedDateKeys = new Set<string>([
    ...(student.leaveRequests || [])
      .filter((r) => r.status === 'approved' && r.date >= sinceDate)
      .map((r) => r.date),
    ...getStreakRepairs(student)
      .filter((r) => r.date >= sinceDate)
      .map((r) => r.date),
  ]);

  return { sinceDate, attendedDateKeys, justifiedDateKeys, skipDateKeys };
}
