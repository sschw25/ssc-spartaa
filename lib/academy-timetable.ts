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
  { start: '08:20', end: '09:00', label: '0교시: 영어 테스트 및 지각 차단', type: 'supplement', studyTime: 'morning' },
  { start: '09:00', end: '10:50', label: '1교시: 오전 모의고사 및 집중 학습', type: 'study', studyTime: 'morning' },
  { start: '10:50', end: '11:10', label: '쉬는 시간', type: 'break' },
  { start: '11:10', end: '12:30', label: '2교시: 오전 집중 학습', type: 'study', studyTime: 'morning' },
  { start: '12:30', end: '13:50', label: '점심시간', type: 'meal' },
  { start: '13:50', end: '15:00', label: '3교시: 오후 집중 학습', type: 'study', studyTime: 'afternoon' },
  { start: '15:00', end: '15:10', label: '쉬는 시간', type: 'break' },
  { start: '15:10', end: '16:20', label: '4교시: 오후 집중 학습', type: 'study', studyTime: 'afternoon' },
  { start: '16:20', end: '16:30', label: '쉬는 시간', type: 'break' },
  { start: '16:30', end: '17:40', label: '5교시: 오후 마무리 학습', type: 'study', studyTime: 'afternoon' },
  { start: '17:40', end: '18:50', label: '저녁시간', type: 'meal' },
  { start: '18:50', end: '20:20', label: '6교시: 야간 집중 학습', type: 'study', studyTime: 'night' },
  { start: '20:20', end: '20:30', label: '쉬는 시간', type: 'break' },
  { start: '20:30', end: '22:00', label: '7교시: 야간 마무리 학습', type: 'study', studyTime: 'night' },
  { start: '22:00', end: '22:10', label: '정비 시간', type: 'break' },
  { start: '22:10', end: '23:20', label: '심야 자율 학습', type: 'late-study', studyTime: 'night' },
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
