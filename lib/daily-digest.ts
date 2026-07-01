// 일일 자동 브리핑(관리자 대시보드 "오늘의 브리핑" 카드) 순수 계산 모듈. 외부 I/O 없음(재사용·검증 용이).
// 스마트화 로드맵 Wave1 #2(일일 브리핑) + #3(연속결석·이탈급증 트리거)를 하나의 산출물로 합친다.
// 별도 알림 채널(인박스 테이블) 없이, 이 digest 자체가 관리자에게 보여줄 알림 표면이다.
import type { Student } from '@/lib/types/student';
import { buildAbsenceRanking, buildDailyAbsenceMap, type AbsenceRankRow, type DailyMarkMap } from '@/lib/absence-stats';
import { buildHealthSignals } from '@/lib/health-signals';
import { computeHealthScore, DEFAULT_HEALTH_WEIGHTS, type HealthWeights } from '@/lib/health-score';

// 연속결석 트리거 임계(기본 2일 연속, §4.3 기본값)
export const DEFAULT_CONSECUTIVE_ABSENCE_THRESHOLD = 2;
// 이탈급증 판정 윈도우: 최근 recentDays 이탈일수가 이전 priorDays(동일 길이) 대비 증가했는지
export const DEFAULT_SPIKE_RECENT_DAYS = 3;
export const DEFAULT_SPIKE_PRIOR_DAYS = 3;
// 이탈급증으로 인정할 최소 증가폭(최근-이전)
export const DEFAULT_SPIKE_MIN_INCREASE = 2;
// 위험밴드(건강지수) 출결 집계 윈도우 — 관리자 대시보드(/api/admin/health-score 기본 14일)와
// 같은 학생이 브리핑/대시보드에서 다르게 판정되지 않도록 동일한 14일로 맞춘다.
// (rawMarks 자체는 연속결석 lookback용으로 더 넓게 들어오므로, 위험밴드 계산 전에 이 윈도우로 자른다.)
export const HEALTH_ABSENCE_WINDOW_DAYS = 14;

export interface DigestStudentEntry {
  studentId: string;
  name: string;
  campus: string;
}

export interface StreakBrokenEntry extends DigestStudentEntry {
  recentLeftDays: number;
  priorLeftDays: number;
}

export interface ConsecutiveAbsenceEntry extends DigestStudentEntry {
  consecutiveDays: number;
  lastDate: string;
}

export interface RiskBandEntry extends DigestStudentEntry {
  score: number;
  isNew: boolean; // 어제는 risk가 아니었는데 오늘 risk로 신규 진입
}

export interface CampusDigest {
  campus: string;
  date: string; // 브리핑 기준일(어제, YYYY-MM-DD, Seoul)
  yesterdayAbsences: DigestStudentEntry[];
  leftSpikes: StreakBrokenEntry[];
  consecutiveAbsences: ConsecutiveAbsenceEntry[];
  riskBand: RiskBandEntry[];
  counts: {
    yesterdayAbsences: number;
    leftSpikes: number;
    consecutiveAbsences: number;
    riskBand: number;
    riskBandNew: number;
  };
}

export interface DailyDigestResult {
  generatedDate: string; // 브리핑이 커버하는 날짜(어제, Seoul YYYY-MM-DD)
  campuses: Record<string, CampusDigest>;
}

export interface BuildDailyDigestOpts {
  today?: Date; // 기준 "오늘"(Seoul). 어제 = today-1일. 테스트 결정성을 위한 주입.
  weights?: HealthWeights;
  consecutiveThreshold?: number;
  spikeRecentDays?: number;
  spikePriorDays?: number;
  spikeMinIncrease?: number;
  // 어제 시점 위험밴드(전날 브리핑 결과 등)를 넘기면 riskBand.isNew(신규 진입) 계산에 사용.
  // 없으면 모든 위험 학생을 신규로 간주하지 않고 isNew=false로 채운다.
  previousRiskStudentIds?: Set<string>;
}

