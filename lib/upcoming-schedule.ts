// 학생 미션 허브 "학원 일정" 섹션용 순수 계산 모듈.
// OT/모의고사/참여미션(캠퍼스 행사)의 다가오는 일정을 학생 기준으로 필터·임박순 정렬한다.
// 대상 판정은 기존 학생 노출 로직의 단일 소스:
//  - OT: app/api/student/ot-events(센터 대상 + notifiedAt 수동발송 또는 D-3 자동 노출) → 여기로 추출해 재사용
//  - 모의고사: lib/mock-exam-scope(isMockExamVisibleToStudent, requireNotified)
//  - 참여미션: app/api/student/campus-events(isTargeted: 센터/지정 학생) → 여기로 추출해 재사용

import { isMockExamVisibleToStudent } from './mock-exam-scope';
import type { CampusEvent, MockExam, OtEvent, Student } from './types/student';

// 조회 범위(앞으로 N일)와 임박 강조(D-N 이내) 기준
export const SCHEDULE_WINDOW_DAYS = 30;
export const SCHEDULE_URGENT_DDAY = 3;
// OT 자동 노출 기준(D-3) — 기존 ot-events 학생 노출 규칙과 동일
export const OT_AUTO_EXPOSE_DDAY = 3;

export type UpcomingScheduleKind = 'ot' | 'mock' | 'event';

