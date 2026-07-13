// 쿠폰 지급 미션 — 단일 진실 소스 (카탈로그·기본 설정·메타).
// 관리자 미션 설정 페이지(/admin/missions), 미션 엔진(lib/mission-engine.ts),
// 학생 리포트 미션 카드가 모두 이 모듈을 사용한다.
//
// 쿠폰 경제: 쿠폰 5장 = 반차 추가권 1회 (lib/leave.ts COUPONS_PER_EXTRA_HALFDAY).

export type MissionId =
  | 'monthly_no_penalty' // 한 달 벌점 0점
  | 'weekend_study'      // 한 달 내 주말 N시간↑ 학습 M회
  | 'weekly_top_rank'    // 주간 순공 상위 N명
  | 'ot_attendance'      // OT 참여 (이벤트 기반 — 참여 처리 시 즉시 지급)
  | 'daily_pomodoro'     // 하루 뽀모도로 N세션 (일일 — 달성 즉시 지급)
  | 'punctual_checkin'   // 지각 없이 정시 등원 (일일 — 달성 즉시 지급)
  | 'weekly_plan_completion' // 주간 계획 실행률
  | 'phone_focus_week'       // 주간 휴대폰 제출/보관 루틴
  | 'weekly_growth'          // 전주 대비 순공 성장
  | 'deadline_zero_overdue'  // 기간 목표 지연 0건
  | 'mock_review_complete';  // 모의고사 오답분석/보완계획 제출

export type MissionPeriod = 'weekly' | 'monthly' | 'event' | 'daily';

export interface MissionConfig {
  id: MissionId;
  enabled: boolean;
  coupons: number; // 달성 시 지급 쿠폰 수
  // 미션별 파라미터 (해당 미션에서만 사용)
  weekendHours?: number;     // weekend_study: 주말 1일 기준 학습 시간(시간)
  weekendCount?: number;     // weekend_study: 한 달 내 충족 횟수
  topN?: number;             // weekly_top_rank: 상위 몇 명까지 지급
  pomodoroSessions?: number; // daily_pomodoro: 하루 필요 세션 수
  checkinByHour?: number;    // punctual_checkin: 등원 마감 시각(시)
  planCompletionRate?: number; // weekly_plan_completion: 필요 실행률(%)
  phoneFocusDays?: number;     // phone_focus_week: 필요 일수
  growthPercent?: number;      // weekly_growth: 전주 대비 성장률(%)
  growthMinHours?: number;     // weekly_growth: 이번 주 최소 순공 시간
  mockReviewMinChars?: number; // mock_review_complete: 각 입력란 최소 글자 수
}

export interface MissionMeta {
  id: MissionId;
  name: string;
  period: MissionPeriod;
  /** 정산 시점 안내 (관리자용) */
  settleHint: string;
  /** 조건/달성 방법 설명 (관리자·학생 공용) — {param} 토큰은 config 값으로 치환 */
  describe: (c: MissionConfig) => string;
  /** 조정 가능한 파라미터 정의 (설정 UI 렌더용) */
  params: Array<{ key: keyof MissionConfig; label: string; unit: string; min: number; max: number }>;
}

