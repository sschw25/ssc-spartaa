// 직렬(목표시험) 표준 목록 — 가입 폼/관리자 편집의 선택지이자, 가입 승인 시
// 기본 과목 자동생성의 단일 소스.
//
// 저장 규칙: Student.contact(목표시험)에는 라벨 문자열을 "그대로" 저장한다.
// 기존 모의고사/OT/참여미션 대상필터가 contact 부분일치(substring)로 동작하므로
// (lib/mock-exam-scope.ts, lib/upcoming-schedule.ts, recipient-picker-modal 등)
// 스키마 변경·마이그레이션 없이 호환된다. 라벨을 바꾸면 기존 학생 contact 와
// 어긋나므로 라벨 변경은 신중히.
//
// subjects 는 "기본 제안"일 뿐 — 승인 후 관리자·학생이 자유롭게 수정/삭제할 수 있다.

import type { SubjectProgress } from '@/lib/types/student';

export interface ExamStream {
  id: string;
  label: string;       // contact 에 저장되는 표준 라벨
  subjects: string[];  // 승인 시 자동생성할 기본 과목명 (빈 배열 = 생성 없음)
}

export const CUSTOM_STREAM_ID = 'custom';
export const CUSTOM_STREAM_LABEL = '기타(직접 입력)';

export const EXAM_STREAMS: ExamStream[] = [
  { id: 'g9-admin', label: '9급 일반행정', subjects: ['국어', '영어', '한국사', '행정법총론', '행정학개론'] },
  { id: 'g9-correction', label: '9급 교정직', subjects: ['국어', '영어', '한국사', '교정학개론', '형사소송법개론'] },
  { id: 'g9-tax', label: '9급 세무직', subjects: ['국어', '영어', '한국사', '세법개론', '회계학'] },
  { id: 'police', label: '경찰', subjects: ['헌법', '형사법', '경찰학'] },
  { id: 'fire', label: '소방', subjects: ['소방학개론', '소방관계법규', '행정법총론'] },
  { id: 'military-admin', label: '군무원 행정', subjects: ['국어', '행정법', '행정학'] },
  { id: 'suneung', label: '수능', subjects: ['국어', '수학', '영어', '탐구'] },
  { id: 'transfer', label: '편입', subjects: ['영어', '수학'] },
  { id: 'imyong', label: '임용', subjects: ['교육학', '전공'] },
  { id: CUSTOM_STREAM_ID, label: CUSTOM_STREAM_LABEL, subjects: [] },
];

// Select 등 선택 UI 용 옵션 목록.
export const streamOptions = EXAM_STREAMS.map((s) => ({ id: s.id, label: s.label }));

// contact(목표시험) 문자열이 표준 라벨과 정확히 일치하는 직렬을 찾는다(앞뒤 공백 무시).
export function findStreamByLabel(label?: string | null): ExamStream | undefined {
  const wanted = String(label ?? '').trim();
  if (!wanted) return undefined;
  return EXAM_STREAMS.find((s) => s.label === wanted);
}

// 가입 승인 시 직렬 기본 과목을 SubjectProgress 껍데기(자료 없음)로 생성한다.
// 멱등: existing 에 같은 이름(공백/대소문자 무시)의 과목이 이미 있으면 건너뛴다.
export function buildDefaultSubjectsForContact(
  contact: string | undefined,
  existing: SubjectProgress[] = [],
): SubjectProgress[] {
  const stream = findStreamByLabel(contact);
  if (!stream || stream.subjects.length === 0) return [];
  const nowIso = new Date().toISOString();
  const existingNames = new Set(
    existing.map((s) => String(s.name || '').trim().toLowerCase()).filter(Boolean),
  );
  return stream.subjects
    .filter((name) => !existingNames.has(name.trim().toLowerCase()))
    .map((name, i) => ({
      id: `sub_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      books: [],
      lectures: [],
      updatedAt: nowIso,
    }));
}