export interface UpcomingScheduleItem {
  id: string;                     // `${kind}_${원본 이벤트 id}`
  kind: UpcomingScheduleKind;
  title: string;
  date: string;                   // 시작일 YYYY-MM-DD
  endDate?: string;               // 다중일 행사 종료일 (옵션)
  startTime?: string;             // HH:MM (옵션)
  dday: number;                   // 0 = 오늘(진행 중 다중일 행사는 0으로 클램프)
  needsResponse: boolean;         // 아직 참석 응답이 없는 상태(리포트에서 응답 필요)
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

// 서울 기준 날짜키 간 D-day 계산 (양수=미래, 0=오늘). 형식 불량이면 null.
export function daysUntil(ymd: string | undefined, todayKey: string): number | null {
  if (!ymd || !YMD_RE.test(ymd) || !YMD_RE.test(todayKey)) return null;
  const target = new Date(`${ymd}T00:00:00+09:00`).getTime();
  const today = new Date(`${todayKey}T00:00:00+09:00`).getTime();
  if (Number.isNaN(target) || Number.isNaN(today)) return null;
  return Math.round((target - today) / 86400000);
}

// ── OT: 센터 + 목표시험 유형 대상 판정 (app/api/student/ot-events 에서 추출) ─────────────
// targetExamTypes([]=전체)는 admin 생성 API가 저장하는 필드 — 모의고사(lib/mock-exam-scope)와
// 동일한 contact 포함 매칭으로 반영한다(설정된 이벤트가 없으면 기존 센터-only 동작과 동일).
export function isOtEventTargetedToStudent(event: OtEvent, student: Student): boolean {
  if (event.campus && event.campus !== 'all' && event.campus !== student.campus) return false;
  const types = (event.targetExamTypes || []).map((t) => t.trim()).filter(Boolean);
  if (types.length === 0) return true;
  const contact = student.contact || '';
  return types.some((type) => contact.includes(type));
}

// OT 학생 노출: 대상 + (수동 발송됨 or D-3 이후 자동 노출)
export function isOtEventVisibleToStudent(event: OtEvent, student: Student, todayKey: string): boolean {
  if (!isOtEventTargetedToStudent(event, student)) return false;
  if (event.notifiedAt) return true;
  const dday = daysUntil(event.date, todayKey);
  return dday !== null && dday <= OT_AUTO_EXPOSE_DDAY;
}

// ── 참여미션(캠퍼스 행사): 대상 판정 (app/api/student/campus-events 에서 추출) ─────
export function isCampusEventTargetedToStudent(event: CampusEvent, student: Student): boolean {
  if (event.targetMode === 'students') {
    return (event.targetStudentIds || []).includes(student.id);
  }
  // 센터 대상 (기본)
  return !event.campus || event.campus === 'all' || event.campus === student.campus;
}

export interface BuildUpcomingScheduleInput {
  student: Student;
  otEvents: OtEvent[];
  mockExams: MockExam[];
  campusEvents: CampusEvent[];
  todayKey: string;               // YYYY-MM-DD (서울)
  windowDays?: number;            // 기본 SCHEDULE_WINDOW_DAYS
}

// 다가오는(오늘 포함) 학원 일정을 임박순으로 집계. 확정 불참/거절 일정은 제외.
export function buildUpcomingSchedule(input: BuildUpcomingScheduleInput): UpcomingScheduleItem[] {
  const { student, otEvents, mockExams, campusEvents, todayKey } = input;
  const windowDays = input.windowDays ?? SCHEDULE_WINDOW_DAYS;
  const items: UpcomingScheduleItem[] = [];

  // 시작일 dday 가 [0, windowDays] 인 일정만. 다중일 행사는 진행 중(시작<오늘≤종료)도 포함해 dday=0.
  const resolveDday = (date: string, endDate?: string): number | null => {
    const dday = daysUntil(date, todayKey);
    if (dday === null) return null;
    if (dday > windowDays) return null;
    if (dday >= 0) return dday;
    const endDday = daysUntil(endDate, todayKey);
    if (endDday !== null && endDday >= 0) return 0; // 진행 중인 다중일 행사
    return null;
  };

  // 1) OT — 확정 불참(absent)만 제외. 미응답/미정이면 응답 필요 표시.
  const otResponses = new Map((student.otEvents || []).map((r) => [r.eventId, r]));
  for (const event of otEvents) {
    if (!isOtEventVisibleToStudent(event, student, todayKey)) continue;
    const response = otResponses.get(event.id);
    if (response && response.status === 'absent') continue;
    const dday = resolveDday(event.date);
    if (dday === null) continue;
    items.push({
      id: `ot_${event.id}`,
      kind: 'ot',
      title: event.name,
      date: event.date,
      dday,
      needsResponse: !response || response.status === 'undecided',
    });
  }

  // 2) 모의고사 — 알림 발송된 회차만(기존 학생 노출 규칙). 확정 불참(absent) 제외.
  const mockResponses = new Map((student.mockExams || []).map((r) => [r.examId, r]));
  for (const exam of mockExams) {
    if (!isMockExamVisibleToStudent(exam, student, { requireNotified: true })) continue;
    const response = mockResponses.get(exam.id);
    if (response && response.status === 'absent') continue;
    const dday = resolveDday(exam.date);
    if (dday === null) continue;
    items.push({
      id: `mock_${exam.id}`,
      kind: 'mock',
      title: exam.name,
      date: exam.date,
      dday,
      needsResponse: !response || response.status === 'undecided',
    });
  }

  // 3) 참여미션(캠퍼스 행사) — 알림 발송된 미션만. 거절(declined) 제외, 무응답이면 응답 필요.
  const participations = new Map((student.eventParticipations || []).map((p) => [p.eventId, p]));
  for (const event of campusEvents) {
    if (!event.isMission || !event.notifiedAt) continue;
    if (!isCampusEventTargetedToStudent(event, student)) continue;
    const participation = participations.get(event.id);
    if (participation && participation.status === 'declined') continue;
    const dday = resolveDday(event.date, event.endDate);
    if (dday === null) continue;
    items.push({
      id: `event_${event.id}`,
      kind: 'event',
      title: event.title,
      date: event.date,
      ...(event.endDate ? { endDate: event.endDate } : {}),
      ...(event.startTime ? { startTime: event.startTime } : {}),
      dday,
      needsResponse: !participation,
    });
  }

  // 임박순 정렬 (동일 D-day 는 날짜→종류 순으로 안정화)
  const kindOrder: Record<UpcomingScheduleKind, number> = { ot: 0, mock: 1, event: 2 };
  items.sort((a, b) =>
    a.dday - b.dday || a.date.localeCompare(b.date) || kindOrder[a.kind] - kindOrder[b.kind],
  );
  return items;
}