export const MISSION_META: Record<MissionId, MissionMeta> = {
  monthly_no_penalty: {
    id: 'monthly_no_penalty',
    name: '이달의 클린 — 벌점 0점',
    period: 'monthly',
    settleHint: '월말에 정산하세요. 정산 시점까지 이번 달 벌점이 0점인 학생에게 지급됩니다.',
    describe: (c) => `이번 달(1일~정산일) 동안 받은 벌점이 0점이면 쿠폰 ${c.coupons}장을 지급합니다. (상점은 영향 없음)`,
    params: [],
  },
  weekend_study: {
    id: 'weekend_study',
    name: '주말 집중 학습',
    period: 'monthly',
    settleHint: '월말에 정산하세요. 이번 달 주말 학습 충족 횟수로 판정합니다.',
    describe: (c) =>
      `이번 달에 주말(토·일) 하루 ${c.weekendHours ?? 3}시간 이상 학습한 날이 ${c.weekendCount ?? 2}번 이상이면 쿠폰 ${c.coupons}장을 지급합니다.`,
    params: [
      { key: 'weekendHours', label: '주말 1일 기준 시간', unit: '시간', min: 1, max: 12 },
      { key: 'weekendCount', label: '필요 횟수(월)', unit: '회', min: 1, max: 8 },
    ],
  },
  weekly_top_rank: {
    id: 'weekly_top_rank',
    name: '주간 순공 랭킹 보상',
    period: 'weekly',
    settleHint: '매주 일요일 밤 또는 월요일에 정산하세요. 지난 주 순공 시간 기준입니다.',
    describe: (c) =>
      `이번 주 순공(실학습) 시간 상위 ${c.topN ?? 3}명에게 쿠폰 ${c.coupons}장을 지급합니다. (순공 0분 제외)`,
    params: [{ key: 'topN', label: '상위 인원', unit: '명', min: 1, max: 10 }],
  },
  ot_attendance: {
    id: 'ot_attendance',
    name: 'OT 참여 보상',
    period: 'event',
    settleHint: 'OT 일정 관리에서 학생을 "참여"로 처리하거나 학생이 직접 참여 응답하면 즉시 지급됩니다(정산 불필요).',
    describe: (c) => `OT(특별 세션)에 참여하면 쿠폰 ${c.coupons}장을 즉시 지급합니다. (OT별 1회)`,
    params: [],
  },
  daily_pomodoro: {
    id: 'daily_pomodoro',
    name: '하루 뽀모도로 집중',
    period: 'daily',
    settleHint: '학생이 뽀모도로 타이머로 집중 세션을 완료하면 자동 평가·지급됩니다(정산 불필요).',
    describe: (c) => `하루 뽀모도로 집중 세션을 ${c.pomodoroSessions ?? 2}회 이상 완료하면 쿠폰 ${c.coupons}장을 지급합니다. (하루 1회)`,
    params: [{ key: 'pomodoroSessions', label: '필요 세션', unit: '회', min: 1, max: 10 }],
  },
  punctual_checkin: {
    id: 'punctual_checkin',
    name: '정시 등원 (지각 0)',
    period: 'daily',
    settleHint: '학생이 정시 이전에 QR 등원하면 자동 평가·지급됩니다(정산 불필요).',
    describe: (c) => `지각 없이 ${c.checkinByHour ?? 11}시 이전에 등원하면 쿠폰 ${c.coupons}장을 지급합니다. (하루 1회)`,
    params: [{ key: 'checkinByHour', label: '등원 마감 시각', unit: '시', min: 6, max: 12 }],
  },
  weekly_plan_completion: {
    id: 'weekly_plan_completion',
    name: '주간 계획 실행률',
    period: 'weekly',
    settleHint: '매주 정산하세요. 이번 주 배정된 일일 계획의 완료율로 판정합니다.',
    describe: (c) => `이번 주 배정된 교재·인강 일일 계획을 ${c.planCompletionRate ?? 85}% 이상 완료하면 쿠폰 ${c.coupons}장을 지급합니다.`,
    params: [{ key: 'planCompletionRate', label: '필요 실행률', unit: '%', min: 50, max: 100 }],
  },
  phone_focus_week: {
    id: 'phone_focus_week',
    name: '휴대폰 몰입 루틴',
    period: 'weekly',
    settleHint: '매주 정산하세요. 아침 자가 점검표의 휴대폰 제출/임시보관 기록으로 판정합니다.',
    describe: (c) => `이번 주 휴대폰을 제출하거나 임시보관함에 맡긴 날이 ${c.phoneFocusDays ?? 5}일 이상이면 쿠폰 ${c.coupons}장을 지급합니다.`,
    params: [{ key: 'phoneFocusDays', label: '필요 일수', unit: '일', min: 1, max: 6 }],
  },
  weekly_growth: {
    id: 'weekly_growth',
    name: '전주 대비 집중률 성장',
    period: 'weekly',
    settleHint: '매주 정산하세요. 집중률(집중 타이머 ÷ 체류 시간, 최대 100%)의 전주 대비 상승폭(%p)으로 판정합니다.',
    describe: (c) =>
      `이번 주 체류(등원~하원)가 ${c.growthMinHours ?? 20}시간 이상이고, 집중률(집중 ÷ 체류)이 지난주보다 ${c.growthPercent ?? 15}%p 이상 오르면 쿠폰 ${c.coupons}장을 지급합니다.`,
    params: [
      { key: 'growthPercent', label: '집중률 상승', unit: '%p', min: 5, max: 100 },
      { key: 'growthMinHours', label: '최소 체류', unit: '시간', min: 1, max: 80 },
    ],
  },
  deadline_zero_overdue: {
    id: 'deadline_zero_overdue',
    name: '기간 목표 지연 0건',
    period: 'weekly',
    settleHint: '매주 정산하세요. 기간 목표가 1개 이상 있고 지연 위험이 0건이면 지급합니다.',
    describe: (c) => `이번 주 기간 목표가 1개 이상이고 지연 위험이 0건이면 쿠폰 ${c.coupons}장을 지급합니다.`,
    params: [],
  },
  mock_review_complete: {
    id: 'mock_review_complete',
    name: '모의고사 오답분석 제출',
    period: 'weekly',
    settleHint: '매주 정산하세요. 학생 미션 허브에 제출한 모의고사 오답분석/보완계획으로 판정합니다.',
    describe: (c) =>
      `이번 주 모의고사 오답분석과 보완계획을 각각 ${c.mockReviewMinChars ?? 10}자 이상 제출하면 쿠폰 ${c.coupons}장을 지급합니다.`,
    params: [{ key: 'mockReviewMinChars', label: '최소 글자 수', unit: '자', min: 5, max: 100 }],
  },
};

