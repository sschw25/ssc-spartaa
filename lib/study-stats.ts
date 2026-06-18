import type { StudySession } from './supabase';

// 날짜 유틸 (KST, 타임존 안전)
function seoulToday(now: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(now);
}
function weekdayOf(dateStr: string): number {
  // 0=Sun..6=Sat (캘린더 날짜의 요일은 타임존 무관 → UTC로 계산)
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
function addDays(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

export function getPeriodBounds(now: Date = new Date()) {
  const todayStr = seoulToday(now);
  const w = weekdayOf(todayStr); // 0=Sun
  const mondayOffset = w === 0 ? -6 : 1 - w;
  const weekStart = addDays(todayStr, mondayOffset);
  const monthStart = todayStr.slice(0, 8) + '01';
  return { todayStr, weekStart, monthStart };
}

const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

export interface StudyStats {
  weekTotalMin: number;
  monthTotalMin: number;
  byWeekday: { label: string; min: number }[];
  peakWeekday: { label: string; min: number } | null;
  weekRank: { rank: number; total: number } | null; // 본인 등수 (남의 정보 미포함)
  weekStart: string;
  monthStart: string;
}

export function buildStudyStats(opts: {
  sessions: StudySession[];            // 본인, 이번 달 이후
  weeklyMinutesByStudent: Record<string, number>; // 전체 학생 이번 주 순공(분) — 등수 계산용
  myId: string;
  totalStudents: number;
  now?: Date;
}): StudyStats {
  const { sessions, weeklyMinutesByStudent, myId, totalStudents, now = new Date() } = opts;
  const { weekStart, monthStart } = getPeriodBounds(now);

  let weekTotalMin = 0;
  let monthTotalMin = 0;
  const byWeekdayMin = [0, 0, 0, 0, 0, 0, 0]; // 월..일

  sessions.forEach((s) => {
    if (s.minutes == null) return; // 진행 중(미퇴실) 제외
    if (s.date >= monthStart) monthTotalMin += s.minutes;
    if (s.date >= weekStart) weekTotalMin += s.minutes;
    const monIdx = (weekdayOf(s.date) + 6) % 7; // 월=0..일=6
    byWeekdayMin[monIdx] += s.minutes;
  });

  const byWeekday = WEEKDAY_LABELS.map((label, i) => ({ label, min: byWeekdayMin[i] }));
  const peakIdx = byWeekdayMin.reduce((best, v, i, arr) => (v > arr[best] ? i : best), 0);
  const peakWeekday = byWeekdayMin[peakIdx] > 0 ? { label: WEEKDAY_LABELS[peakIdx], min: byWeekdayMin[peakIdx] } : null;

  // 등수: 본인보다 이번 주 순공이 많은 학생 수 + 1. (남의 분/이름은 반환하지 않음)
  const myWeekMin = weeklyMinutesByStudent[myId] || 0;
  let weekRank: { rank: number; total: number } | null = null;
  if (myWeekMin > 0) {
    const moreCount = Object.values(weeklyMinutesByStudent).filter((v) => v > myWeekMin).length;
    weekRank = { rank: moreCount + 1, total: Math.max(totalStudents, moreCount + 1) };
  }

  return { weekTotalMin, monthTotalMin, byWeekday, peakWeekday, weekRank, weekStart, monthStart };
}
