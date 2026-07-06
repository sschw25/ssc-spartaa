// 쿠폰 미션 엔진 — 설정(lib/missions.ts)에 따라 조건을 평가하고 쿠폰을 자동 지급한다.
// 정산 진입점: settleMissions(). 관리자 페이지의 '지금 정산' 버튼/크론이 호출.
// 멱등성: 학생 specialNote.rewards_log 에 {date: periodKey, missionName} 으로 기록 — 같은 기간 중복 지급 방지.
import { Student } from './types/student';
import { getStudents, getStudentById, getStudyMinutesByStudent, getSessionsInRange, patchStudentProgress, getAppSetting, setAppSetting, activeBackend } from './store';
import { getPeriodBounds } from './study-stats';
import {
  MissionId,
  MISSION_ORDER,
  MISSION_META,
  normalizeMissionConfig,
} from './missions';
import {
  addDateDays,
  getDeadlineZeroOverdueStats,
  getMockReviewStats,
  getPhoneFocusStats,
  getWeeklyPlanCompletionStats,
} from './mission-metrics';
import { readActivityEnvelope, writeActivityEnvelope } from './student-activity';

const MISSION_CONFIG_KEY = 'mission_config';
const MISSION_MASTER_KEY = 'missions_master_enabled';

export async function getMissionConfig() {
  const raw = await getAppSetting(MISSION_CONFIG_KEY);
  return normalizeMissionConfig(raw);
}

export async function saveMissionConfig(cfg: ReturnType<typeof normalizeMissionConfig>) {
  await setAppSetting(MISSION_CONFIG_KEY, cfg);
}

// 쿠폰 미션 전체 마스터 스위치 — 명시적으로 false 로 저장된 경우에만 OFF(기본 ON).
// OFF 면 학생에게 미션이 노출되지 않고 자동 지급(정산·OT·뽀모도로·정시등원)도 멈춘다.
// 이미 적립된 쿠폰의 잔액/교환은 영향받지 않는다(미션 카드의 교환 UI는 계속 노출).
export async function getMissionsEnabled(): Promise<boolean> {
  const raw = await getAppSetting(MISSION_MASTER_KEY);
  return raw !== false;
}

export async function setMissionsEnabled(enabled: boolean): Promise<void> {
  await setAppSetting(MISSION_MASTER_KEY, !!enabled);
}

