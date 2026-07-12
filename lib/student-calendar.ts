// 학생 통합 캘린더 집계 — 순수 계산 모듈.
// OT·모의고사·참여행사/일반일정(관리자 등록) + 학생 본인 반차/휴식·상담 예약을 한 캘린더로 모은다.
// 대상/노출 판정은 기존 단일 소스(lib/upcoming-schedule)를 재사용해 알림 배지와 어긋나지 않게 한다.

import {
  daysUntil,
  isOtEventVisibleToStudent,
  isCampusEventTargetedToStudent,
} from './upcoming-schedule';
import { isMockExamVisibleToStudent } from './mock-exam-scope';
import { getLeaveTypeLabel } from './leave';
import { getTodayScheduleItems, type TodayScheduleItem } from './today-schedule';
import { deriveDeadlineGoals, type DeadlineRiskLevel } from './deadline-goals';
import { getMaterialColor } from './material-color';
import { getExpectedFromPlans, getActiveStudyDays, getMaterialStudyDays } from './progress-plan';
import { getMakeupObligations } from './makeup-ledger';
import { weekKeyOf, addDaysToDateKey } from './makeup-carryover';
import type { CampusEvent, MockExam, OtEvent, Student, PersonalScheduleItem, BookProgress, LectureProgress } from './types/student';

// ── 그날의 공부 계획 · 달성도 (수험 캘린더용) ──────────────────
const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// 날짜키(YYYY-MM-DD) → 요일키. 서버 타임존과 무관하게 달력상 요일로 계산.
export function weekdayKeyOfDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!y || !m || !d) return 'mon';
  return WEEKDAY_KEYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

// 날짜키 오프셋 이동 (일 단위). UTC 기준이라 DST/타임존 안전.
export function shiftDateKey(dateKey: string, offsetDays: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + offsetDays));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

export interface DayStudySummary {
  planned: number;   // 목표가 있는 학습 항목 수(자율입력 제외)
  done: number;      // 그중 완료한 수
}

// 특정 날짜의 학습 계획 항목 (오늘 계획 단일 소스 재사용)
export function getDayStudyItems(student: Student, dateKey: string): TodayScheduleItem[] {
  return getTodayScheduleItems(student, dateKey, weekdayKeyOfDate(dateKey));
}

// 목표가 있는 항목 기준 달성 요약(자율입력 selfPaced·목표 0 제외)
export function summarizeDayStudy(items: TodayScheduleItem[]): DayStudySummary {
  const planned = items.filter((i) => !i.selfPaced && i.amount > 0);
  return { planned: planned.length, done: planned.filter((i) => i.isCompleted).length };
}

// ── 과목별(자료별) 진행 요약 (노션 캘린더식 진행도 패널·마감 마커용) ──────────────
// deriveDeadlineGoals(기간 목표 단일 소스)를 캘린더가 쓰기 좋은 가벼운 형태로 투영한다.
// selfPaced·기간 목표 없는 자료는 deriveDeadlineGoals 가 애초에 제외하므로 자연히 빠진다(마커 없음).
export interface MaterialProgressSummary {
  id: string;
  subject: string;
  title: string;
  type: '강의' | '교재';
  materialType: 'book' | 'lecture';
  materialId: string;
  unit: string;
  startDate: string;       // 계획 시작일 YYYY-MM-DD (캘린더 구간 바 시작)
  endDate: string;         // 마감(완료 예정)일 YYYY-MM-DD (구간 바 끝)
  daysRemaining: number;   // 오늘→마감일 남은 일수(0=오늘 마감, 음수=지남)
  targetAmount: number;
  actualAmount: number;
  actualRatio: number;     // 실제 진행 비율 0~1
  expectedRatio: number;   // 오늘까지 기대 진행 비율 0~1
  behind: boolean;
  riskLevel: DeadlineRiskLevel;
  color: string;           // 자료 색(hex) — 학생 지정 또는 파생 기본색. 마커·진행바에 사용.
}

