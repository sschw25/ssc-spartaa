// 듀오링고식 연속출석 스트릭 계산 — 순수 함수, DB/네트워크 접근 없음.
// "출석"의 정의: 그 날 등원 기록(study_sessions)이 있거나, 승인된 휴가/반차로 정당사유 처리된 날.
// 일요일(센터 휴무일)은 스트릭 판정에서 완전히 건너뛴다 — 끊지도 않고, 스트릭 길이에 더하지도 않는다.
import { getSeoulDateKey } from './student-activity';

export interface StreakResult {
  current: number;
  best?: number;
}

export interface StreakOptions {
  today?: Date;
  justifiedDateKeys?: Set<string>;
  // 일요일처럼 "끊지도 않고 카운트하지도 않는" 날(예: 일괄결석 처리일 — 센터 사정으로
  // 하루 전체가 X 처리된 날은 스캔이 없어도 스트릭이 이어져야 한다는 운영 정책).
  skipDateKeys?: Set<string>;
}

function toDateKeySet(input: Set<string> | string[]): Set<string> {
  return input instanceof Set ? input : new Set(input);
}

// KST 기준 요일(0=일 ~ 6=토)을 date-key(YYYY-MM-DD)만으로 계산 — 별도 Date 파싱 없이
// 로컬 타임존에 의존하지 않도록 정오 UTC 고정 트릭 사용(다른 모듈들과 동일 패턴).
function weekdayOfDateKey(dateKey: string): number {
  return new Date(`${dateKey}T12:00:00Z`).getUTCDay();
}

