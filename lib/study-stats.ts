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
  weekAttendedDays: number;  // 이번 주 출석(등하원 기록 있는) 일수
  weekExpectedDays: number;  // 이번 주 월~토 중 오늘까지 경과 일수 (학원 운영일 기준)
  weekAbsentDays: number;    // 결석일 = 기대 출석일 − 실제 출석일
  currentStreak: number;     // 연속 공부일 (일요일 휴원은 건너뜀, 오늘 미출석은 깨지 않음)
}

// 이름 마스킹: 가운데 글자를 O 로 (랭킹 등 타인 노출 시 프라이버시)
export function maskName(name: string): string {
  const n = (name || '').trim();
  if (n.length <= 1) return n || '익명';
  if (n.length === 2) return n[0] + 'O';
  return n[0] + 'O'.repeat(n.length - 2) + n[n.length - 1];
}

export interface LeaderboardEntry {
  rank: number;
  name: string;     // 마스킹된 이름
  campus: string;
  minutes: number;
  isMe: boolean;
}

export interface Leaderboard {
  top: LeaderboardEntry[];
  my: { rank: number; minutes: number; total: number } | null;
  total: number;   // 이번 주 순공 1분 이상 기록한 학생 수
}

// 내 순공 위치(동기부여용) — 타인 명단 없이 본인 중심. 총원/절대등수(10위 밖)는 비노출.
export interface MyStanding {
  hasRecord: boolean;
  myMinutes: number;
  inTop10: boolean;
  rank: number | null;       // TOP 10 안일 때만 (총원 추정 방지)
  toTop10: number;           // TOP 10 진입까지 더 필요한 순공(분)
  nextUpGap: number | null;  // 바로 위 한 명까지 남은 순공(분) — 익명
  cutline: number;           // TOP 10 커트라인(10위 순공, 익명)
  top1: number;              // 1위 순공(익명, 목표)
}
export function buildMyStanding(
  minutesByStudent: Record<string, number>,
  students: Array<{ id: string }>,
  myId: string
): MyStanding {
  const ranked = students
    .map((s) => ({ id: s.id, minutes: minutesByStudent[s.id] || 0 }))
    .filter((r) => r.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);

  const myMinutes = minutesByStudent[myId] || 0;
  const hasRecord = myMinutes > 0;
  const myRank = hasRecord ? ranked.filter((r) => r.minutes > myMinutes).length + 1 : null;
  const inTop10 = !!myRank && myRank <= 10;
  const cutline = ranked.length >= 10 ? ranked[9].minutes : (ranked.length ? ranked[ranked.length - 1].minutes : 0);
  const toTop10 = inTop10 ? 0 : Math.max(0, cutline - myMinutes);
  const ahead = ranked.filter((r) => r.minutes > myMinutes).map((r) => r.minutes);
  const nextUpGap = ahead.length ? Math.min(...ahead) - myMinutes : null;
  const top1 = ranked.length ? ranked[0].minutes : 0;

  return { hasRecord, myMinutes, inTop10, rank: inTop10 ? myRank : null, toTop10, nextUpGap, cutline, top1 };
}

// 순공 랭킹 — 이름 마스킹, 본인 등수 포함. (순공 0분은 순위 제외)
// 표준 경쟁 순위(동점은 같은 등수, 다음 등수는 건너뜀) — studyStats.weekRank 와 일치.
export function buildLeaderboard(
  minutesByStudent: Record<string, number>,
  students: Array<{ id: string; name: string; campus: string }>,
  myId: string,
  topN = 20
): Leaderboard {
  const sorted = students
    .map((s) => ({ id: s.id, name: s.name, campus: s.campus, minutes: minutesByStudent[s.id] || 0 }))
    .filter((r) => r.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);

  let lastMin: number | null = null;
  let lastRank = 0;
  const ranked = sorted.map((r, i) => {
    const rank = lastMin !== null && r.minutes === lastMin ? lastRank : i + 1;
    lastMin = r.minutes; lastRank = rank;
    return { ...r, rank };
  });

  const top = ranked.slice(0, topN).map((r) => ({
    rank: r.rank, name: maskName(r.name), campus: r.campus, minutes: r.minutes, isMe: r.id === myId,
  }));
  const meRow = ranked.find((r) => r.id === myId);
  const my = meRow ? { rank: meRow.rank, minutes: meRow.minutes, total: ranked.length } : null;
  return { top, my, total: ranked.length };
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

  // 출석일: 이번 주(weekStart~) 등하원 기록이 있는 distinct 날짜 수 (진행 중 세션 포함)
  const weekDates = new Set<string>();
  sessions.forEach((s) => {
    if (s.date >= weekStart) weekDates.add(s.date);
  });
  const weekAttendedDays = weekDates.size;
  // 기대 출석일: 이번 주 월~토 중 오늘까지 경과한 일수 (일요일은 휴원으로 제외)
  const todayStr = seoulToday(now);
  let weekExpectedDays = 0;
  let cur = weekStart;
  while (cur <= todayStr) {
    if (weekdayOf(cur) !== 0) weekExpectedDays += 1;
    cur = addDays(cur, 1);
  }
  const weekAbsentDays = Math.max(0, weekExpectedDays - weekAttendedDays);

  // 연속 공부일: 오늘부터 거슬러, 일요일(휴원)은 건너뛰고, 출석한 운영일을 연속 카운트.
  // 오늘 아직 미출석이면 streak 를 깨지 않고 어제부터 계산. (세션 데이터 범위 = 이번 달 이후로 상한)
  const attendedDates = new Set(sessions.map((s) => s.date));
  let currentStreak = 0;
  let cursor = todayStr;
  let isFirst = true;
  while (cursor >= monthStart) {
    if (weekdayOf(cursor) === 0) { cursor = addDays(cursor, -1); continue; } // 일요일 휴원 → 건너뜀
    if (attendedDates.has(cursor)) {
      currentStreak += 1;
    } else if (!isFirst) {
      break; // 운영일인데 결석 → 연속 종료
    }
    isFirst = false;
    cursor = addDays(cursor, -1);
  }

  // 등수: 본인보다 이번 주 순공이 많은 학생 수 + 1. (남의 분/이름은 반환하지 않음)
  const myWeekMin = weeklyMinutesByStudent[myId] || 0;
  let weekRank: { rank: number; total: number } | null = null;
  if (myWeekMin > 0) {
    const moreCount = Object.values(weeklyMinutesByStudent).filter((v) => v > myWeekMin).length;
    weekRank = { rank: moreCount + 1, total: Math.max(totalStudents, moreCount + 1) };
  }

  return {
    weekTotalMin, monthTotalMin, byWeekday, peakWeekday, weekRank, weekStart, monthStart,
    weekAttendedDays, weekExpectedDays, weekAbsentDays, currentStreak,
  };
}