// 런타임 지급/노출용 설정 — 마스터 OFF 면 모든 미션을 enabled=false 로 강제한다.
// 관리자 설정 화면은 개별 토글 원본을 봐야 하므로 getMissionConfig()(원본)를 쓰고, 이 함수는 쓰지 않는다.
export async function getActiveMissionConfig() {
  const [config, master] = await Promise.all([getMissionConfig(), getMissionsEnabled()]);
  if (master) return config;
  const gated = {} as ReturnType<typeof normalizeMissionConfig>;
  for (const id of MISSION_ORDER) gated[id] = { ...config[id], enabled: false };
  return gated;
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

// 항목별 정산 미리보기(dryRun) 결과 — 미션별 조건 충족/기지급/신규 지급 대상.
export interface MissionPreviewEntry {
  id: MissionId;
  periodKey: string;       // 이번 평가 기간 키 (주 시작일 또는 YYYY-MM)
  coupons: number;         // 달성 시 지급 쿠폰
  eligible: number;        // 조건 충족 총원
  already: number;         // 같은 기간에 이미 지급된 인원
  pending: number;         // 지금 정산 시 새로 지급될 인원
  pendingNames: string[];  // 신규 지급 대상 이름 (최대 100명)
  skippedReason?: string;  // 판정 불가 사유 (예: 출결 백엔드 미설정)
}

export interface SettleResult {
  granted: Record<MissionId, number>; // 미션별 지급 학생 수
  totalCoupons: number;
  totalStudents: number; // 쿠폰을 1장이라도 받은 학생 수
  skipped: string[];     // 건너뛴 사유(예: 세션 백엔드 미설정)
  preview?: MissionPreviewEntry[]; // dryRun=true 일 때만
}

export interface SettleOptions {
  // 'weekly'=주간 미션만, 'monthly'=월간 미션만, 'all'=전체(기본, 수동 정산용)
  scope?: 'all' | 'weekly' | 'monthly';
  // 월간 미션 평가 대상 월 이동(0=이번 달, -1=지난 달). 월말/익월1일 크론에서 -1 사용 권장.
  monthOffset?: number;
  // 예약 스케줄러가 지연 실행될 때 "실행됐어야 하는 날짜" 기준으로 주간 범위를 고정한다.
  now?: Date;
  // 항목별 정산 — 지정하면 scope 대신 이 미션들만 평가한다(정산형 weekly/monthly 만 유효).
  missionIds?: MissionId[];
  // true 면 지급 없이 미션별 대상자 미리보기(preview)만 반환한다.
  dryRun?: boolean;
}

// 세션(출결 Supabase) 데이터가 필요한 미션 — 백엔드 미설정 시 판정 불가.
const SESSION_DEPENDENT: ReadonlySet<MissionId> = new Set(['weekend_study', 'weekly_top_rank', 'weekly_growth']);

export async function settleMissions(opts: SettleOptions = {}): Promise<SettleResult> {
  const scope = opts.scope ?? 'all';
  const monthOffset = opts.monthOffset ?? 0;
  const runWeekly = scope === 'all' || scope === 'weekly';
  const runMonthly = scope === 'all' || scope === 'monthly';
  const requested = opts.missionIds ? new Set(opts.missionIds) : null;

  const config = await getActiveMissionConfig();

  // 이 미션을 이번 호출에서 평가할지 — missionIds 지정 시 scope 대신 지정 목록만.
  // 정산형(weekly/monthly)이 아닌 미션(event/daily)은 settle 대상이 아니다.
  const runs = (id: MissionId): boolean => {
    const period = MISSION_META[id].period;
    if (period !== 'weekly' && period !== 'monthly') return false;
    if (!config[id].enabled) return false;
    if (requested) return requested.has(id);
    return period === 'weekly' ? runWeekly : runMonthly;
  };

  const { todayStr, weekStart, monthStart } = getPeriodBounds(opts.now);
  const weekKey = weekStart;             // 주 시작일(YYYY-MM-DD)
  const previousWeekStart = addDateDays(weekStart, -7);
  const previousWeekEnd = addDateDays(weekStart, -1);

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
    weekly_plan_completion: 0,
    phone_focus_week: 0,
    weekly_growth: 0,
    deadline_zero_overdue: 0,
    mock_review_complete: 0,
  };
  const skipped: string[] = [];

  const students = await getStudents();
  const sessionsAvailable = activeBackend() === 'supabase';

  // 세션 기반 데이터 (supabase 전용)
  let weekMin: Record<string, number> = {};
  let previousWeekMin: Record<string, number> = {};
  const monthDailyByStudent = new Map<string, Map<string, number>>(); // studentId -> (date -> minutes)
  if (sessionsAvailable) {
    if (runs('weekly_top_rank')) {
      weekMin = await getStudyMinutesByStudent(weekStart, todayStr);
    }
    if (runs('weekly_growth')) {
      if (Object.keys(weekMin).length === 0) weekMin = await getStudyMinutesByStudent(weekStart, todayStr);
      previousWeekMin = await getStudyMinutesByStudent(previousWeekStart, previousWeekEnd);
    }
    if (runs('weekend_study')) {
      const monthSessions = await getSessionsInRange(monthRangeStart, monthRangeEnd);
      for (const s of monthSessions) {
        if (s.minutes == null) continue;
        if (!monthDailyByStudent.has(s.student_id)) monthDailyByStudent.set(s.student_id, new Map());
        const m = monthDailyByStudent.get(s.student_id)!;
        m.set(s.date, (m.get(s.date) || 0) + s.minutes);
      }
    }
  } else {
    if (runs('weekend_study')) skipped.push('주말 집중 학습: 출결(Supabase) 미설정으로 건너뜀');
    if (runs('weekly_top_rank')) skipped.push('주간 순공 랭킹: 출결(Supabase) 미설정으로 건너뜀');
    if (runs('weekly_growth')) skipped.push('전주 대비 순공 성장: 출결(Supabase) 미설정으로 건너뜀');
  }

  // 지급 대상 결정 — 학생ID -> [{missionId, periodKey, coupons}] (+미션별 대상 목록: 미리보기용)
  const grants = new Map<string, Array<{ id: MissionId; periodKey: string; coupons: number }>>();
  const eligibleByMission = new Map<MissionId, string[]>();
  const addGrant = (sid: string, id: MissionId, periodKey: string, coupons: number) => {
    if (!grants.has(sid)) grants.set(sid, []);
    grants.get(sid)!.push({ id, periodKey, coupons });
    if (!eligibleByMission.has(id)) eligibleByMission.set(id, []);
    eligibleByMission.get(id)!.push(sid);
  };

  // 1) 월 벌점 0점
  if (runs('monthly_no_penalty')) {
    for (const s of students) {
      const monthPenalty = (s.penalties || [])
        .filter((p) => p.type === 'penalty' && (p.date || '').startsWith(monthKey))
        .reduce((sum, p) => sum + (p.points || 0), 0);
      if (monthPenalty === 0) addGrant(s.id, 'monthly_no_penalty', monthKey, config.monthly_no_penalty.coupons);
    }
  }

  // 2) 주말 N시간↑ M회 (한 달)
  if (runs('weekend_study') && sessionsAvailable) {
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
  if (runs('weekly_top_rank') && sessionsAvailable) {
    const topN = config.weekly_top_rank.topN ?? 3;
    const ranked = Object.entries(weekMin)
      .filter(([, min]) => min > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([sid]) => sid);
    for (const sid of ranked) addGrant(sid, 'weekly_top_rank', weekKey, config.weekly_top_rank.coupons);
  }

  // 4) 주간 계획 실행률
  if (runs('weekly_plan_completion')) {
    const needRate = (config.weekly_plan_completion.planCompletionRate ?? 85) / 100;
    for (const s of students) {
      const stats = getWeeklyPlanCompletionStats(s, weekStart, todayStr);
      if (stats.expected > 0 && stats.rate !== null && stats.rate >= needRate) {
        addGrant(s.id, 'weekly_plan_completion', weekKey, config.weekly_plan_completion.coupons);
      }
    }
  }

  // 5) 휴대폰 제출/보관 루틴
  if (runs('phone_focus_week')) {
    const needDays = config.phone_focus_week.phoneFocusDays ?? 5;
    for (const s of students) {
      const stats = getPhoneFocusStats(s, weekStart, todayStr);
      if (stats.count >= needDays) addGrant(s.id, 'phone_focus_week', weekKey, config.phone_focus_week.coupons);
    }
  }

  // 6) 전주 대비 순공 성장
  if (runs('weekly_growth') && sessionsAvailable) {
    const needGrowth = (config.weekly_growth.growthPercent ?? 15) / 100;
    const minCurrent = (config.weekly_growth.growthMinHours ?? 20) * 60;
    for (const s of students) {
      const current = weekMin[s.id] || 0;
      const previous = previousWeekMin[s.id] || 0;
      if (current < minCurrent || previous <= 0) continue;
      if ((current - previous) / previous >= needGrowth) {
        addGrant(s.id, 'weekly_growth', weekKey, config.weekly_growth.coupons);
      }
    }
  }

  // 7) 기간 목표 지연 0건
  if (runs('deadline_zero_overdue')) {
    const today = opts.now ?? new Date();
    for (const s of students) {
      const stats = getDeadlineZeroOverdueStats(s, today, todayStr);
      if (stats.achieved) addGrant(s.id, 'deadline_zero_overdue', weekKey, config.deadline_zero_overdue.coupons);
    }
  }

  // 8) 모의고사 오답분석/보완계획 제출
  if (runs('mock_review_complete')) {
    const minChars = config.mock_review_complete.mockReviewMinChars ?? 10;
    for (const s of students) {
      const stats = getMockReviewStats(s, weekStart, todayStr, minChars);
      if (stats.count > 0) addGrant(s.id, 'mock_review_complete', weekKey, config.mock_review_complete.coupons);
    }
  }

  // dryRun — 지급 없이 미션별 대상자 미리보기만 반환 (항목별 정산 UI용).
  // 기지급 여부는 로드해 둔 students 스냅샷의 rewards_log 로 판정한다(미리보기 목적상 충분).
  if (opts.dryRun) {
    const studentById = new Map(students.map((s) => [s.id, s]));
    const preview: MissionPreviewEntry[] = [];
    for (const id of MISSION_ORDER) {
      if (!runs(id)) continue;
      const periodKey = MISSION_META[id].period === 'weekly' ? weekKey : monthKey;
      const skippedReason = SESSION_DEPENDENT.has(id) && !sessionsAvailable
        ? '출결(Supabase) 미설정 — 판정 불가'
        : undefined;
      const missionName = MISSION_META[id].name;
      let already = 0;
      const pendingNames: string[] = [];
      for (const sid of eligibleByMission.get(id) || []) {
        const st = studentById.get(sid);
        if (!st) continue;
        if (hasReward(readActivityEnvelope(st), periodKey, missionName)) already += 1;
        else pendingNames.push(st.name);
      }
      preview.push({
        id,
        periodKey,
        coupons: config[id].coupons,
        eligible: (eligibleByMission.get(id) || []).length,
        already,
        pending: pendingNames.length,
        pendingNames: pendingNames.slice(0, 100),
        ...(skippedReason ? { skippedReason } : {}),
      });
    }
    return { granted, totalCoupons: 0, totalStudents: 0, skipped, preview };
  }

  // 지급 적용 (멱등) — 받을 게 있는 학생만, 학생별로 fresh 재조회 후 낙관적 잠금 저장.
  // settle 시작 시점의 students 스냅샷이 stale 해져 동시 저장으로 쿠폰이 유실되던 문제 방지
  // (patchStudentProgress = updated_at 조건부 update, conflict 시 fresh 재조회로 재시도). 카운트는 실제 저장 성공 후 집계.
  let totalCoupons = 0;
  let totalStudents = 0;
  const grantNowIso = new Date().toISOString();

  for (const [sid, list] of grants) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const student = await getStudentById(sid);
      if (!student) break;
      const originalUpdatedAt = student.updatedAt ?? '';
      const noteObj: any = readActivityEnvelope(student);
      if (!Array.isArray(noteObj.rewards_log)) noteObj.rewards_log = [];

      let couponsForStudent = 0;
      const newlyGranted: MissionId[] = [];
      for (const g of list) {
        const missionName = MISSION_META[g.id].name;
        if (hasReward(noteObj, g.periodKey, missionName)) continue; // 이미 지급됨
        noteObj.rewards_log.push({
          date: g.periodKey,
          missionName,
          status: 'completed',
          rewardGranted: g.coupons,
          grantedAt: grantNowIso,
        });
        couponsForStudent += g.coupons;
        newlyGranted.push(g.id);
      }

      if (couponsForStudent <= 0) break; // 전부 이미 지급됨 — 저장 불필요

      student.leaveCoupons = (student.leaveCoupons || 0) + couponsForStudent;
      writeActivityEnvelope(student, noteObj);
      const saved = await patchStudentProgress(student, originalUpdatedAt);
      if (saved === 'conflict') continue; // fresh 재조회로 재시도

      for (const id of newlyGranted) granted[id] += 1;
      totalCoupons += couponsForStudent;
      totalStudents += 1;
      break;
    }
  }

  return { granted, totalCoupons, totalStudents, skipped };
}

// OT 참여 쿠폰 즉시 지급 (이벤트 기반·멱등) — student 객체를 변형하고 지급한 쿠폰 수를 반환.
// 저장(saveStudent)은 호출부 책임. 미션 비활성/이미 지급 시 0 반환.
export async function grantOtAttendance(student: Student, eventId: string): Promise<number> {
  const config = await getActiveMissionConfig();
  const m = config.ot_attendance;
  if (!m.enabled) return 0;
  const noteObj: any = readActivityEnvelope(student);
  if (!Array.isArray(noteObj.rewards_log)) noteObj.rewards_log = [];
  const periodKey = `OT:${eventId}`;
  const missionName = MISSION_META.ot_attendance.name;
  if (hasReward(noteObj, periodKey, missionName)) return 0;
  noteObj.rewards_log.push({ date: periodKey, missionName, status: 'completed', rewardGranted: m.coupons, grantedAt: new Date().toISOString() });
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
  noteObj.rewards_log.push({ date: periodKey, missionName, status: 'completed', rewardGranted: coupons, grantedAt: new Date().toISOString() });
  student.leaveCoupons = (student.leaveCoupons || 0) + coupons;
  writeActivityEnvelope(student, noteObj);
  return coupons;
}