function addDaysToDateKey(dateKey: string, delta: number): string {
  const d = new Date(`${dateKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'UTC' }).format(d);
}

/**
 * 연속출석 스트릭 계산.
 *
 * 판정 대상일(오늘부터 과거로 최대 practically-unbounded 만큼, attended/justified 데이터가 있는 한 계속):
 *   - 일요일 → 스킵(끊지 않음, 카운트하지 않음), 그 전날로 계속 진행.
 *   - 출석(attended) 또는 정당사유(justified) → 스트릭에 포함, 계속 과거로 진행.
 *   - 둘 다 아님(결석) → 스트릭 종료.
 *
 * "오늘" 처리: 오늘이 아직 출석/정당사유 처리 전이고 일요일도 아니라면, 그 자체가 결석 확정은
 * 아니므로(하루가 아직 끝나지 않았을 수 있음) 오늘을 끊는 날로 취급하지 않는다. 대신 오늘을
 * 건너뛰고 가장 최근의 출석/정당사유일부터 역순으로 스트릭을 센다. 즉 "어제까지 쌓아온 스트릭"을
 * 보존하고, 오늘 등원하면 즉시 +1 되는 형태(듀오링고와 동일하게 "오늘 아직 안 했다"가 스트릭을
 * 깨뜨리지 않되, 어제 이전에 결석이 있었다면 거기서 끊긴다).
 *
 * best: 입력된 attended/justified 데이터 범위 내에서 관찰되는 가장 긴 연속 구간(일요일 스킵 규칙 동일 적용).
 * 데이터가 없으면 undefined.
 */
export function computeAttendanceStreak(
  attendedDateKeys: Set<string> | string[],
  opts: StreakOptions = {},
): StreakResult {
  const attended = toDateKeySet(attendedDateKeys);
  const justified = opts.justifiedDateKeys ? toDateKeySet(opts.justifiedDateKeys) : new Set<string>();
  const skip = opts.skipDateKeys ? toDateKeySet(opts.skipDateKeys) : new Set<string>();
  const today = opts.today ?? new Date();
  const todayKey = getSeoulDateKey(today);

  const isCounted = (dateKey: string) => attended.has(dateKey) || justified.has(dateKey);
  // 출석했으면 스킵일이라도 카운트(스킵 판정보다 출석이 우선), 아니면 일요일과 동일하게 통과
  const isSkipped = (dateKey: string) => weekdayOfDateKey(dateKey) === 0 || skip.has(dateKey);

  // ── current: 오늘부터 과거로 스캔 ──
  // 방어적 상한: 정상 입력에서는 결석 한 번이면 즉시 종료되므로 실질적으로 도달하지 않음.
  // 데이터 이상(예: attended가 비정상적으로 광범위)으로 인한 무한/장기 루프만 차단하는 안전장치.
  const MAX_SCAN_DAYS = 2000;
  let current = 0;
  let cursor = todayKey;
  let firstDay = true;

  for (let guard = 0; guard < MAX_SCAN_DAYS; guard++) {
    if (!isCounted(cursor) && isSkipped(cursor)) {
      // 일요일·스킵일(일괄결석 처리일): 스킵 — 끊지 않고 카운트도 안 함
      cursor = addDaysToDateKey(cursor, -1);
      continue;
    }
    if (isCounted(cursor)) {
      current++;
      cursor = addDaysToDateKey(cursor, -1);
      firstDay = false;
      continue;
    }
    // 오늘(첫 날)이 아직 미출석이어도 끊긴 것으로 보지 않고, 그냥 오늘을 건너뛰어
    // "어제까지의 스트릭"부터 카운트한다.
    if (firstDay && cursor === todayKey) {
      cursor = addDaysToDateKey(cursor, -1);
      firstDay = false;
      continue;
    }
    // 그 외에는 결석 확정 → 스트릭 종료
    break;
  }

  // ── best: 관찰된 데이터 범위 전체에서 가장 긴 연속 구간 탐색 ──
  const allDates = [...attended, ...justified];
  let best: number | undefined;
  if (allDates.length > 0) {
    let minKey = allDates[0];
    let maxKey = allDates[0];
    for (const k of allDates) {
      if (k < minKey) minKey = k;
      if (k > maxKey) maxKey = k;
    }
    // maxKey 와 todayKey 중 더 늦은 날짜까지 스캔(오늘 이후 미래 데이터는 없다고 가정하되, 방어적으로 max 사용)
    const scanEnd = maxKey > todayKey ? maxKey : todayKey;

    let run = 0;
    let bestRun = 0;
    let scan = minKey;
    while (scan <= scanEnd) {
      if (isCounted(scan)) {
        run++;
        if (run > bestRun) bestRun = run;
      } else if (!isSkipped(scan)) {
        run = 0;
      }
      scan = addDaysToDateKey(scan, 1);
    }
    best = Math.max(bestRun, current);
  }

  return best !== undefined ? { current, best } : { current };
}

export interface RepairableGap {
  date: string;           // 쿠폰으로 잇기(정당사유 처리) 가능한 결석일
  restoredStreak: number; // 그 날을 이으면 current가 이 값이 된다
}

// 쿠폰 "스트릭 잇기" 대상 탐지: 현재 스트릭을 끊은 가장 최근의 결석일 1개를 찾는다.
// 조건 — 듀오링고식 단일 결손 복구:
//   1) 결석일이 오늘로부터 repairWindowDays(달력일) 이내여야 한다(오래된 결손은 복구 불가).
//   2) 그 결석일 하나만 이으면 이전 스트릭과 실제로 연결되어야 한다(그 전날도 결석이면 대상 아님).
// 반환된 date를 justifiedDateKeys에 더해 재계산하면 current === restoredStreak가 된다.
export function findRepairableGap(
  attendedDateKeys: Set<string> | string[],
  opts: StreakOptions & { repairWindowDays?: number } = {},
): RepairableGap | null {
  const attended = toDateKeySet(attendedDateKeys);
  const justified = opts.justifiedDateKeys ? toDateKeySet(opts.justifiedDateKeys) : new Set<string>();
  const skip = opts.skipDateKeys ? toDateKeySet(opts.skipDateKeys) : new Set<string>();
  const today = opts.today ?? new Date();
  const todayKey = getSeoulDateKey(today);
  const repairWindowDays = opts.repairWindowDays ?? 7;
  const windowStart = addDaysToDateKey(todayKey, -(repairWindowDays - 1));

  const isCounted = (dateKey: string) => attended.has(dateKey) || justified.has(dateKey);
  const isSkipped = (dateKey: string) => weekdayOfDateKey(dateKey) === 0 || skip.has(dateKey);

  // computeAttendanceStreak의 current 스캔과 동일한 규칙으로 "끊은 날"을 찾는다.
  let cursor = todayKey;
  let firstDay = true;
  let gapDate: string | null = null;
  for (let guard = 0; guard < 2000; guard++) {
    if (cursor < windowStart) return null; // 복구 가능 기간 밖에서 끊김(또는 끊긴 날 없음)
    if (!isCounted(cursor) && isSkipped(cursor)) {
      cursor = addDaysToDateKey(cursor, -1);
      continue;
    }
    if (isCounted(cursor)) {
      cursor = addDaysToDateKey(cursor, -1);
      firstDay = false;
      continue;
    }
    if (firstDay && cursor === todayKey) {
      // 오늘 미출석은 아직 결손이 아님
      cursor = addDaysToDateKey(cursor, -1);
      firstDay = false;
      continue;
    }
    gapDate = cursor;
    break;
  }
  if (!gapDate) return null;

  // 결손일 직전(일요일·스킵일 건너뛴) 판정일이 출석/정당사유여야 "이어짐"이 성립
  let prev = addDaysToDateKey(gapDate, -1);
  for (let guard = 0; guard < 60; guard++) {
    if (!isCounted(prev) && isSkipped(prev)) { prev = addDaysToDateKey(prev, -1); continue; }
    break;
  }
  if (!isCounted(prev)) return null;

  const restored = computeAttendanceStreak(attended, {
    ...opts,
    justifiedDateKeys: new Set([...justified, gapDate]),
  });
  return { date: gapDate, restoredStreak: restored.current };
}