export function buildMaterialSummaries(student: Student, today: Date, todayKey: string): MaterialProgressSummary[] {
  const { deadlineGoals } = deriveDeadlineGoals(student, today, todayKey);
  const allBooks = (student.subjects || []).flatMap((s) => s.books || []);
  const allLectures = (student.subjects || []).flatMap((s) => s.lectures || []);
  const out: MaterialProgressSummary[] = deadlineGoals.map((g) => {
    const mat = g.type === '교재'
      ? allBooks.find((b) => b.id === g.materialId)
      : allLectures.find((l) => l.id === g.materialId);
    return {
      id: `${g.materialId}_${g.planId}`,
      subject: g.subject,
      title: g.title,
      type: g.type as '강의' | '교재',
      materialType: g.materialType,
      materialId: g.materialId,
      unit: g.unit,
      startDate: g.startDate,
      endDate: g.endDate,
      daysRemaining: daysUntil(g.endDate, todayKey) ?? 0,
      targetAmount: g.targetAmount,
      actualAmount: g.actualAmount,
      actualRatio: g.actualRatio,
      expectedRatio: g.expectedRatio,
      behind: g.behind,
      riskLevel: g.riskLevel,
      color: getMaterialColor(mat || { id: g.materialId }),
    };
  });

  // 기간지정(deadline)이 아닌 '일일 계획' 자료도 캘린더 바로 노출 — 완료 예정일(targetDate)이 있고
  // 계획(detailedPlans)이 있으면 시작~완료까지 자료 색 구간 바를 그린다(구글 캘린더식). 대부분 학생이 여기 해당.
  const covered = new Set(out.map((s) => s.materialId));
  const clampRatio = (v: number) => Math.max(0, Math.min(1, v));
  for (const subject of student.subjects || []) {
    const handle = (m: BookProgress | LectureProgress, type: 'book' | 'lecture') => {
      if (covered.has(m.id)) return;                       // 이미 deadline 요약에 포함
      const total = type === 'book' ? (m as BookProgress).totalPages || 0 : (m as LectureProgress).totalLectures || 0;
      const current = type === 'book' ? (m as BookProgress).currentPage || 0 : (m as LectureProgress).completedLectures || 0;
      const plans = m.detailedPlans || [];
      const dailyPlans = plans.filter((p) => p.periodType !== 'deadline');
      // 완료 예정일: 자료 targetDate(휴가 보정) 우선, 없으면 마지막 계획 종료일.
      const studyDays = getActiveStudyDays(getMaterialStudyDays(subject.studyDays, m.studyDays));
      const endDate = m.targetDate || (dailyPlans.length ? dailyPlans[dailyPlans.length - 1].endDate : '');
      if (!endDate || total <= 0) return;
      // 시작일: 첫 계획 시작일, 없으면 오늘.
      const starts = dailyPlans.map((p) => p.startDate).filter(Boolean).sort();
      const startDate = starts[0] || todayKey;
      if (startDate > endDate) return;
      const actualRatio = clampRatio(current / total);
      const expectedAmt = getExpectedFromPlans(dailyPlans, today, studyDays);
      const expectedRatio = expectedAmt != null ? clampRatio(expectedAmt / total) : actualRatio;
      const behind = actualRatio < expectedRatio - 0.001;
      const riskLevel: DeadlineRiskLevel = actualRatio < expectedRatio - 0.15 ? 'danger' : behind ? 'warn' : 'ok';
      out.push({
        id: `${m.id}_daily`,
        subject: subject.name,
        title: type === 'book' ? (m as BookProgress).title : (m as LectureProgress).name,
        type: type === 'book' ? '교재' : '강의',
        materialType: type,
        materialId: m.id,
        unit: type === 'book' ? ((m as BookProgress).unit || 'p') : '강',
        startDate,
        endDate,
        daysRemaining: daysUntil(endDate, todayKey) ?? 0,
        targetAmount: total,
        actualAmount: current,
        actualRatio,
        expectedRatio,
        behind,
        riskLevel,
        color: getMaterialColor(m),
      });
      covered.add(m.id);
    };
    (subject.books || []).forEach((b) => handle(b, 'book'));
    (subject.lectures || []).forEach((l) => handle(l, 'lecture'));
  }

  return out.sort((a, b) => a.daysRemaining - b.daysRemaining || a.subject.localeCompare(b.subject));
}

// student_state.personalSchedule 를 안전하게 읽는다(스키마 유연 컬럼).
export function getPersonalSchedule(student: Student): PersonalScheduleItem[] {
  const raw = (student.studentState as Record<string, unknown> | undefined)?.personalSchedule;
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is PersonalScheduleItem =>
    !!x && typeof x === 'object' && typeof (x as PersonalScheduleItem).id === 'string'
    && typeof (x as PersonalScheduleItem).date === 'string' && typeof (x as PersonalScheduleItem).title === 'string');
}