function seoulDateKeyOf(date: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(date);
}

function addDays(date: Date, delta: number): Date {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + delta);
  return d;
}

// today 기준 최근 n개 날짜키(오늘 포함 X, 어제부터 과거로) — health-signals recentDateKeys와 동일 패턴
function dateKeyRange(fromDate: Date, days: number): string[] {
  const keys: string[] = [];
  for (let i = 0; i < days; i++) keys.push(seoulDateKeyOf(addDays(fromDate, -i)));
  return keys;
}

// 학생별 (연속결석일수, 마지막 결석일) 계산. dailyMap 은 buildDailyAbsenceMap 결과.
// "연속"은 달력일 기준 연속(이 레포의 스트릭 정의처럼 일요일 skip 등은 적용하지 않음 —
// 결석 트리거는 보수적으로 달력일 연속만 본다. 필요 시 lib/streak.ts와 별도로 조정 가능).
function computeConsecutiveAbsences(
  dailyMap: DailyMarkMap,
  asOf: Date,
): Map<string, { consecutiveDays: number; lastDate: string }> {
  const result = new Map<string, { consecutiveDays: number; lastDate: string }>();
  for (const [studentId, byDate] of dailyMap) {
    let streak = 0;
    let lastDate = '';
    let cursor = asOf;
    // asOf(어제)부터 과거로 거슬러 올라가며 결석("absent")이 끊기지 않는 한 카운트.
    // 데이터가 없는 날(마크 자체가 없음)은 정보 부재로 간주해 중단(과대 연속 판정 방지).
    for (let i = 0; i < 60; i++) {
      const key = seoulDateKeyOf(cursor);
      const mark = byDate.get(key);
      if (!mark || mark.kind !== 'absent') break;
      streak++;
      if (!lastDate) lastDate = key;
      cursor = addDays(cursor, -1);
    }
    if (streak > 0) result.set(studentId, { consecutiveDays: streak, lastDate });
  }
  return result;
}

/**
 * 학생 전체와 원시 결석마크(충분히 넓은 기간, 최소 spikeRecentDays+spikePriorDays+60일 권장)를 받아
 * 센터별 일일 브리핑을 계산한다. 순수 함수 — I/O·시간 조회는 opts.today로만 주입받는다.
 *
 * @param students 전체 학생(캠퍼스 무관, 함수 내부에서 campus로 그룹핑)
 * @param rawMarks 넉넉한 기간(예: 최근 60일)의 seat 결석 원시 마크
 * @param attendedDays 동일 기간 등원일 집합("studentId|date")
 * @param opts 기준일/가중치/임계값
 */
