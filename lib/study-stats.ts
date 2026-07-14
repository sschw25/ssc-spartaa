import type { StudySession } from './supabase';
import { parseSpecialNoteEnvelope } from './student-activity';
import { ACADEMY_TIMETABLE } from './academy-timetable';

// 집중(순공) 분 — 학생 활동봉투 pomodoro_minutes 를 날짜 범위 합산, 재석분(출결) 상한으로 클램프.
// "순공 ≤ 재석" — 실제 있던 시간보다 집중이 많을 수 없다(어뷰징 방어). 0분·재석0 은 랭킹 제외.
export function focusMinutesByStudent(
  students: Array<{ id: string; specialNote?: string | null }>,
  sinceDate: string,
  untilDate: string,
  attendanceByStudent: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of students) {
    const pm = parseSpecialNoteEnvelope(s.specialNote).pomodoro_minutes;
    if (!pm || typeof pm !== 'object') continue;
    let sum = 0;
    for (const [d, v] of Object.entries(pm)) {
      if (d >= sinceDate && d <= untilDate) sum += Number(v) || 0;
    }
    if (sum <= 0) continue;
    const clamped = Math.min(sum, attendanceByStudent[s.id] || 0);
    if (clamped > 0) out[s.id] = clamped;
  }
  return out;
}

// ── 좌석판 수기 출석(present) → 재석분 파생 ──────────────────────────────────
// QR 등하원 없이 관리자가 좌석판에서 출석 처리한 날은 study_sessions 가 비어 순공이 0으로
// 잡힌다(운영 제보 버그). 그런 날에 한해 seat_statuses 의 'present' 마크(교시 단위)를
// 재석분으로 파생한다. 쓰기 없음(읽기 시점 파생·멱등) — study_sessions 에 가짜 행 금지.
// seat_key "{studentId}:{periodIdx}", periodIdx 0~6 = 1~7교시(academy-timetable p1~p7).

export interface SeatPresenceMark { date: string; seatKey: string }

const PRESENCE_DEFAULT_PERIOD_MIN = 70; // 시간표에서 교시를 못 찾을 때의 보수적 기본값

