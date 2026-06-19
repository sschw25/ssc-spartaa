import type { Student } from './types/student';

// KST(Asia/Seoul) 기준 오늘 날짜 (YYYY-MM-DD)
function kstToday(now = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(now);
}

// 두 YYYY-MM-DD 사이의 일수 차 (to - from). UTC 자정 기준이라 DST·TZ 영향 없음.
function diffDays(fromYmd: string, toYmd: string): number {
  const from = Date.parse(`${fromYmd}T00:00:00Z`);
  const to = Date.parse(`${toYmd}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

/**
 * 등록 종료일까지 남은 일수.
 * 0 = 오늘이 마지막 날, 양수 = 남음, 음수 = 이미 만료. endDate 없으면 null.
 */
export function enrollmentDaysLeft(endDate?: string, now = new Date()): number | null {
  if (!endDate) return null;
  return diffDays(kstToday(now), endDate);
}

// KST 기준 이번 주(월요일 시작)의 시작일 (YYYY-MM-DD)
export function weekStartYmd(now = new Date()): string {
  const today = kstToday(now);
  const t = new Date(`${today}T00:00:00Z`);
  const dow = t.getUTCDay();        // 0=일 ~ 6=토
  const offset = (dow + 6) % 7;     // 월요일까지 거슬러 올라갈 일수
  t.setUTCDate(t.getUTCDate() - offset);
  return t.toISOString().slice(0, 10);
}

/**
 * 매주 성적 입력 대상(weeklyGradeCheck)인데 이번 주(월~오늘) 입력된 성적이 없으면 true.
 */
export function isWeeklyGradeMissing(student: Pick<Student, 'weeklyGradeCheck' | 'grades'>, now = new Date()): boolean {
  if (!student.weeklyGradeCheck) return false;
  const start = weekStartYmd(now);
  const today = kstToday(now);
  return !(student.grades || []).some((g) => g.date >= start && g.date <= today);
}
