// 쿠폰 미션 엔진 — 설정(lib/missions.ts)에 따라 조건을 평가하고 쿠폰을 자동 지급한다.
// 정산 진입점: settleMissions(). 관리자 페이지의 '지금 정산' 버튼/크론이 호출.
// 멱등성: 학생 specialNote.rewards_log 에 {date: periodKey, missionName} 으로 기록 — 같은 기간 중복 지급 방지.
import { Student } from './types/student';
import { getStudents, getStudyMinutesByStudent, getSessionsInRange, saveStudent, getAppSetting, setAppSetting, activeBackend } from './store';
import { getPeriodBounds } from './study-stats';
import {
  MissionId,
  MISSION_ORDER,
  MISSION_META,
  normalizeMissionConfig,
} from './missions';
import { readActivityEnvelope, writeActivityEnvelope } from './student-activity';

const MISSION_CONFIG_KEY = 'mission_config';

export async function getMissionConfig() {
  const raw = await getAppSetting(MISSION_CONFIG_KEY);
  return normalizeMissionConfig(raw);
}

export async function saveMissionConfig(cfg: ReturnType<typeof normalizeMissionConfig>) {
  await setAppSetting(MISSION_CONFIG_KEY, cfg);
}

function hasReward(noteObj: any, periodKey: string, missionName: string): boolean {
  return (noteObj.rewards_log || []).some(
    (l: any) => l.date === periodKey && l.missionName === missionName,
  );
}

function weekdayOfYmd(ymd: string): number {
  // 0=일 .. 6=토 (정오 UTC 고정으로 TZ 경계 안전)
  return new Date(`${ymd}T12:00:00Z`).getUTCDay();
}

export interface SettleResult {
  granted: Record<MissionId, number>; // 미션별 지급 학생 수
  totalCoupons: number;
  totalStudents: number; // 쿠폰을 1장이라도 받은 학생 수
  skipped: string[];     // 건너뛴 사유(예: 세션 백엔드 미설정)
}

export interface SettleOptions {
  // 'weekly'=주간 미션만, 'monthly'=월간 미션만, 'all'=전체(기본, 수동 정산용)
  scope?: 'all' | 'weekly' | 'monthly';
  // 월간 미션 평가 대상 월 이동(0=이번 달, -1=지난 달). 월말/익월1일 크론에서 -1 사용 권장.
  monthOffset?: number;
}