const hhmmToMin = (hhmm: string): number => {
  const [h, m] = (hhmm || '').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

// 교시별 길이(분) — academy-timetable(periodKey 단일 소스) p1~p7 의 시작/끝 차이.
const PRESENCE_PERIOD_MINUTES: number[] = Array.from({ length: 7 }, (_, i) => {
  const p = ACADEMY_TIMETABLE.find((t) => t.periodKey === `p${i + 1}`);
  return p ? Math.max(0, hhmmToMin(p.end) - hhmmToMin(p.start)) : PRESENCE_DEFAULT_PERIOD_MIN;
});

// present 마크 → 학생별·날짜별 파생 재석분(교시 길이 합). phone_·심야(A)·중복 마크는 제외.
export function deriveSeatPresenceMinutes(marks: SeatPresenceMark[]): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  const seen = new Set<string>();
  for (const m of marks) {
    const i = (m.seatKey || '').indexOf(':');
    if (i <= 0) continue;
    const tail = m.seatKey.slice(i + 1);
    if (!/^\d+$/.test(tail)) continue; // phone_D 등 비교시 키 제외 (absence-stats 와 동일 규칙)
    const idx = Number(tail);
    if (idx < 0 || idx >= PRESENCE_PERIOD_MINUTES.length) continue; // 1~7교시만 (심야 A 는 수기 비대상)
    const dedupe = `${m.date}|${m.seatKey}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    const sid = m.seatKey.slice(0, i);
    const byDate = (out[sid] ||= {});
    byDate[m.date] = (byDate[m.date] || 0) + PRESENCE_PERIOD_MINUTES[idx];
  }
  return out;
}

// ── 당일 재석중(미퇴실) 세션의 실시간 경과분 ─────────────────────────────────
// 관리자 '등원 처리'(QR 대체, 좌석판 카드 버튼)나 QR 등원 직후에는 세션이 열려 있어
// (minutes=null) 그날 순공이 0으로 보인다 — 좌석판 수동 출석이 순공에 안 잡힌다는 제보의
// 실경로. 리더보드(dayAttLive, app/api/leaderboard)와 같은 방식으로 등원→현재 경과분을
// buildStudyStats 에도 산입한다. 하원 처리 시 minutes 로 확정되고, 미하원 sweep(minutes=null)
// 은 기존대로 무효 — 당일 화면 표시만 실시간 보정하는 읽기 파생이다.
// 상한: 마지막 교시(심야 자율) 끝 — 미하원 세션이 심야 이후 시간까지 부풀지 않게.

const LAST_PERIOD_END_MIN = ACADEMY_TIMETABLE.length
  ? hhmmToMin(ACADEMY_TIMETABLE[ACADEMY_TIMETABLE.length - 1].end)
  : 23 * 60 + 20;

const KST_HM_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false,
});

function kstMinOfDay(d: Date): number {
  const [h, m] = KST_HM_FMT.format(d).split(':').map(Number);
  return ((h || 0) % 24) * 60 + (m || 0);
}

// 당일 미퇴실 세션의 경과분(등원→now). 마지막 교시 끝을 넘는 분은 세지 않는다.
export function liveOpenSessionMinutes(checkInIso: string, now: Date): number {
  const inDate = new Date(checkInIso);
  if (Number.isNaN(inDate.getTime())) return 0;
  const elapsed = Math.floor((now.getTime() - inDate.getTime()) / 60000);
  const capToTimetable = LAST_PERIOD_END_MIN - kstMinOfDay(inDate);
  return Math.max(0, Math.min(elapsed, capToTimetable));
}

// 세션분(학생별·날짜별) + present 파생 → 학생별 합계.
// 그 날 세션분이 1분이라도 있으면 세션이 진실(파생 미적용) — 이중 계산 방지.
export function mergeAttendanceWithPresence(
  sessionMinByStudentDate: Record<string, Record<string, number>>,
  presenceByStudentDate: Record<string, Record<string, number>>,
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const [sid, byDate] of Object.entries(sessionMinByStudentDate)) {
    for (const min of Object.values(byDate)) totals[sid] = (totals[sid] || 0) + min;
  }
  for (const [sid, byDate] of Object.entries(presenceByStudentDate)) {
    for (const [date, min] of Object.entries(byDate)) {
      if ((sessionMinByStudentDate[sid]?.[date] || 0) > 0) continue;
      totals[sid] = (totals[sid] || 0) + min;
    }
  }
  return totals;
}

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

export interface StudyStats {
  weekTotalMin: number;
  weekRank: { rank: number; total: number } | null; // 본인 등수 (내부용 — 화면엔 상위%만 노출)
  weekPercent: number | null; // 상위 % (전체 원생 대비) — 절대등수/총원 비노출
  weekStart: string;
  monthStart: string;
  weekAttendedDays: number;  // 이번 주 출석(등하원 기록 있는) 일수
  weekExpectedDays: number;  // 이번 주 월~토 중 오늘까지 경과 일수 (학원 운영일 기준)
  weekAbsentDays: number;    // 결석일 = 기대 출석일 − 실제 출석일
  currentStreak: number;     // 연속 공부일 (일요일 휴원은 건너뜀, 오늘 미출석은 깨지 않음)
  // 집중(타이머) 순공 — 순공 이원화(운영 결정 2026-07-13): 체류(등원~하원)와 집중(스톱워치/뽀모도로)을
  // 나눠 표시한다. 집중은 체류를 넘을 수 없다(재석 상한 클램프, 리더보드와 동일 규칙).
  weekFocusMin?: number;
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
  topPercent: number | null; // 상위 몇 % (전체 원생 대비, 1~100) — 절대등수/총원 비노출
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
  // 상위 % — 전체 원생 수 대비(1위는 1%로 표기), 절대등수/총원은 노출하지 않음
  const denom = Math.max(students.length, 1);
  const topPercent = myRank ? (myRank === 1 ? 1 : Math.max(1, Math.round((myRank / denom) * 100))) : null;
  const cutline = ranked.length >= 10 ? ranked[9].minutes : (ranked.length ? ranked[ranked.length - 1].minutes : 0);
  const toTop10 = inTop10 ? 0 : Math.max(0, cutline - myMinutes);
  const ahead = ranked.filter((r) => r.minutes > myMinutes).map((r) => r.minutes);
  const nextUpGap = ahead.length ? Math.min(...ahead) - myMinutes : null;
  const top1 = ranked.length ? ranked[0].minutes : 0;

  return { hasRecord, myMinutes, inTop10, rank: inTop10 ? myRank : null, topPercent, toTop10, nextUpGap, cutline, top1 };
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
  presenceMarks?: SeatPresenceMark[];  // 본인, 이번 달 이후 좌석판 present 마크 — 세션 없는 날 재석 파생
  focusMinutesByDate?: Record<string, number>; // 본인 집중(타이머) 분 — specialNote 봉투 pomodoro_minutes
  now?: Date;
}): StudyStats {
  const { sessions, weeklyMinutesByStudent, myId, totalStudents, presenceMarks, focusMinutesByDate, now = new Date() } = opts;
  const { weekStart, monthStart } = getPeriodBounds(now);

  let weekTotalMin = 0;

  const sessionMinByDate: Record<string, number> = {}; // 날짜별 세션분 — present 파생 적용 여부 판별용
  sessions.forEach((s) => {
    if (s.minutes == null) return; // 진행 중(미퇴실) 제외
    sessionMinByDate[s.date] = (sessionMinByDate[s.date] || 0) + s.minutes;
    if (s.date >= weekStart) weekTotalMin += s.minutes;
  });

  // 당일 미퇴실(진행 중) 세션 — 등원→현재 경과분을 실시간 산입(리더보드 dayAttLive 와 동일 규칙).
  // 관리자 '등원 처리'(QR 대체) 직후에도 순공 카드가 0으로 보이지 않게 한다. 하원 시 minutes
  // 확정으로 대체되고, 과거 날짜의 미하원 세션(sweep 무효분)은 기존대로 산입하지 않는다.
  const todayLive = seoulToday(now);
  let liveTodayMin = 0;
  sessions.forEach((s) => {
    if (s.minutes != null || s.date !== todayLive || !s.check_in) return;
    liveTodayMin += liveOpenSessionMinutes(s.check_in, now);
  });
  if (liveTodayMin > 0) {
    sessionMinByDate[todayLive] = (sessionMinByDate[todayLive] || 0) + liveTodayMin; // 아래 present 파생 이중 산입 방지
    if (todayLive >= weekStart) weekTotalMin += liveTodayMin;
  }

  // 좌석판 수기 출석(present) 파생 — 그 날 세션분이 없을 때만 보충(getStudyMinutesByStudent 와 동일 규칙).
  const presenceByDate = presenceMarks?.length
    ? deriveSeatPresenceMinutes(presenceMarks)[myId] || {}
    : {};
  const presenceDates: string[] = [];
  for (const [date, min] of Object.entries(presenceByDate)) {
    if ((sessionMinByDate[date] || 0) > 0) continue;
    presenceDates.push(date);
    if (date >= weekStart) weekTotalMin += min;
  }

  // 출석일: 이번 주(weekStart~) 등하원 기록이 있는 distinct 날짜 수 (진행 중 세션·수기 출석 포함)
  const weekDates = new Set<string>();
  sessions.forEach((s) => {
    if (s.date >= weekStart) weekDates.add(s.date);
  });
  presenceDates.forEach((d) => {
    if (d >= weekStart) weekDates.add(d);
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
  presenceDates.forEach((d) => attendedDates.add(d));
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
  let weekPercent: number | null = null; // 상위 % (전체 원생 대비) — 절대등수/총원 비노출용
  if (myWeekMin > 0) {
    const moreCount = Object.values(weeklyMinutesByStudent).filter((v) => v > myWeekMin).length;
    const rank = moreCount + 1;
    weekRank = { rank, total: Math.max(totalStudents, rank) };
    weekPercent = rank === 1 ? 1 : Math.max(1, Math.round((rank / Math.max(totalStudents, rank)) * 100));
  }

  // 집중(타이머) 순공 — 주간 합산 후 체류(재석)로 클램프. "집중 ≤ 체류" (리더보드와 동일 규칙).
  let weekFocusMin = 0;
  if (focusMinutesByDate) {
    const todayStr2 = seoulToday(now);
    for (const [d, v] of Object.entries(focusMinutesByDate)) {
      const min = Number(v) || 0;
      if (min <= 0 || d > todayStr2) continue;
      if (d >= weekStart) weekFocusMin += min;
    }
    weekFocusMin = Math.min(weekFocusMin, weekTotalMin);
  }

  return {
    weekTotalMin, weekRank, weekPercent, weekStart, monthStart,
    weekAttendedDays, weekExpectedDays, weekAbsentDays, currentStreak, weekFocusMin,
  };
}
