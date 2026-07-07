export type StudyTimeKey = 'morning' | 'afternoon' | 'night';

export type AcademyTimetableType = 'supplement' | 'study' | 'break' | 'meal' | 'late-study';

export interface AcademyTimetablePeriod {
  start: string;
  end: string;
  label: string;
  type: AcademyTimetableType;
  studyTime?: StudyTimeKey;
  // 학습 성격 교시의 안정적 키(p0~p8, p8=심야 자율). 자료별 슬롯(studySlot) 매칭용.
  periodKey?: string;
}

export const ACADEMY_TIMETABLE: AcademyTimetablePeriod[] = [
  { start: '08:20', end: '09:00', label: '0교시: 영어 테스트 및 지각 차단', type: 'supplement', studyTime: 'morning', periodKey: 'p0' },
  { start: '09:00', end: '10:50', label: '1교시: 오전 모의고사 및 집중 학습', type: 'study', studyTime: 'morning', periodKey: 'p1' },
  { start: '10:50', end: '11:10', label: '쉬는 시간', type: 'break' },
  { start: '11:10', end: '12:30', label: '2교시: 오전 집중 학습', type: 'study', studyTime: 'morning', periodKey: 'p2' },
  { start: '12:30', end: '13:50', label: '점심시간', type: 'meal' },
  { start: '13:50', end: '15:00', label: '3교시: 오후 집중 학습', type: 'study', studyTime: 'afternoon', periodKey: 'p3' },
  { start: '15:00', end: '15:10', label: '쉬는 시간', type: 'break' },
  { start: '15:10', end: '16:20', label: '4교시: 오후 집중 학습', type: 'study', studyTime: 'afternoon', periodKey: 'p4' },
  { start: '16:20', end: '16:30', label: '쉬는 시간', type: 'break' },
  { start: '16:30', end: '17:40', label: '5교시: 오후 마무리 학습', type: 'study', studyTime: 'afternoon', periodKey: 'p5' },
  { start: '17:40', end: '18:50', label: '저녁시간', type: 'meal' },
  { start: '18:50', end: '20:20', label: '6교시: 야간 집중 학습', type: 'study', studyTime: 'night', periodKey: 'p6' },
  { start: '20:20', end: '20:30', label: '쉬는 시간', type: 'break' },
  { start: '20:30', end: '22:00', label: '7교시: 야간 마무리 학습', type: 'study', studyTime: 'night', periodKey: 'p7' },
  { start: '22:00', end: '22:10', label: '정비 시간', type: 'break' },
  { start: '22:10', end: '23:20', label: '심야 자율 학습', type: 'late-study', studyTime: 'night', periodKey: 'p8' },
];

export const STUDY_TIME_SLOTS = [
  {
    key: 'morning',
    label: '오전',
    displayLabel: '오전 0~2교시',
    timeRange: '08:20~12:30',
    periodLabel: '0교시 · 1교시 · 2교시',
    description: '영어 테스트, 오전 모의고사, 오전 집중 학습',
  },
  {
    key: 'afternoon',
    label: '오후',
    displayLabel: '오후 3~5교시',
    timeRange: '13:50~17:40',
    periodLabel: '3교시 · 4교시 · 5교시',
    description: '오후 집중 학습과 진도 관리',
  },
  {
    key: 'night',
    label: '야간',
    displayLabel: '야간 6~7교시',
    timeRange: '18:50~23:20',
    periodLabel: '6교시 · 7교시 · 심야 자율',
    description: '야간 보완 학습과 심야 자율 학습',
  },
] as const satisfies ReadonlyArray<{
  key: StudyTimeKey;
  label: string;
  displayLabel: string;
  timeRange: string;
  periodLabel: string;
  description: string;
}>;

export const getStudyTimeSlot = (key?: string) =>
  STUDY_TIME_SLOTS.find((slot) => slot.key === key);

// ── 자료별 학생 지정 슬롯(studySlot) ─────────────────────────────────────────
// 값: '' (미지정 → 시간표 제외) | 'morning'|'afternoon'|'night' (블록) | 'p0'~'p8' (특정 교시)
// 홈 "자율 학습" 그룹의 select 와 API 검증, 시간표 매칭이 이 단일 소스를 공유한다.

const BLOCK_SLOT_KEYS = ['morning', 'afternoon', 'night'] as const;

// 특정 교시 슬롯 라벨 — periodKey → 표시 문구
const PERIOD_SLOT_LABELS: Record<string, string> = {
  p0: '0교시', p1: '1교시', p2: '2교시', p3: '3교시', p4: '4교시',
  p5: '5교시', p6: '6교시', p7: '7교시', p8: '심야(8교시)',
};

// 홈 slot select 옵션(미지정 포함, 순서 = 표시 순서)
export const STUDY_SLOT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: '미지정' },
  { value: 'morning', label: '오전' },
  { value: 'afternoon', label: '오후' },
  { value: 'night', label: '야간' },
  ...Object.entries(PERIOD_SLOT_LABELS).map(([value, label]) => ({ value, label })),
];

const BLOCK_SLOT_LABEL: Record<string, string> = { morning: '오전', afternoon: '오후', night: '야간' };

export const isBlockSlot = (slot?: string): slot is StudyTimeKey =>
  !!slot && (BLOCK_SLOT_KEYS as readonly string[]).includes(slot);

export const isPeriodSlot = (slot?: string): boolean => !!slot && /^p[0-8]$/.test(slot);

// 유효한 슬롯 문자열인지(API 검증·정규화용). 빈 문자열도 유효(미지정).
export const isValidStudySlot = (slot: unknown): slot is string =>
  slot === '' || (typeof slot === 'string' && (isBlockSlot(slot) || isPeriodSlot(slot)));

// 슬롯 표시 라벨. 미지정/미상은 '미지정'.
export const formatSlotLabel = (slot?: string): string => {
  if (isBlockSlot(slot)) return BLOCK_SLOT_LABEL[slot];
  if (slot && PERIOD_SLOT_LABELS[slot]) return PERIOD_SLOT_LABELS[slot];
  return '미지정';
};

// 자료 슬롯이 특정 시간표 period 에 노출되어야 하는지.
// 블록 → 그 블록에 속한 교시 모두(3칸). 특정 교시 → 그 칸만. 미지정 → 어디에도 매칭 안 됨.
export const slotMatchesPeriod = (slot: string | undefined, period: AcademyTimetablePeriod): boolean => {
  if (!slot) return false;
  if (isBlockSlot(slot)) return period.studyTime === slot;
  if (isPeriodSlot(slot)) return period.periodKey === slot;
  return false;
};
