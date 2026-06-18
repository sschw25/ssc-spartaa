export type StudyTimeKey = 'morning' | 'afternoon' | 'night';

export type AcademyTimetableType = 'supplement' | 'study' | 'break' | 'meal' | 'late-study';

export interface AcademyTimetablePeriod {
  start: string;
  end: string;
  label: string;
  type: AcademyTimetableType;
  studyTime?: StudyTimeKey;
}

export const ACADEMY_TIMETABLE: AcademyTimetablePeriod[] = [
  { start: '08:20', end: '09:00', label: '0교시: 단어 테스트 및 지각 차단 중', type: 'supplement', studyTime: 'morning' },
  { start: '09:00', end: '10:50', label: '1교시: 실전 모의고사 및 집중 학습 중', type: 'study', studyTime: 'morning' },
  { start: '10:50', end: '11:10', label: '휴식: 다음 몰입을 위한 짧은 정비 시간입니다', type: 'break' },
  { start: '11:10', end: '12:30', label: '2교시: 숨소리조차 들리지 않는 정적 속의 질주', type: 'study', studyTime: 'morning' },
  { start: '12:30', end: '13:50', label: '점심시간: 오후의 압도적 몰입을 위해 에너지를 재충전 중', type: 'meal' },
  { start: '13:50', end: '15:00', label: '3교시: 나태함이 파고들 틈 없는 철저한 관리 중', type: 'study', studyTime: 'afternoon' },
  { start: '15:00', end: '15:10', label: '휴식: 다시 한번 집중력을 가다듬는 시간', type: 'break' },
  { start: '15:10', end: '16:20', label: '4교시: 한계를 넘어서는 순공 시간 확보의 정점', type: 'study', studyTime: 'afternoon' },
  { start: '16:20', end: '16:30', label: '휴식: 마지막 스퍼트를 위한 호흡 가다듬기', type: 'break' },
  { start: '16:30', end: '17:40', label: '5교시: 합격을 앞당기는 소리 없는 열정의 기록 중', type: 'study', studyTime: 'afternoon' },
  { start: '17:40', end: '18:50', label: '저녁시간: 야간 학습의 추진력을 얻기 위한 준비 시간', type: 'meal' },
  { start: '18:50', end: '20:20', label: '6교시: 모두가 지치는 시간, 스파르타의 관리가 빛을 발하는 순간', type: 'study', studyTime: 'night' },
  { start: '20:20', end: '20:30', label: '휴식: 오늘 하루의 결실을 맺기 전 마지막 정돈', type: 'break' },
  { start: '20:30', end: '22:00', label: '7교시: 오늘 하루의 결실을 맺는 완벽한 마무리 학습', type: 'study', studyTime: 'night' },
  { start: '22:00', end: '22:10', label: '정비: 심야 자율 학습 전 잠시 숨 고르기', type: 'break' },
  { start: '22:10', end: '23:20', label: '심야 자율 학습: 남들보다 앞서가는 새벽의 몰입', type: 'late-study', studyTime: 'night' },
];

export const STUDY_TIME_SLOTS = [
  {
    key: 'morning',
    label: '오전',
    displayLabel: '오전 0~2교시',
    timeRange: '08:20~12:30',
    periodLabel: '0교시 · 1교시 · 2교시',
    description: '단어 테스트, 실전 모의고사, 오전 집중 학습',
  },
  {
    key: 'afternoon',
    label: '오후',
    displayLabel: '오후 3~5교시',
    timeRange: '13:50~17:40',
    periodLabel: '3교시 · 4교시 · 5교시',
    description: '오후 집중 밀착 관리와 순공 시간 확보',
  },
  {
    key: 'night',
    label: '야간',
    displayLabel: '야간 6~7교시',
    timeRange: '18:50~23:20',
    periodLabel: '6교시 · 7교시 · 심야 자율',
    description: '야간 심화 몰입 학습과 심야 자율 학습',
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