// 조회 창(오늘 기준 과거/미래 일수). 월 이동은 이 범위 안에서 이뤄진다.
export const CALENDAR_PAST_DAYS = 45;
export const CALENDAR_FUTURE_DAYS = 120;

export type CalendarItemKind = 'ot' | 'mock' | 'event' | 'notice' | 'leave' | 'consultation' | 'personal' | 'makeup';

// 응답 상태 — UI 색/뱃지 결정의 단일 소스
export type CalendarResponseState =
  | 'info'           // 표시만 (알림형 일정 / 내 반차 / 상담)
  | 'needs-response' // 참석/불참 응답 필요
  | 'accepted'       // 참석(수락) 응답함
  | 'declined'       // 불참(거절) 응답함
  | 'post-task';     // 행사 후 제출/입력 필요 (모의고사 성적입력 등)

export interface StudentCalendarItem {
  id: string;                // `${kind}_${sourceId}`
  kind: CalendarItemKind;
  sourceId: string;
  title: string;
  date: string;              // 시작/사용일 YYYY-MM-DD
  endDate?: string;
  startTime?: string;
  dday: number;              // 시작일 기준 D-day (음수=지남, 0=오늘)
  responseState: CalendarResponseState;
  detail?: string;           // 상태/사유/메모 한 줄 요약
  postTaskLabel?: string;
  postTaskHref?: string;
  postTaskDueDate?: string;
  imageUrl?: string;         // 사진 공지(kind==='notice') 이미지 URL
  // 캘린더 상세에서 기존 응답 컴포넌트를 재사용하기 위한 원본(응답형 항목만 포함)
  otRaw?: OtEvent;
  mockRaw?: MockExam;
  eventRaw?: CampusEvent;
}

export interface BuildStudentCalendarInput {
  student: Student;
  otEvents: OtEvent[];
  mockExams: MockExam[];
  campusEvents: CampusEvent[];
  todayKey: string;          // YYYY-MM-DD (서울)
}

// 참여 미션은 값과 무관하게 참석 응답형으로 취급.
export function effectiveResponseMode(event: CampusEvent): 'none' | 'attendance' | 'postTask' {
  if (event.isMission) return 'attendance';
  return event.responseMode === 'attendance' ? 'attendance'
    : event.responseMode === 'postTask' ? 'postTask'
    : 'none';
}

function within(dday: number): boolean {
  return dday >= -CALENDAR_PAST_DAYS && dday <= CALENDAR_FUTURE_DAYS;
}