export const MISSION_ORDER: MissionId[] = [
  'monthly_no_penalty',
  'weekend_study',
  'weekly_top_rank',
  'ot_attendance',
  'daily_pomodoro',
  'punctual_checkin',
  'weekly_plan_completion',
  'phone_focus_week',
  'weekly_growth',
  'deadline_zero_overdue',
  'mock_review_complete',
];

export const DEFAULT_MISSION_CONFIG: Record<MissionId, MissionConfig> = {
  monthly_no_penalty: { id: 'monthly_no_penalty', enabled: true, coupons: 1 },
  weekend_study: { id: 'weekend_study', enabled: true, coupons: 1, weekendHours: 3, weekendCount: 2 },
  weekly_top_rank: { id: 'weekly_top_rank', enabled: true, coupons: 1, topN: 3 },
  ot_attendance: { id: 'ot_attendance', enabled: true, coupons: 1 },
  daily_pomodoro: { id: 'daily_pomodoro', enabled: true, coupons: 1, pomodoroSessions: 2 },
  punctual_checkin: { id: 'punctual_checkin', enabled: true, coupons: 1, checkinByHour: 11 },
  weekly_plan_completion: { id: 'weekly_plan_completion', enabled: true, coupons: 1, planCompletionRate: 85 },
  phone_focus_week: { id: 'phone_focus_week', enabled: true, coupons: 1, phoneFocusDays: 5 },
  weekly_growth: { id: 'weekly_growth', enabled: true, coupons: 1, growthPercent: 15, growthMinHours: 20 },
  deadline_zero_overdue: { id: 'deadline_zero_overdue', enabled: true, coupons: 1 },
  mock_review_complete: { id: 'mock_review_complete', enabled: true, coupons: 1, mockReviewMinChars: 10 },
};

/** 저장된 부분 설정을 기본값과 병합해 항상 완전한 설정을 반환 (누락 키 안전) */
export function normalizeMissionConfig(
  saved: Partial<Record<MissionId, Partial<MissionConfig>>> | null | undefined,
): Record<MissionId, MissionConfig> {
  const out = {} as Record<MissionId, MissionConfig>;
  for (const id of MISSION_ORDER) {
    out[id] = { ...DEFAULT_MISSION_CONFIG[id], ...(saved?.[id] || {}), id };
  }
  return out;
}