export function buildDailyDigest(
  students: Student[],
  rawMarks: { date: string; seatKey: string }[],
  attendedDays: Set<string>,
  opts: BuildDailyDigestOpts = {},
): DailyDigestResult {
  const today = opts.today ?? new Date();
  const yesterday = addDays(today, -1);
  const generatedDate = seoulDateKeyOf(yesterday);
  const weights = opts.weights ?? DEFAULT_HEALTH_WEIGHTS;
  const consecutiveThreshold = opts.consecutiveThreshold ?? DEFAULT_CONSECUTIVE_ABSENCE_THRESHOLD;
  const recentDays = opts.spikeRecentDays ?? DEFAULT_SPIKE_RECENT_DAYS;
  const priorDays = opts.spikePriorDays ?? DEFAULT_SPIKE_PRIOR_DAYS;
  const minIncrease = opts.spikeMinIncrease ?? DEFAULT_SPIKE_MIN_INCREASE;
  const previousRisk = opts.previousRiskStudentIds ?? new Set<string>();

  const dailyMap = buildDailyAbsenceMap(rawMarks, attendedDays, students);
  // 위험밴드용 결석집계는 대시보드와 동일한 최근 14일(어제 기준)로 제한 —
  // 60일치 rawMarks를 그대로 쓰면 대시보드(14일)와 결석일수가 최대 4배 벌어져 판정이 어긋난다.
  const healthWindowStart = seoulDateKeyOf(addDays(yesterday, -(HEALTH_ABSENCE_WINDOW_DAYS - 1)));
  const healthMarks = rawMarks.filter((m) => m.date >= healthWindowStart);
  const absenceRows = buildAbsenceRanking(healthMarks, attendedDays, students);
  const absenceById = new Map<string, AbsenceRankRow>(absenceRows.map((r) => [r.studentId, r]));
  const consecutiveById = computeConsecutiveAbsences(dailyMap, yesterday);

  // 이탈급증: recentDays(어제부터 역순) vs 그 직전 priorDays(동일 길이) 이탈일수 비교
  const recentKeys = new Set(dateKeyRange(yesterday, recentDays));
  const priorKeys = new Set(dateKeyRange(addDays(yesterday, -recentDays), priorDays));

  const campusMap = new Map<string, CampusDigest>();
  const getCampus = (campus: string): CampusDigest => {
    let c = campusMap.get(campus);
    if (!c) {
      c = {
        campus,
        date: generatedDate,
        yesterdayAbsences: [],
        leftSpikes: [],
        consecutiveAbsences: [],
        riskBand: [],
        counts: { yesterdayAbsences: 0, leftSpikes: 0, consecutiveAbsences: 0, riskBand: 0, riskBandNew: 0 },
      };
      campusMap.set(campus, c);
    }
    return c;
  };

  for (const student of students) {
    const entryBase: DigestStudentEntry = { studentId: student.id, name: student.name, campus: student.campus };
    const digest = getCampus(student.campus);
    const byDate = dailyMap.get(student.id);

    // 1) 어제 결석 명단
    const yesterdayMark = byDate?.get(generatedDate);
    if (yesterdayMark?.kind === 'absent') {
      digest.yesterdayAbsences.push(entryBase);
    }

    // 2) 이탈급증 명단
    if (byDate) {
      let recentLeft = 0, priorLeft = 0;
      for (const [date, mark] of byDate) {
        if (mark.kind !== 'left') continue;
        if (recentKeys.has(date)) recentLeft++;
        else if (priorKeys.has(date)) priorLeft++;
      }
      if (recentLeft - priorLeft >= minIncrease) {
        digest.leftSpikes.push({ ...entryBase, recentLeftDays: recentLeft, priorLeftDays: priorLeft });
      }
    }

    // 3) 연속결석(>=threshold) 명단
    const consecutive = consecutiveById.get(student.id);
    if (consecutive && consecutive.consecutiveDays >= consecutiveThreshold) {
      digest.consecutiveAbsences.push({ ...entryBase, consecutiveDays: consecutive.consecutiveDays, lastDate: consecutive.lastDate });
    }

    // 4) 위험밴드(band==='risk') 명단 — 건강지수 엔진 재사용
    const absence = absenceById.get(student.id);
    const signals = buildHealthSignals(
      student,
      absence ? { absentDays: absence.absentDays, leftDays: absence.leftDays } : null,
      { today: yesterday },
    );
    const result = computeHealthScore(signals, weights);
    if (result.band === 'risk') {
      digest.riskBand.push({ ...entryBase, score: result.score, isNew: !previousRisk.has(student.id) });
    }
  }

  for (const digest of campusMap.values()) {
    digest.counts = {
      yesterdayAbsences: digest.yesterdayAbsences.length,
      leftSpikes: digest.leftSpikes.length,
      consecutiveAbsences: digest.consecutiveAbsences.length,
      riskBand: digest.riskBand.length,
      riskBandNew: digest.riskBand.filter((r) => r.isNew).length,
    };
  }

  return { generatedDate, campuses: Object.fromEntries(campusMap) };
}
