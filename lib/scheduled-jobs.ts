// 관리자 설정형 예약 스케줄러 — 순수 메타데이터 + 설정 정규화 + due 판정 로직.
// 서버 러너를 import 하지 않으므로 클라이언트(관리자 UI)에서도 안전하게 import 가능하다.
// 실제 작업 실행 함수 매핑은 서버 전용 lib/scheduled-jobs-runners.ts 에 있다.

export type JobType = 'daily' | 'weekly' | 'monthly';

export interface JobSchedule {
  enabled: boolean;
  time: string;    // "HH:MM" (KST). 실행 시각(그 시각 이후 첫 틱에 실행).
  weekday: number; // 0(일)~6(토). weekly 에서만 의미. 그 외 무시.
  day: number;     // 1~28. monthly 에서만 의미. 그 외 무시.
}

export interface JobMeta {
  id: string;
  label: string;
  description: string;
  type: JobType;
  defaults: JobSchedule;
}

// 예약 작업 정의(등록표). 새 예약 작업은 여기에 한 줄 + 러너 맵에 실행함수만 추가하면 된다.
export const SCHEDULED_JOBS: JobMeta[] = [
  {
    id: 'sweep', label: '출결 자동마감', type: 'daily',
    description: '미퇴실 세션을 마감 시각 기준으로 정리',
    defaults: { enabled: true, time: '23:30', weekday: 0, day: 1 },
  },
  {
    id: 'meal', label: '도시락 반복 생성', type: 'weekly',
    description: '반복 템플릿으로 다음 라운드 도시락 생성',
    defaults: { enabled: true, time: '14:00', weekday: 1, day: 1 },
  },
  {
    id: 'weekly_settle', label: '주간 미션 정산', type: 'weekly',
    description: '주간 미션(순공 랭킹 등) 쿠폰 지급',
    defaults: { enabled: true, time: '23:59', weekday: 0, day: 1 },
  },
  {
    id: 'monthly_settle', label: '월간 미션 정산', type: 'monthly',
    description: '지난달 미션(벌점0·주말학습) 쿠폰 지급',
    defaults: { enabled: true, time: '00:30', weekday: 0, day: 1 },
  },
  {
    id: 'remind', label: '상담 D-1 리마인더', type: 'daily',
    description: '내일 상담 예약자에게 리마인더 알림 생성',
    defaults: { enabled: true, time: '19:00', weekday: 0, day: 1 },
  },
  {
    id: 'daily_digest', label: '일일 브리핑 생성', type: 'daily',
    description: '어제 결석·이탈급증·연속결석·위험 학생 브리핑 생성(대시보드 "오늘의 브리핑" 카드)',
    defaults: { enabled: true, time: '06:00', weekday: 0, day: 1 },
  },
];

export const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function findJobMeta(id: string): JobMeta | undefined {
  return SCHEDULED_JOBS.find((j) => j.id === id);
}

export function normalizeSchedule(meta: JobMeta, raw: unknown): JobSchedule {
  const d = meta.defaults;
  const r = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {};
  const time = typeof r.time === 'string' && HM.test(r.time.trim()) ? r.time.trim() : d.time;
  const weekday = Number.isInteger(r.weekday) && (r.weekday as number) >= 0 && (r.weekday as number) <= 6
    ? (r.weekday as number) : d.weekday;
  const day = Number.isInteger(r.day) && (r.day as number) >= 1 && (r.day as number) <= 28
    ? (r.day as number) : d.day;
  const enabled = typeof r.enabled === 'boolean' ? r.enabled : d.enabled;
  return { enabled, time, weekday, day };
}

export type JobConfigMap = Record<string, JobSchedule>;

export function normalizeJobConfig(raw: unknown): JobConfigMap {
  const r = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {};
  const out: JobConfigMap = {};
  for (const meta of SCHEDULED_JOBS) out[meta.id] = normalizeSchedule(meta, r[meta.id]);
  return out;
}

// ── due 판정 (순수) ─────────────────────────────────────────────
// 핵심: "가장 최근에 실행됐어야 할 발생 시점(occurrence)의 키"를 계산하고, 호출부가 그 키를
// scheduled_jobs_runs 의 기록과 비교해 아직 안 돌았으면 실행한다.
//   - 15분 틱이 설정 시각과 정확히 안 겹쳐도(예: 23:59) 다음 틱(자정 넘겨서라도)에 직전 발생분을 1회 실행.
//   - Actions 가 한동안 죽어도 복귀 시 '가장 최근 발생분'만 1회 실행(밀린 여러 회 몰아치기 없음).

function timeToMinutes(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

// KST 필드를 UTC 게터로 읽기 위한 shifted Date (KST=UTC+9, DST 없음).
function kstShifted(now: Date): Date {
  return new Date(now.getTime() + 9 * 3600 * 1000);
}
function ymdOf(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
function minutesOf(d: Date): number {
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

// 현재 KST 시각(디버그/응답 표시용).
export function kstStamp(now: Date): string {
  const k = kstShifted(now);
  return `${ymdOf(k)} ${String(k.getUTCHours()).padStart(2, '0')}:${String(k.getUTCMinutes()).padStart(2, '0')} KST`;
}

// 가장 최근 '실행돼야 할 발생 시점'의 멱등 키. 비활성이면 null.
//   daily/weekly = 해당 발생 날짜(YYYY-MM-DD), monthly = 해당 발생 월(YYYY-MM).
export function dueOccurrenceKey(meta: JobMeta, sched: JobSchedule, now: Date): string | null {
  if (!sched.enabled) return null;
  const k = kstShifted(now);
  const t = timeToMinutes(sched.time);

  if (meta.type === 'daily') {
    const d = new Date(k);
    if (minutesOf(k) < t) d.setUTCDate(d.getUTCDate() - 1); // 오늘 시각 전이면 어제 발생분
    return ymdOf(d);
  }

  if (meta.type === 'weekly') {
    const d = new Date(k);
    let delta = (k.getUTCDay() - sched.weekday + 7) % 7;
    if (delta === 0 && minutesOf(k) < t) delta = 7; // 오늘이 그 요일인데 시각 전이면 지난주 발생분
    d.setUTCDate(d.getUTCDate() - delta);
    return ymdOf(d);
  }

  // monthly
  const occ = new Date(k);
  const day = k.getUTCDate();
  const passedThisMonth = day > sched.day || (day === sched.day && minutesOf(k) >= t);
  if (!passedThisMonth) occ.setUTCMonth(occ.getUTCMonth() - 1); // 이달 발생 전이면 지난달 발생분
  return `${occ.getUTCFullYear()}-${String(occ.getUTCMonth() + 1).padStart(2, '0')}`;
}