export async function settleMissions(opts: SettleOptions = {}): Promise<SettleResult> {
  const scope = opts.scope ?? 'all';
  const monthOffset = opts.monthOffset ?? 0;
  const runWeekly = scope === 'all' || scope === 'weekly';
  const runMonthly = scope === 'all' || scope === 'monthly';

  const config = await getMissionConfig();
  const { todayStr, weekStart, monthStart } = getPeriodBounds();
  const weekKey = weekStart;             // 주 시작일(YYYY-MM-DD)

  // 월간 미션 평가 구간 (monthOffset 적용)
  let monthKey: string;
  let monthRangeStart: string;
  let monthRangeEnd: string;
  if (monthOffset === 0) {
    monthKey = todayStr.slice(0, 7);
    monthRangeStart = monthStart;
    monthRangeEnd = todayStr;
  } else {
    const [y, m] = todayStr.slice(0, 7).split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + monthOffset, 1));
    const yy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    monthKey = `${yy}-${mm}`;
    monthRangeStart = `${monthKey}-01`;
    const lastDay = new Date(Date.UTC(yy, d.getUTCMonth() + 1, 0)).getUTCDate();
    monthRangeEnd = `${monthKey}-${String(lastDay).padStart(2, '0')}`;
  }

  const granted: Record<MissionId, number> = {
    monthly_no_penalty: 0,
    weekend_study: 0,
    weekly_top_rank: 0,
    ot_attendance: 0,    // 이벤트 기반 — settle 에서 지급하지 않음(참여 처리 시 즉시 지급)
    daily_pomodoro: 0,   // 일일 — 뽀모도로 완료 시 즉시 지급(rewards-service)
    punctual_checkin: 0, // 일일 — 등원 시 즉시 지급(rewards-service)
  };
  const skipped: string[] = [];

  const students = await getStudents();
  const sessionsAvailable = activeBackend() === 'supabase';

  // 세션 기반 데이터 (supabase 전용)
  let weekMin: Record<string, number> = {};
  const monthDailyByStudent = new Map<string, Map<string, number>>(); // studentId -> (date -> minutes)
  if (sessionsAvailable) {
    if (runWeekly && config.weekly_top_rank.enabled) {
      weekMin = await getStudyMinutesByStudent(weekStart);
    }
    if (runMonthly && config.weekend_study.enabled) {
      const monthSessions = await getSessionsInRange(monthRangeStart, monthRangeEnd);
      for (const s of monthSessions) {
        if (s.minutes == null) continue;
        if (!monthDailyByStudent.has(s.student_id)) monthDailyByStudent.set(s.student_id, new Map());
        const m = monthDailyByStudent.get(s.student_id)!;
        m.set(s.date, (m.get(s.date) || 0) + s.minutes);
      }
    }
  } else {
    if (runMonthly && config.weekend_study.enabled) skipped.push('주말 집중 학습: 출결(Supabase) 미설정으로 건너뜀');
    if (runWeekly && config.weekly_top_rank.enabled) skipped.push('주간 순공 랭킹: 출결(Supabase) 미설정으로 건너뜀');
  }

  // 지급 대상 결정 — 학생ID -> [{missionId, periodKey, coupons}]
  const grants = new Map<string, Array<{ id: MissionId; periodKey: string; coupons: number }>>();
  const addGrant = (sid: string, id: MissionId, periodKey: string, coupons: number) => {
    if (!grants.has(sid)) grants.set(sid, []);
    grants.get(sid)!.push({ id, periodKey, coupons });
  };

  // 1) 월 벌점 0점
  if (runMonthly && config.monthly_no_penalty.enabled) {
    for (const s of students) {
      const monthPenalty = (s.penalties || [])
        .filter((p) => p.type === 'penalty' && (p.date || '').startsWith(monthKey))
        .reduce((sum, p) => sum + (p.points || 0), 0);
      if (monthPenalty === 0) addGrant(s.id, 'monthly_no_penalty', monthKey, config.monthly_no_penalty.coupons);
    }
  }

  // 2) 주말 N시간↑ M회 (한 달)
  if (runMonthly && config.weekend_study.enabled && sessionsAvailable) {
    const needMin = (config.weekend_study.weekendHours ?? 3) * 60;
    const needCount = config.weekend_study.weekendCount ?? 2;
    for (const s of students) {
      const daily = monthDailyByStudent.get(s.id);
      if (!daily) continue;
      let weekendHits = 0;
      for (const [date, min] of daily) {
        const dow = weekdayOfYmd(date);
        if ((dow === 0 || dow === 6) && min >= needMin) weekendHits++;
      }
      if (weekendHits >= needCount) addGrant(s.id, 'weekend_study', monthKey, config.weekend_study.coupons);
    }
  }

  // 3) 주간 순공 상위 N명
  if (runWeekly && config.weekly_top_rank.enabled && sessionsAvailable) {
    const topN = config.weekly_top_rank.topN ?? 3;
    const ranked = Object.entries(weekMin)
      .filter(([, min]) => min > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([sid]) => sid);
    for (const sid of ranked) addGrant(sid, 'weekly_top_rank', weekKey, config.weekly_top_rank.coupons);
  }

  // 지급 적용 (멱등) — 받을 게 있는 학생만 저장
  let totalCoupons = 0;
  let totalStudents = 0;
  const studentMap = new Map(students.map((s) => [s.id, s]));

  for (const [sid, list] of grants) {
    const student = studentMap.get(sid);
    if (!student) continue;
    const noteObj: any = readActivityEnvelope(student);
    if (!Array.isArray(noteObj.rewards_log)) noteObj.rewards_log = [];

    let couponsForStudent = 0;
    for (const g of list) {
      const missionName = MISSION_META[g.id].name;
      if (hasReward(noteObj, g.periodKey, missionName)) continue; // 이미 지급됨
      noteObj.rewards_log.push({
        date: g.periodKey,
        missionName,
        status: 'completed',
        rewardGranted: g.coupons,
      });
      couponsForStudent += g.coupons;
      granted[g.id] += 1;
    }

    if (couponsForStudent > 0) {
      student.leaveCoupons = (student.leaveCoupons || 0) + couponsForStudent;
      writeActivityEnvelope(student, noteObj);
      await saveStudent(student);
      totalCoupons += couponsForStudent;
      totalStudents += 1;
    }
  }

  return { granted, totalCoupons, totalStudents, skipped };
}

// OT 참여 쿠폰 즉시 지급 (이벤트 기반·멱등) — student 객체를 변형하고 지급한 쿠폰 수를 반환.
// 저장(saveStudent)은 호출부 책임. 미션 비활성/이미 지급 시 0 반환.
export async function grantOtAttendance(student: Student, eventId: string): Promise<number> {
  const config = await getMissionConfig();
  const m = config.ot_attendance;
  if (!m.enabled) return 0;
  const noteObj: any = readActivityEnvelope(student);
  if (!Array.isArray(noteObj.rewards_log)) noteObj.rewards_log = [];
  const periodKey = `OT:${eventId}`;
  const missionName = MISSION_META.ot_attendance.name;
  if (hasReward(noteObj, periodKey, missionName)) return 0;
  noteObj.rewards_log.push({ date: periodKey, missionName, status: 'completed', rewardGranted: m.coupons });
  student.leaveCoupons = (student.leaveCoupons || 0) + m.coupons;
  writeActivityEnvelope(student, noteObj);
  return m.coupons;
}

// 학원 캘린더 참여 미션 쿠폰 지급 (행사 후 일괄 지급·멱등) — student 객체를 변형하고 지급한 쿠폰 수를 반환.
// 저장(saveStudent)은 호출부 책임. 쿠폰<=0 이거나 이미 지급된 경우 0 반환.
// rewards_log 의 periodKey=`EVENT:${eventId}` 로 중복 지급을 막고, 학생 미션 카드 "최근 적립"에 행사명으로 노출된다.
export function grantCampusEventReward(student: Student, eventId: string, coupons: number, eventTitle: string): number {
  if (!coupons || coupons <= 0) return 0;
  const noteObj: any = readActivityEnvelope(student);
  if (!Array.isArray(noteObj.rewards_log)) noteObj.rewards_log = [];
  const periodKey = `EVENT:${eventId}`;
  const missionName = `참여 미션 — ${eventTitle}`;
  if (hasReward(noteObj, periodKey, missionName)) return 0;
  noteObj.rewards_log.push({ date: periodKey, missionName, status: 'completed', rewardGranted: coupons });
  student.leaveCoupons = (student.leaveCoupons || 0) + coupons;
  writeActivityEnvelope(student, noteObj);
  return coupons;
}