export function buildStudentCalendar(input: BuildStudentCalendarInput): StudentCalendarItem[] {
  const { student, otEvents, mockExams, campusEvents, todayKey } = input;
  const items: StudentCalendarItem[] = [];

  // 1) OT — 노출 대상만. 응답형(참석 필수).
  const otResponses = new Map((student.otEvents || []).map((r) => [r.eventId, r]));
  for (const event of otEvents) {
    if (!isOtEventVisibleToStudent(event, student, todayKey)) continue;
    const dday = daysUntil(event.date, todayKey);
    if (dday === null || !within(dday)) continue;
    const r = otResponses.get(event.id);
    // absent_requested(불참 신청·승인 대기)도 이미 응답한 상태이므로 재프롬프트하지 않는다.
    const responseState: CalendarResponseState =
      r?.status === 'attending' ? 'accepted'
      : (r?.status === 'absent' || r?.status === 'absent_requested') ? 'declined'
      : 'needs-response';
    items.push({
      id: `ot_${event.id}`, kind: 'ot', sourceId: event.id, title: event.name,
      date: event.date, dday, responseState,
      detail: responseState === 'accepted' ? '참석 응답함'
        : r?.status === 'absent_requested' ? '불참 신청 · 승인 대기'
        : responseState === 'declined' ? '불참 승인됨' : undefined,
      ...(responseState === 'needs-response' ? { otRaw: event } : {}),
    });
  }

  // 2) 모의고사 — 알림 발송 회차만. 응답형 + 참석자는 종료 후 성적입력 사후과제.
  const mockResponses = new Map((student.mockExams || []).map((r) => [r.examId, r]));
  for (const exam of mockExams) {
    if (!isMockExamVisibleToStudent(exam, student, { requireNotified: true })) continue;
    const dday = daysUntil(exam.date, todayKey);
    if (dday === null || !within(dday)) continue;
    const r = mockResponses.get(exam.id);
    const attending = r?.status === 'attending';
    // 성적 입력 완료 판정: 참여 응답의 점수(관리자 입력) 또는 학생이 성적 탭에서 입력한
    // GradeItem 중 시험명이 이 회차명을 포함하는 항목. 날짜만 같은(그날 아무 성적) 매칭은
    // 무관한 주간테스트가 모의고사 성적입력을 오탐 완료시키므로 사용하지 않는다.
    const examName = (exam.name || '').trim();
    const hasGradeEntry = examName.length >= 2
      && (student.grades || []).some((g) => (g.testName || '').includes(examName));
    const hasScore = typeof r?.score === 'number'
      || Boolean(r?.subjectScores && Object.keys(r.subjectScores).length > 0)
      || hasGradeEntry;
    let responseState: CalendarResponseState;
    let postTaskLabel: string | undefined;
    const postTaskHref: string | undefined = undefined;
    if (r?.status === 'absent' || r?.status === 'absent_requested') {
      responseState = 'declined';
    } else if (!r || r.status === 'undecided') {
      responseState = 'needs-response';
    } else if (attending && dday <= 0 && !hasScore) {
      // 시험일이 지난(또는 당일) 참석자인데 성적 미입력 → 성적입력 사후과제.
      // 이동은 리포트 내부 탭 전환이므로 href 없이 kind==='mock'로 컴포넌트가 처리한다.
      responseState = 'post-task';
      postTaskLabel = '성적 입력';
    } else {
      responseState = 'accepted';
    }
    items.push({
      id: `mock_${exam.id}`, kind: 'mock', sourceId: exam.id, title: exam.name,
      date: exam.date, dday, responseState,
      detail: responseState === 'accepted' ? (hasScore ? '성적 입력 완료' : '참석 응답함')
        : r?.status === 'absent_requested' ? '불참 신청 · 승인 대기'
        : responseState === 'declined' ? '불참 승인됨' : undefined,
      ...(postTaskLabel ? { postTaskLabel } : {}),
      ...(postTaskHref ? { postTaskHref } : {}),
      ...(responseState === 'needs-response' ? { mockRaw: exam } : {}),
    });
  }

  // 3) 참여행사/일반일정/사진공지 — 종류·모드별로 분기.
  const participations = new Map((student.eventParticipations || []).map((p) => [p.eventId, p]));
  for (const event of campusEvents) {
    if (!isCampusEventTargetedToStudent(event, student)) continue;
    // 미션은 알림 발송된 것만 노출(기존 규칙). 일반 일정/공지는 등록 즉시 캘린더에 표시.
    if (event.isMission && !event.notifiedAt) continue;
    const dday = daysUntil(event.date, todayKey);
    if (dday === null || !within(dday)) continue;

    // 사진 공지 — 표시형, 이미지 캐리. 이미지가 없으면(정리됨 등) 스킵.
    if (event.category === 'notice') {
      if (!event.imageUrl) continue;
      items.push({
        id: `notice_${event.id}`, kind: 'notice', sourceId: event.id,
        title: event.title || '학원 공지', date: event.date, dday,
        responseState: 'info',
        detail: event.memo || undefined,
        imageUrl: event.imageUrl,
      });
      continue;
    }

    const mode = effectiveResponseMode(event);
    const p = participations.get(event.id);
    let responseState: CalendarResponseState = 'info';
    let postTaskLabel: string | undefined;
    let postTaskHref: string | undefined;

    if (mode === 'attendance') {
      responseState = p?.status === 'accepted' ? 'accepted'
        : p?.status === 'declined' ? 'declined'
        : 'needs-response';
    } else if (mode === 'postTask') {
      // 마감일(없으면 종료일/시작일) 기준으로 시작 이후에만 사후과제로 노출
      const started = dday <= 0;
      if (started) {
        responseState = 'post-task';
        postTaskLabel = event.postTaskLabel || '제출하기';
        postTaskHref = event.postTaskHref;
      }
    }
    items.push({
      id: `event_${event.id}`, kind: 'event', sourceId: event.id, title: event.title,
      date: event.date, ...(event.endDate ? { endDate: event.endDate } : {}),
      ...(event.startTime ? { startTime: event.startTime } : {}),
      dday, responseState,
      detail: event.memo || undefined,
      ...(postTaskLabel ? { postTaskLabel } : {}),
      ...(postTaskHref ? { postTaskHref } : {}),
      ...(event.postTaskDueDate ? { postTaskDueDate: event.postTaskDueDate } : {}),
      ...(responseState === 'needs-response' ? { eventRaw: event } : {}),
    });
  }

  // 4) 내 반차/휴식 — 본인 신청 표시(반려 제외). 승인/대기 상태 노출.
  for (const leave of student.leaveRequests || []) {
    if (leave.status === 'rejected') continue;
    const dday = daysUntil(leave.date, todayKey);
    if (dday === null || !within(dday)) continue;
    const statusLabel = leave.status === 'approved' ? '승인됨' : '승인 대기';
    items.push({
      id: `leave_${leave.id}`, kind: 'leave', sourceId: leave.id,
      title: getLeaveTypeLabel(leave.type), date: leave.date, dday,
      responseState: 'info',
      detail: leave.reason ? `${statusLabel} · ${leave.reason}` : statusLabel,
    });
  }

  // 5) 상담 예약 — 예약중(booked)만.
  for (const bk of student.consultationBookings || []) {
    if (bk.status !== 'booked') continue;
    const dday = daysUntil(bk.date, todayKey);
    if (dday === null || !within(dday)) continue;
    items.push({
      id: `consultation_${bk.id}`, kind: 'consultation', sourceId: bk.id,
      title: `${bk.counselor} 상담`, date: bk.date,
      ...(bk.slot ? { startTime: bk.slot } : {}),
      dday, responseState: 'info',
      detail: bk.kind === 'extra' ? '추가 상담' : '정규 상담',
    });
  }

  // 6) 내 일정 — 학생 본인이 작성한 개인 수험 스케줄(표시형, 삭제 가능).
  for (const p of getPersonalSchedule(student)) {
    const dday = daysUntil(p.date, todayKey);
    if (dday === null || !within(dday)) continue;
    items.push({
      id: `personal_${p.id}`, kind: 'personal', sourceId: p.id,
      title: p.title, date: p.date, dday,
      responseState: 'info',
      detail: p.memo || undefined,
    });
  }

  // 7) 주말 보강 — 이번 주 미달 보강(remaining>0)을 이번 주 토·일 셀에 표시. 보강 탭과 동일 단일 소스.
  try {
    const obligations = getMakeupObligations(student, todayKey).filter((o) => o.remaining > 0);
    if (obligations.length > 0) {
      const weekKey = weekKeyOf(todayKey);
      const totalRemaining = obligations.reduce((sum, o) => sum + o.remaining, 0);
      const titles = obligations.map((o) => `${o.subjectName} ${o.materialTitle}`).slice(0, 3).join(', ');
      for (const d of [addDaysToDateKey(weekKey, 5), addDaysToDateKey(weekKey, 6)]) {
        const dday = daysUntil(d, todayKey);
        if (dday === null || !within(dday)) continue;
        items.push({
          id: `makeup_${d}`, kind: 'makeup', sourceId: `makeup_${weekKey}`,
          title: '주말 보강', date: d, dday,
          responseState: 'info',
          detail: `${obligations.length}개 자료 · 남은 ${totalRemaining}개 (${titles})`,
        });
      }
    }
  } catch { /* 보강 계산 실패해도 캘린더는 그대로 */ }

  // 날짜 오름차순 → 같은 날은 종류 순으로 안정화
  const kindOrder: Record<CalendarItemKind, number> = { notice: 0, ot: 1, mock: 2, event: 3, consultation: 4, leave: 5, makeup: 6, personal: 7 };
  items.sort((a, b) => a.date.localeCompare(b.date) || kindOrder[a.kind] - kindOrder[b.kind]);
  return items;
}

// 응답/사후과제가 필요한 항목 수 — 홈 배지 합산용
export function countCalendarActionable(items: StudentCalendarItem[]): number {
  return items.filter((i) => i.responseState === 'needs-response' || i.responseState === 'post-task').length;
}
