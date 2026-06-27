// 쿠폰 지급 미션 — 단일 진실 소스 (카탈로그·기본 설정·메타).
// 관리자 미션 설정 페이지(/admin/missions), 미션 엔진(lib/mission-engine.ts),
// 학생 리포트 미션 카드가 모두 이 모듈을 사용한다.
//
// 쿠폰 경제: 쿠폰 3장 = 반차 추가권 1회 (lib/leave.ts COUPONS_PER_EXTRA_HALFDAY).

export type MissionId =
  | 'monthly_no_penalty' // 한 달 벌점 0점
  | 'weekend_study'      // 한 달 내 주말 N시간↑ 학습 M회
  | 'weekly_top_rank'    // 주간 순공 상위 N명
  | 'ot_attendance';     // OT 참여 (이벤트 기반 — 참여 처리 시 즉시 지급)

export type MissionPeriod = 'weekly' | 'monthly' | 'event';

export interface MissionConfig {
  id: MissionId;
  enabled: boolean;
  coupons: number; // 달성 시 지급 쿠폰 수
  // 미션별 파라미터 (해당 미션에서만 사용)
  weekendHours?: number; // weekend_study: 주말 1일 기준 학습 시간(시간)
  weekendCount?: number; // weekend_study: 한 달 내 충족 횟수
  topN?: number;         // weekly_top_rank: 상위 몇 명까지 지급
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
};

export const MISSION_ORDER: MissionId[] = ['monthly_no_penalty', 'weekend_study', 'weekly_top_rank', 'ot_attendance'];

export const DEFAULT_MISSION_CONFIG: Record<MissionId, MissionConfig> = {
  monthly_no_penalty: { id: 'monthly_no_penalty', enabled: true, coupons: 1 },
  weekend_study: { id: 'weekend_study', enabled: true, coupons: 1, weekendHours: 3, weekendCount: 2 },
  weekly_top_rank: { id: 'weekly_top_rank', enabled: true, coupons: 1, topN: 3 },
  ot_attendance: { id: 'ot_attendance', enabled: true, coupons: 1 },
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
