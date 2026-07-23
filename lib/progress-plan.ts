import { BookProgress, DetailedPlan, LectureProgress, Student, ReviewPassSetting, MakeupCarryover } from '@/lib/types/student';
import { getCarryoverNet, weekKeyOf } from '@/lib/makeup-carryover';
import { timeSlotBlocks, parseTimeSlot } from '@/lib/academy-timetable';

export type ProgressItemType = 'book' | 'lecture';

export interface ManagedProgressItem {
  studentId: string;
  studentName: string;
  campus: string;
  manager: string;
  nextConsultationDate?: string;
  subjectName: string;
  itemId: string;
  type: ProgressItemType;
  title: string;
  unit: string;             // 표시용 분량 단위 — 교재는 material.unit(기본 p), 인강은 '강'
  total: number;
  current: number;
  targetDate?: string;
  expectedToday: number | null;
  shortage: number | null;
  status: 'ahead' | 'on-track' | 'behind' | 'no-plan';
  // 계획 유형: daily=일일 계획 있음, deadline=기간 목표 전용(미션허브 deriveDeadlineGoals 가 판정), none=목표 미설정
  planKind: 'daily' | 'deadline' | 'none';
  daysToTarget: number | null;
  daysToConsultation: number | null;
}

const DAY_MS = 1000 * 60 * 60 * 24;

function parseDate(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Date → 서울(KST) 캘린더 날짜 문자열(YYYY-MM-DD). toISOString()은 UTC 라 KST 자정~09시 Date 가
// 전날로 밀린다(관리자 브라우저에서 plan 생성 시 일요일 시작 plan 이 만들어지던 버그의 원인).
// plan 날짜 직렬화는 반드시 이걸 쓴다.
const seoulDateStr = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(d);

// 반복 iteration 은 로컬 자정 Date 로 도니 로컬 Y-M-D 로 키를 만든다(leaveRequests.date 와 동일 캘린더 기준).
export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 승인된 결석성 휴가 날짜 집합(YYYY-MM-DD). (레거시: 하루 통째 면제용 — 호환 유지)
export function getLeaveDates(student: Student): Set<string> {
  const dates = new Set<string>();
  for (const req of student.leaveRequests || []) {
    if (req.status !== 'approved') continue;
    if (typeof req.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.date)) dates.add(req.date);
  }
  return dates;
}

// ── 휴가 → 슬롯 면제(부분면제) 유도 ──────────────────────────────────────────
// 반차(오전/오후/야간)는 그 슬롯 분(min)만, 하루종일류(휴식권·병가fullday·개인휴가)는 100% 면제.
// 슬롯 분은 getAvailableMinutes 근거: 오전190 + 오후210 + 야간250 = 하루 650.
const SLOT_MINUTES: Record<'morning' | 'afternoon' | 'night', number> = { morning: 190, afternoon: 210, night: 250 };
const FULL_DAY_MINUTES = SLOT_MINUTES.morning + SLOT_MINUTES.afternoon + SLOT_MINUTES.night; // 650

type ExemptSlot = 'morning' | 'afternoon' | 'night';
export interface LeaveExemption {
  fraction: number;         // 그날 총 면제 비율 (0~1, 복수 반차 합산·캡 1)
  slots: Set<ExemptSlot>;   // 반차로 면제된 슬롯들
  full: boolean;            // 하루종일 면제 여부
}

// defer(면제) 휴가: 정해진 반차(오전/오후/야간)·휴식권(fullday)·쿠폰 교환권 사용.
// 이들은 보강 없이 계획이 밀린다 → 잃은 학습일만큼 창(마감)을 연장한다. makeup-ledger.isDeferLeave 와 동일 규칙.
function isDeferLeaveType(req: { type?: string; usedCredit?: boolean; usedCoupon?: boolean }): boolean {
  if (req.usedCredit || req.usedCoupon) return true;
  const t = req.type;
  return t === 'morning' || t === 'afternoon' || t === 'night' || t === 'fullday';
}

// 승인 휴가를 날짜별 면제로 환산(공용). filter 로 부분집합(예: defer 전용)만 뽑는다.
function buildExemptions(
  student: Student,
  filter?: (req: { type?: string; usedCredit?: boolean; usedCoupon?: boolean }) => boolean,
): Map<string, LeaveExemption> {
  const map = new Map<string, LeaveExemption>();
  for (const req of student.leaveRequests || []) {
    if (req.status !== 'approved') continue;
    if (filter && !filter(req as { type?: string; usedCredit?: boolean; usedCoupon?: boolean })) continue;
    const date = req.date;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const type = req.type as string;
    const rawSlot = (req as unknown as { slot?: string }).slot;
    let slot: ExemptSlot | 'fullday';
    if (type === 'morning' || type === 'afternoon' || type === 'night') slot = type;
    else if (type === 'fullday' || type === 'personal_fullday') slot = 'fullday';
    else if (rawSlot === 'morning' || rawSlot === 'afternoon' || rawSlot === 'night') slot = rawSlot;
    else slot = 'fullday'; // 병가(슬롯 미지정)·기타 → 하루종일
    const cur = map.get(date) || { fraction: 0, slots: new Set<ExemptSlot>(), full: false };
    if (slot === 'fullday') {
      cur.full = true;
      cur.fraction = 1;
    } else {
      cur.slots.add(slot);
      cur.fraction = Math.min(1, cur.fraction + SLOT_MINUTES[slot] / FULL_DAY_MINUTES);
      if (cur.slots.size >= 3) { cur.full = true; cur.fraction = 1; }
    }
    map.set(date, cur);
  }
  return map;
}

// 승인된(자동승인 포함) 결석성 휴가를 날짜별 면제로 환산(전체 — 뒤처짐 기대치 discount용).
export function getLeaveExemptions(student: Student): Map<string, LeaveExemption> {
  return buildExemptions(student);
}

// defer(정해진 반차/휴식·쿠폰권)만 날짜별 면제로 — 창(마감) 연장 계산용. 개인사정/병가는 제외(주말 보강 대상).
export function getDeferLeaveExemptions(student: Student): Map<string, LeaveExemption> {
  return buildExemptions(student, isDeferLeaveType);
}

// 날짜별 총 면제 비율 맵(deadline % 축소용).
export function getLeaveFractionByDate(student: Student): Map<string, number> {
  const out = new Map<string, number>();
  getLeaveExemptions(student).forEach((v, k) => out.set(k, v.fraction));
  return out;
}

// 특정 자료(과목 studyTime 기준) 그날 면제 비율 — 일일계획 슬롯-특정용.
// 슬롯 배정 과목: 그 슬롯이 반차면 전액(1), 다른 슬롯이면 0. studyTime 없으면 비율 폴백.
// 시:분 슬롯('t:HH:MM-HH:MM')은 겹치는 블록으로 환산해 판정(부분 겹침은 블록 비율 근사).
export function materialLeaveFractionOnDate(exempt: LeaveExemption | undefined, subjectStudyTime?: string): number {
  if (!exempt) return 0;
  if (exempt.full) return 1;
  if (subjectStudyTime === 'morning' || subjectStudyTime === 'afternoon' || subjectStudyTime === 'night') {
    return exempt.slots.has(subjectStudyTime) ? 1 : 0;
  }
  const blocks = timeSlotBlocks(subjectStudyTime);
  if (blocks.length > 0) {
    const hit = blocks.filter((b) => exempt.slots.has(b));
    if (hit.length === 0) return 0;
    return hit.length === blocks.length ? 1 : hit.length / blocks.length;
  }
  return exempt.fraction;
}

function diffDays(from: Date, to?: string) {
  const date = parseDate(to);
  if (!date) return null;
  return Math.ceil((date.getTime() - from.getTime()) / DAY_MS);
}

function parsePlanEndAmount(plan: DetailedPlan) {
  const matches = plan.rangeText.match(/\d+/g);
  if (!matches || matches.length === 0) return plan.targetAmount;
  return Number(matches[matches.length - 1]) || plan.targetAmount;
}

function parsePlanBounds(plan: DetailedPlan) {
  const values = plan.rangeText.match(/\d+/g)?.map(Number).filter(Number.isFinite) || [];
  const end = values.length > 0 ? values[values.length - 1] : Number(plan.targetAmount || 0);
  const start = values.length > 1
    ? values[values.length - 2]
    : Math.max(1, end - Number(plan.targetAmount || 0) + 1);
  return { start, end };
}

export function countStudyDaysInRange(start: Date, end: Date, studyDays?: string[], leaveDates?: Set<string>) {
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setHours(0, 0, 0, 0);

  let count = 0;
  while (cursor <= last) {
    if (isStudyDay(cursor, studyDays) && !(leaveDates && leaveDates.has(toDateKey(cursor)))) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

// from 이후 n 학습일 뒤의 날짜(비학습일 건너뜀). n<=0 이면 from 그대로.
function addStudyDays(from: Date, n: number, studyDays?: string[]): Date {
  const d = new Date(from); d.setHours(0, 0, 0, 0);
  const target = Math.round(n);
  let added = 0;
  while (added < target) {
    d.setDate(d.getDate() + 1);
    if (isStudyDay(d, studyDays)) added++;
  }
  return d;
}

// [start,end] 창 안에서 defer 휴가로 잃은 학습일 수(자료 슬롯 기준 부분면제 합). 창 연장폭.
function deferStudyDaysInWindow(
  start: Date, end: Date, studyDays: string[] | undefined,
  deferExemptions: Map<string, LeaveExemption>, subjectStudyTime?: string,
): number {
  let sum = 0;
  const cur = new Date(start); cur.setHours(0, 0, 0, 0);
  const last = new Date(end); last.setHours(0, 0, 0, 0);
  while (cur <= last) {
    if (isStudyDay(cur, studyDays)) sum += materialLeaveFractionOnDate(deferExemptions.get(toDateKey(cur)), subjectStudyTime);
    cur.setDate(cur.getDate() + 1);
  }
  return sum;
}

// 자료의 모든 일일계획에 걸친 defer 창 연장폭(학습일). effectiveTargetDate = targetDate + 이만큼.
export function deferExtensionStudyDays(
  plans: DetailedPlan[] | undefined, studyDays: string[] | undefined,
  deferExemptions: Map<string, LeaveExemption>, subjectStudyTime?: string,
): number {
  let sum = 0;
  for (const plan of plans || []) {
    if (plan.periodType) continue;
    const s = parseDate(plan.startDate); const e = parseDate(plan.endDate);
    if (!s || !e) continue;
    sum += deferStudyDaysInWindow(s, e, studyDays, deferExemptions, subjectStudyTime);
  }
  return sum;
}

// targetDate 를 defer 휴가로 잃은 학습일만큼 뒤로 민 값(표시·daysToTarget용). defer 없으면 원본.
export function getEffectiveTargetDate(
  targetDate: string | undefined, plans: DetailedPlan[] | undefined, studyDays: string[] | undefined,
  deferExemptions: Map<string, LeaveExemption>, subjectStudyTime?: string,
): string | undefined {
  if (!targetDate) return targetDate;
  const ext = deferExtensionStudyDays(plans, studyDays, deferExemptions, subjectStudyTime);
  if (ext < 0.5) return targetDate;
  const base = parseDate(targetDate);
  if (!base) return targetDate;
  return toDateKey(addStudyDays(base, ext, studyDays));
}

function getExpectedWithinCurrentPlan(plan: DetailedPlan, today: Date, studyDays?: string[], createdAt?: string, inclusiveToday = false, leaveDates?: Set<string>, leaveExemptions?: Map<string, LeaveExemption>, subjectStudyTime?: string) {
  const start = parseDate(plan.startDate);
  const end = parseDate(plan.endDate);
  if (!start || !end) return parsePlanEndAmount(plan);

  const { start: startAmount, end: endAmount } = parsePlanBounds(plan);
  const beforePlanAmount = Math.max(0, startAmount - 1);

  // "오늘 기준 권장"은 오늘 시작 시점에 이미 끝냈어야 할 분량이다.
  // 경과 학습일은 (1) 학생 등록일 이후(등록 전 요일은 아직 학원생도 아니었으므로 제외),
  // (2) 오늘 이전(오늘치 분량은 아직 학습 중이라 제외)인 학습일만 센다.
  // inclusiveToday=true면 오늘까지 포함(오늘 종료 시점 누적 기대치)을 계산한다.
  const enrolledStart = parseDate(createdAt);
  const effectiveStart = enrolledStart && enrolledStart > start ? enrolledStart : start;
  const upperBound = new Date(today);
  if (!inclusiveToday) upperBound.setDate(today.getDate() - 1);
  // 경과 학습일에서 휴가분 제외(분모 totalStudyDays 는 그대로 — 면제분은 보강 어드바이저리로 남김).
  // leaveExemptions 제공 시: 슬롯-특정 부분면제(반차는 그 슬롯 과목만/과목 studyTime 없으면 비율).
  // 미제공 시: 레거시 leaveDates(하루 통째) 폴백.
  let elapsedStudyDays: number;
  if (leaveExemptions) {
    let sum = 0;
    const cur = new Date(effectiveStart); cur.setHours(0, 0, 0, 0);
    const last = new Date(upperBound); last.setHours(0, 0, 0, 0);
    while (cur <= last) {
      if (isStudyDay(cur, studyDays)) sum += 1 - materialLeaveFractionOnDate(leaveExemptions.get(toDateKey(cur)), subjectStudyTime);
      cur.setDate(cur.getDate() + 1);
    }
    elapsedStudyDays = sum;
  } else {
    elapsedStudyDays = countStudyDaysInRange(effectiveStart, upperBound, studyDays, leaveDates);
  }
  if (elapsedStudyDays <= 0) return beforePlanAmount;

  const totalStudyDays = Math.max(1, countStudyDaysInRange(start, end, studyDays));
  const dailyAmount = Math.max(1, Math.round(plan.dailyAmount ?? Math.ceil((plan.targetAmount || 1) / totalStudyDays)));
  return Math.min(endAmount, Math.round(beforePlanAmount + dailyAmount * elapsedStudyDays));
}

function isSameDay(a: Date | null, b: Date) {
  return Boolean(a && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate());
}

export function getExpectedFromPlans(plans: DetailedPlan[] | undefined, today: Date, studyDays?: string[], createdAt?: string, inclusiveToday = false, leaveDates?: Set<string>, leaveExemptions?: Map<string, LeaveExemption>, subjectStudyTime?: string, deferExemptions?: Map<string, LeaveExemption>) {
  if (!plans || plans.length === 0) return null;

  // 기간 목표(periodType) plan 은 일일 진도 기대치 계산에서 제외(요일 무관·별도 페이스로 판정).
  const dailyPlans = plans.filter((p) => !p.periodType);
  if (dailyPlans.length === 0) return null;

  const sortedPlans = [...dailyPlans].sort((a, b) => a.startDate.localeCompare(b.startDate));
  let latestPastPlan: DetailedPlan | null = null;

  for (const plan of sortedPlans) {
    const start = parseDate(plan.startDate);
    const end = parseDate(plan.endDate);
    if (!start || !end) continue;

    // defer(정해진 반차/휴식) 휴가로 잃은 학습일만큼 창 끝을 뒤로 민다 → 창-끝 절벽 제거(마감 밀기).
    // deferExemptions 미제공 시 원래 end(동작 불변).
    const effEnd = deferExemptions
      ? addStudyDays(end, deferStudyDaysInWindow(start, end, studyDays, deferExemptions, subjectStudyTime), studyDays)
      : end;

    if (today < start) {
      return latestPastPlan ? parsePlanEndAmount(latestPastPlan) : 0;
    }

    if (today <= effEnd) {
      return getExpectedWithinCurrentPlan(plan, today, studyDays, createdAt, inclusiveToday, leaveDates, leaveExemptions, subjectStudyTime);
    }

    latestPastPlan = plan;
  }

  return latestPastPlan ? parsePlanEndAmount(latestPastPlan) : null;
}

function buildItem(
  student: Student,
  subjectName: string,
  material: BookProgress | LectureProgress,
  type: ProgressItemType,
  today: Date,
  studyDays?: string[],
  leaveDates?: Set<string>,
  leaveExemptions?: Map<string, LeaveExemption>,
  subjectStudyTime?: string,
  deferExemptions?: Map<string, LeaveExemption>,
): ManagedProgressItem {
  const total = type === 'book'
    ? (material as BookProgress).totalPages
    : (material as LectureProgress).totalLectures;
  const current = type === 'book'
    ? (material as BookProgress).currentPage
    : (material as LectureProgress).completedLectures;
  const title = type === 'book'
    ? (material as BookProgress).title
    : (material as LectureProgress).name;

  const isCreatedToday = isSameDay(parseDate(student.createdAt), today);
  const isMaterialTouchedToday = isSameDay(parseDate(material.updatedAt), today);
  const isFreshToday = isCreatedToday || isMaterialTouchedToday;
  const progressBaselineDate = isFreshToday ? (material.updatedAt || student.createdAt) : student.createdAt;
  const allPlans = material.detailedPlans || [];
  const planKind: ManagedProgressItem['planKind'] = allPlans.length === 0
    ? 'none'
    : allPlans.some((p) => !p.periodType)
    ? 'daily'
    : 'deadline';
  // 목표(계획) 미설정 자료는 달력 선형 추정(과거 getExpectedLinear 폴백)으로 뒤처짐을 만들지
  // 않는다 — 기대치 null → 판정 제외(no-plan). 기간 목표(deadline) 전용 자료도 여기서는 null
  // (deriveDeadlineGoals 가 마감 위험 판정의 단일 소스).
  // 반차 슬롯-특정 면제는 자료별 슬롯 기준 — 자료 studyTime(관리자 지정) 우선, 없으면 과목 studyTime.
  const effectiveStudyTime = material.studyTime || subjectStudyTime;
  const rawExpectedToday = getExpectedFromPlans(material.detailedPlans, today, studyDays, progressBaselineDate, false, leaveDates, leaveExemptions, effectiveStudyTime, deferExemptions);
  // defer(정해진 반차/휴식)로 잃은 학습일만큼 표시 마감을 뒤로 민다(daysToTarget 도 동일 기준).
  const effectiveTargetDate = deferExemptions
    ? getEffectiveTargetDate(material.targetDate, material.detailedPlans, studyDays, deferExemptions, effectiveStudyTime)
    : material.targetDate;
  const expectedToday = rawExpectedToday === null
    ? null
    : isFreshToday
    ? current
    : rawExpectedToday;
  const shortage = expectedToday === null ? null : Math.max(0, expectedToday - current);
  const status = expectedToday === null
    ? 'no-plan'
    : isFreshToday
    ? 'on-track'
    : current + 1 < expectedToday
    ? 'behind'
    : current >= expectedToday
    ? 'ahead'
    : 'on-track';

  return {
    studentId: student.id,
    studentName: student.name,
    campus: student.campus,
    manager: student.manager,
    nextConsultationDate: student.nextConsultationDate,
    subjectName,
    itemId: material.id,
    type,
    title,
    unit: type === 'book' ? ((material as BookProgress).unit || 'p') : '강',
    total,
    current,
    targetDate: effectiveTargetDate,
    expectedToday,
    shortage,
    status,
    planKind,
    daysToTarget: diffDays(today, effectiveTargetDate),
    daysToConsultation: diffDays(today, student.nextConsultationDate),
  };
}

export function getManagedProgressItems(students: Student[], today = new Date()): ManagedProgressItem[] {
  // 호출자가 넘긴 Date 를 파괴하지 않도록 복제본을 자정 정규화한다.
  const day = new Date(today);
  day.setHours(0, 0, 0, 0);

  return students.flatMap((student) => {
    const leaveDates = getLeaveDates(student);
    const exemptions = getLeaveExemptions(student);
    const deferExemptions = getDeferLeaveExemptions(student);
    if (student.subjects && student.subjects.length > 0) {
      return student.subjects.flatMap((subject) => [
        ...(subject.books || []).map((book) => buildItem(student, subject.name, book, 'book', day, getMaterialStudyDays(subject.studyDays, book.studyDays), leaveDates, exemptions, subject.studyTime, deferExemptions)),
        ...(subject.lectures || []).map((lecture) => buildItem(student, subject.name, lecture, 'lecture', day, getMaterialStudyDays(subject.studyDays, lecture.studyDays), leaveDates, exemptions, subject.studyTime, deferExemptions)),
      ]);
    }

    return [
      ...(student.books || []).map((book) => buildItem(student, '기본', book, 'book', day, undefined, leaveDates, exemptions, undefined, deferExemptions)),
      ...(student.lectures || []).map((lecture) => buildItem(student, '기본', lecture, 'lecture', day, undefined, leaveDates, exemptions, undefined, deferExemptions)),
    ];
  });
}

// getMakeupAmount — 파생 보강량(창 스코프 + 쿠폰 이월 net). 주말 보강 원장(lib/makeup-ledger.ts)으로
// 표시는 이관됐으나, pace 회귀 검증 하네스(scripts/verify-leave-plan-scenarios.mts)가 이 함수를 참조하므로 유지한다.
export function getMakeupAmount(
  material: BookProgress | LectureProgress,
  today: Date,
  studyDays: string[] | undefined,
  leaveDates: Set<string>,
  leaveExemptions?: Map<string, LeaveExemption>,
  subjectStudyTime?: string,
  carryovers?: MakeupCarryover[],
): { makeupTotal: number; perDay: number } {
  const day = new Date(today);
  day.setHours(0, 0, 0, 0);
  const plans = (material.detailedPlans || []).filter((p) => !p.periodType);
  const active = plans.find((p) => {
    const s = parseDate(p.startDate);
    const e = parseDate(p.endDate);
    return s && e && s <= day && day <= e;
  });
  if (!active) return { makeupTotal: 0, perDay: 0 };

  const start = parseDate(active.startDate);
  const end = parseDate(active.endDate);
  if (!start || !end) return { makeupTotal: 0, perDay: 0 };
  const dailyAmount = Math.max(1, Math.round(active.dailyAmount ?? Math.ceil((active.targetAmount || 1) / 6)));

  const yesterday = new Date(day);
  yesterday.setDate(day.getDate() - 1);
  // 오늘 이전의 휴가 면제분을 합산 — leaveExemptions 제공 시 슬롯-특정 부분면제(반차는 그 슬롯만),
  // 미제공 시 레거시 하루통째(leaveDates) 폴백.
  let leaveDaysWeighted = 0;
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  while (cur <= yesterday && cur <= end) {
    if (isStudyDay(cur, studyDays)) {
      leaveDaysWeighted += leaveExemptions
        ? materialLeaveFractionOnDate(leaveExemptions.get(toDateKey(cur)), subjectStudyTime)
        : (leaveDates.has(toDateKey(cur)) ? 1 : 0);
    }
    cur.setDate(cur.getDate() + 1);
  }
  const baseTotal = Math.round(leaveDaysWeighted * dailyAmount);
  // 이월 오버레이: 이번 주에서 나간(out) 만큼 이번 주 보강 감소, 들어온(in) 만큼 증가.
  const wk = weekKeyOf(toDateKey(day));
  const net = carryovers && carryovers.length ? getCarryoverNet(carryovers, material.id, wk) : { out: 0, in: 0 };
  const makeupTotal = Math.max(0, baseTotal - net.out + net.in);
  if (makeupTotal <= 0) return { makeupTotal: 0, perDay: 0 };
  // 남은 학습일(오늘~창끝) — 분자(leaveDaysWeighted)와 대칭이 되도록 반차는 부분(1−fraction)만 제외한다.
  // leaveDates 로 통째 제외하면 미래 반차일이 통으로 빠져 remaining 이 과소집계→perDay 가 과대평가됨.
  let remaining: number;
  if (leaveExemptions) {
    let sum = 0;
    const rc = new Date(day); rc.setHours(0, 0, 0, 0);
    while (rc <= end) {
      if (isStudyDay(rc, studyDays)) sum += 1 - materialLeaveFractionOnDate(leaveExemptions.get(toDateKey(rc)), subjectStudyTime);
      rc.setDate(rc.getDate() + 1);
    }
    remaining = sum;
  } else {
    remaining = countStudyDaysInRange(day, end, studyDays, leaveDates); // 레거시: 하루 통째 제외
  }
  // 부분면제 합산으로 remaining 이 0<remaining<1 인 분수가 될 수 있다 — 그대로 나누면
  // perDay 가 makeupTotal 을 초과하므로 총량으로 캡한다.
  const perDay = remaining > 0 ? Math.min(makeupTotal, Math.ceil(makeupTotal / remaining)) : makeupTotal;
  return { makeupTotal, perDay };
}

export function getEstimatedStudyTimeMin(
  unit: string | undefined,
  amount: number,
  type: ProgressItemType,
  estimatedMinutesPerUnit?: number
): number {
  // 개별 설정값(estimatedMinutesPerUnit)이 있는 경우 최우선 적용
  if (estimatedMinutesPerUnit !== undefined && estimatedMinutesPerUnit !== null && estimatedMinutesPerUnit > 0) {
    return amount * estimatedMinutesPerUnit;
  }

  const rawUnit = (unit || '').toLowerCase().trim();
  if (type === 'lecture' || rawUnit.includes('강')) {
    return amount * 60; // 기본 1시간 (60분)
  }
  if (rawUnit.includes('p') || rawUnit.includes('페이지') || rawUnit.includes('쪽')) {
    return amount * 1.5;
  }
  if (rawUnit.includes('회')) {
    return amount * 50;
  }
  if (rawUnit.includes('문제')) {
    return amount * 2;
  }
  if (rawUnit.includes('시간')) {
    return amount * 60; // 시간 단위 자료 — 1단위 = 60분(분 정규화 집계·기간 목표 페이스의 기준)
  }
  if (rawUnit.includes('장')) {
    return amount * 10;
  }
  if (rawUnit.includes('단원') || rawUnit.includes('ch') || rawUnit.includes('chapter')) {
    return amount * 60;
  }
  if (rawUnit.includes('일차')) {
    return amount * 30;
  }
  return amount * 15; // 기본값
}

// 자료 1단위(1페이지·1강·1문제 등)의 예상 소요 분. 기간 목표(모드 B) 분 정규화 집계의 단일 소스.
// getEstimatedStudyTimeMin 을 재사용하고, 인강(lecture)은 배속(speedMultiplier)을 반영해 시간을 줄인다.
// 단, 문제풀이(category==='문제풀이') 인강은 실제 풀이 시간이 배속과 무관하므로 배속을 적용하지 않는다.
export function getPlanUnitMinutes(
  type: ProgressItemType,
  unit: string | undefined,
  estimatedMinutesPerUnit?: number,
  speedMultiplier = 1,
  category?: string,
): number {
  const base = getEstimatedStudyTimeMin(unit, 1, type, estimatedMinutesPerUnit);
  if (type === 'lecture' && category !== '문제풀이') {
    const speed = speedMultiplier > 0 ? speedMultiplier : 1;
    return base / speed;
  }
  return base;
}

// 기간 목표(periodType==='deadline') plan 의 오늘 기준 페이스 스냅샷.
// - 학습일(studyDays, 미설정 시 월~토) 기준으로 경과 비율을 계산해 "오늘까지 누적 기대량"을 낸다.
// - unitMinutes 는 분 정규화 집계용으로 호출자가 곱해 쓴다(여기서는 단위량 기준으로만 계산).
export function getDeadlinePace(
  plan: DetailedPlan,
  unitMinutes: number,
  today: Date,
  studyDays?: string[],
  leaveByDate?: Map<string, number>, // 날짜별 총 면제비율(0~1) — 휴가일은 그만큼 경과에서 감산
): {
  totalStudyDays: number;
  elapsedStudyDays: number;
  expectedRatio: number;
  expectedAmount: number;
  expectedRatioPrior: number;
  actualAmount: number;
  behind: boolean;
  todayRecommend: number;
  aheadUnits: number;
  unitMinutes: number;
} {
  const start = parseDate(plan.startDate) || new Date(today);
  const end = parseDate(plan.endDate) || new Date(today);
  const day = new Date(today);
  day.setHours(0, 0, 0, 0);

  // 학습일 수를 세되 하한(Math.max(1,..)) 없이 — 기간 시작 전/당일이면 0 이 나와야 한다.
  // 휴가일은 면제비율만큼 감산해 가중 경과(분수 가능)로 센다: 오후반차일=0.677, 병가(하루)=0.
  const countRaw = (a: Date, b: Date) => {
    if (b < a) return 0;
    const cur = new Date(a); cur.setHours(0, 0, 0, 0);
    const last = new Date(b); last.setHours(0, 0, 0, 0);
    let c = 0;
    while (cur <= last) {
      if (isStudyDay(cur, studyDays)) {
        const ex = leaveByDate ? Math.min(1, Math.max(0, leaveByDate.get(toDateKey(cur)) || 0)) : 0;
        c += 1 - ex;
      }
      cur.setDate(cur.getDate() + 1);
    }
    return c;
  };

  const totalStudyDays = Math.max(1, countStudyDaysInRange(start, end, studyDays));
  // 포함(오늘까지) — "오늘까지 했어야 할" 표시/달성 판정용.
  const cappedToday = day > end ? end : day;
  const elapsedStudyDays = Math.min(totalStudyDays, countRaw(start, cappedToday));
  // 이전(어제까지) — 뒤처짐/위험 판정용. 오늘 몫을 아직 안 했다고 위험으로 보지 않는다(당일등록·당일수정 보호).
  const yesterday = new Date(day); yesterday.setDate(day.getDate() - 1);
  const cappedPrior = yesterday > end ? end : yesterday;
  const elapsedPrior = Math.min(totalStudyDays, countRaw(start, cappedPrior));

  const targetAmount = Math.max(0, Number(plan.targetAmount || 0));
  const expectedRatio = totalStudyDays > 0 ? Math.min(1, elapsedStudyDays / totalStudyDays) : 0;
  const expectedRatioPrior = totalStudyDays > 0 ? Math.min(1, elapsedPrior / totalStudyDays) : 0;
  const expectedAmount = Math.round(targetAmount * expectedRatio);
  const expectedPriorAmount = Math.round(targetAmount * expectedRatioPrior);
  const actualAmount = Math.max(0, Number(plan.actualAmount || 0));
  const behind = actualAmount < expectedPriorAmount;
  const aheadUnits = Math.max(0, actualAmount - expectedAmount);

  // 오늘 권장: 오늘이 학습일이면 (남은량 / 남은 학습일)로 오늘 몫을 낸다. 아니면 0.
  const remainingAmount = Math.max(0, targetAmount - actualAmount);
  let todayRecommend = 0;
  if (isStudyDay(day, studyDays) && day <= end) {
    const remainingStudyDays = Math.max(1, countStudyDaysInRange(day, end, studyDays));
    // 오늘이 휴가면 그 비율만큼 오늘 권장을 축소(온전한 학습일이 아님).
    const todayExempt = leaveByDate ? Math.min(1, Math.max(0, leaveByDate.get(toDateKey(day)) || 0)) : 0;
    todayRecommend = Math.ceil((remainingAmount / remainingStudyDays) * (1 - todayExempt));
  }

  return {
    totalStudyDays,
    elapsedStudyDays,
    expectedRatio,
    expectedAmount,
    expectedRatioPrior,
    actualAmount,
    behind,
    todayRecommend,
    aheadUnits,
    unitMinutes,
  };
}

export function getStudentTodayTotalStudyTimeMin(student: Student, todayStr?: string): number {
  const targetDateStr = todayStr || seoulDateStr(new Date()); // 기본 오늘 = KST 캘린더 (UTC 밀림 방지)
  let totalMin = 0;

  const checkPlan = (
    plans: DetailedPlan[] | undefined,
    unit: string | undefined,
    type: ProgressItemType,
    estimatedMinutesPerUnit?: number,
    lectureSpeedMultiplier = 1.0
  ) => {
    if (!plans) return;
    // 기간 목표(periodType) plan 은 일일 시간표 예산에 넣지 않는다(요일 무관·별도 페이스 집계).
    const todayPlan = plans.find(p => !p.periodType && p.startDate <= targetDateStr && targetDateStr <= p.endDate);
    if (todayPlan) {
      const dayIndex = new Date(targetDateStr).getDay();
      const dayKeys: Array<'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'> = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
      const todayKey = dayKeys[dayIndex];
      
      let isStudyDay = todayKey !== 'sun';
      if (student.subjects) {
        const parentSubject = student.subjects.find(sub =>
          (sub.books || []).some(b => b.id === todayPlan.materialId) ||
          (sub.lectures || []).some(l => l.id === todayPlan.materialId)
        );
        // 자료별 요일 우선, 없으면 과목 요일 폴백.
        const material = parentSubject && (
          (parentSubject.books || []).find(b => b.id === todayPlan.materialId) ||
          (parentSubject.lectures || []).find(l => l.id === todayPlan.materialId)
        );
        const effectiveDays = getMaterialStudyDays(parentSubject?.studyDays, material?.studyDays);
        if (effectiveDays && effectiveDays.length > 0) {
          isStudyDay = effectiveDays.includes(todayKey);
        }
      }

      if (isStudyDay) {
        // ?? — dailyAmount 가 명시적 0 이면 0 으로 존중(|| 는 0 을 미설정으로 오인해 폴백).
        const dailyAmount = todayPlan.dailyAmount ?? Math.ceil(todayPlan.targetAmount / 6);
        let planMin = getEstimatedStudyTimeMin(unit, dailyAmount, type, estimatedMinutesPerUnit);
        if (type === 'lecture') {
          planMin = planMin / lectureSpeedMultiplier;
        }
        totalMin += planMin;
      }
    }
  };

  if (student.subjects) {
    student.subjects.forEach(sub => {
      (sub.books || []).forEach(b => checkPlan(b.detailedPlans, b.unit, 'book', b.estimatedMinutesPerUnit));
      (sub.lectures || []).forEach(l => checkPlan(l.detailedPlans, '강', 'lecture', l.estimatedMinutesPerUnit, l.speedMultiplier));
    });
  } else {
    (student.books || []).forEach(b => checkPlan(b.detailedPlans, b.unit, 'book', b.estimatedMinutesPerUnit));
    (student.lectures || []).forEach(l => checkPlan(l.detailedPlans, '강', 'lecture', l.estimatedMinutesPerUnit, l.speedMultiplier));
  }

  // 소수점 없이 완전한 정수(분) 단위로 반올림하여 반환
  return Math.round(totalMin);
}

export function getActiveStudyDays(studyDays?: string[]) {
  return studyDays && studyDays.length > 0 ? studyDays : ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
}

// 자료(교재/강의)의 유효 학습 요일 — 요일은 자료 단위 단일 소스다.
// 첫 인자(subjectStudyDays)는 하위호환을 위해 시그니처만 유지하며 무시한다(과목→자료 폴백 제거).
// 자료 요일이 없으면 undefined 를 반환해 getActiveStudyDays 기본값(월~토)으로 처리된다.
export function getMaterialStudyDays<T extends string>(
  _subjectStudyDays: T[] | undefined,
  materialStudyDays?: T[],
): T[] | undefined {
  return materialStudyDays && materialStudyDays.length > 0 ? materialStudyDays : undefined;
}

export function isStudyDay(date: Date, studyDays?: string[]) {
  const dayMap: Record<number, string> = {
    0: 'sun',
    1: 'mon',
    2: 'tue',
    3: 'wed',
    4: 'thu',
    5: 'fri',
    6: 'sat',
  };
  return getActiveStudyDays(studyDays).includes(dayMap[date.getDay()]);
}

export function getAvailableMinutes(studyTime?: string) {
  if (studyTime === 'morning') return 190;
  if (studyTime === 'afternoon') return 210;
  if (studyTime === 'night') return 250;
  // 시:분 직접지정('t:HH:MM-HH:MM') — 구간 길이를 그대로 가용시간으로 사용
  const parsed = parseTimeSlot(studyTime);
  if (parsed && parsed.endMin > parsed.startMin) return parsed.endMin - parsed.startMin;
  return 650; // 기본 전체 자습 시간
}

export function generateDetailedPlans(
  materialId: string,
  totalAmount: number,
  type: 'book' | 'lecture',
  goalType: 'weeks' | 'weeklyAmount' | 'dailyAmount' | 'deadlineWeeks' | 'selfPaced',
  goalValue: number,
  currentAmount = 0,
  customUnit?: string,
  reviewPasses: ReviewPassSetting[] = [],
  studyDays?: string[],
  lectureSpeedMultiplier = 1.0,
  estimatedMinutesPerUnit?: number,
  studyTime?: string,
  category?: string,
  // 계획 시작일(YYYY-MM-DD). 미지정=오늘(레거시). 지정 시 이 날짜를 계획 기준점(anchor)으로 잡아
  // "내일부터"/"다음 주부터" 시작을 만든다. 아래 today 변수를 anchor 로 재사용한다.
  startDateStr?: string,
  // 마감일(YYYY-MM-DD, deadlineWeeks 전용). 지정 시 1회독 주차 창을 이 날짜에서 절단해
  // 계획이 학생이 고른 마감일을 넘어가지 않게 한다(마지막 주가 7일 미만이 될 수 있음).
  deadlineDateStr?: string
): { plans: DetailedPlan[], calculatedTargetDate: string } {
  const plans: DetailedPlan[] = [];
  // 명시 시작일이 유효하면 그 날짜를, 아니면 오늘을 기준점으로 쓴다(변수명은 today 유지 — 내부 전 참조 재사용).
  const explicitStart = Boolean(startDateStr && /^\d{4}-\d{2}-\d{2}$/.test(startDateStr));
  const today = (explicitStart ? parseDate(startDateStr) : null) ?? new Date();
  today.setHours(0, 0, 0, 0);

  // 자율 입력(selfPaced): 목표 분량·마감·계획이 없다. 계획을 만들지 않고 빈 목록을 돌려준다
  // (학생이 그날 한 만큼 누적 입력만 하며, 뒤처짐/마감 판정에서 제외된다).
  if (goalType === 'selfPaced') {
    return { plans, calculatedTargetDate: seoulDateStr(today) };
  }

  const safeCurrentAmount = Math.min(totalAmount, Math.max(0, Math.round(currentAmount)));
  const planAmount = Math.max(0, totalAmount - safeCurrentAmount);

  if (planAmount <= 0 && reviewPasses.length === 0) {
    return { plans, calculatedTargetDate: seoulDateStr(today) };
  }

  const activeStudyDays = getActiveStudyDays(studyDays);
  const daysCountPerWeek = activeStudyDays.length;

  // 기준점(today)을 '시작일 이후 첫 학습일'로 당긴다. 시작일이 학습일이 아니거나, 특히 첫 주에
  // 학습일이 아예 없는 경우(예: 목요일 시작 + 월·화만 → 그 주엔 월·화가 없음) 빈 주에 목표가
  // 잘못 배정(0강이어야 할 주에 하루치)되던 문제를 방지한다. 학습이 실제 시작되는 날부터 계획.
  if (daysCountPerWeek > 0) {
    let guard = 0;
    while (!isStudyDay(today, studyDays) && guard < 14) {
      today.setDate(today.getDate() + 1);
      guard++;
    }
  }

  // 1. 인강 하루 한계 학습량 계산 (문제풀이가 아닌 경우만 제한)
  let maxLecturesPerDay = Infinity;
  if (type === 'lecture' && category !== '문제풀이') {
    const actualDuration = (estimatedMinutesPerUnit || 60) / lectureSpeedMultiplier;
    const availableMinutes = getAvailableMinutes(studyTime);
    maxLecturesPerDay = Math.max(1, Math.floor(availableMinutes / actualDuration));
  }

  // 2. 시간표 한계에 따른 목표 값 보정
  // (weeklyAmount 는 아래 기간 목표 창 분기로 빠지므로 여기서는 dailyAmount 만 보정)
  let adjustedGoalValue = goalValue;
  if (type === 'lecture' && category !== '문제풀이' && maxLecturesPerDay !== Infinity) {
    if (goalType === 'dailyAmount' && goalValue > maxLecturesPerDay) {
      adjustedGoalValue = maxLecturesPerDay;
    }
  }

  const dayOfWeek = today.getDay();
  const startOfWeek = new Date(today);
  if (dayOfWeek === 0 && isStudyDay(today, studyDays)) {
    startOfWeek.setDate(today.getDate() - 6);
  } else if (dayOfWeek === 0) {
    startOfWeek.setDate(today.getDate() + 1);
  } else {
    startOfWeek.setDate(today.getDate() - (dayOfWeek - 1));
  }

  const getStudyDaysInWeek = (weekStart: Date, fromDate?: Date) => {
    let studyDayCount = 0;
    const lowerBound = fromDate ? new Date(fromDate) : new Date(weekStart);
    lowerBound.setHours(0, 0, 0, 0);

    for (let offset = 0; offset <= 6; offset++) {
      const targetDate = new Date(weekStart);
      targetDate.setDate(weekStart.getDate() + offset);
      targetDate.setHours(0, 0, 0, 0);
      if (targetDate < lowerBound) continue;
      if (!isStudyDay(targetDate, studyDays)) continue;
      studyDayCount++;
    }
    return Math.max(1, studyDayCount);
  };

  // ── 모드 B: 기간 목표 주차 계획 ─────────────────────────────────────
  // deadlineWeeks = N주 안에 완주. 표/완료 입력은 주차 단위로 이뤄지므로
  // N주짜리 단일 창이 아니라 1주짜리 plan N개로 나눠 저장한다.
  // 미션은 periodType==='deadline' 을 버킷으로 인식해 현재 활성 주차를 판정한다.
  if (goalType === 'deadlineWeeks' || goalType === 'weeklyAmount') {
    const unit = customUnit || (type === 'book' ? 'p' : '강');
    // 기간 목표는 "지금부터 N주 안에 끝내기" — 생성/수정 시점(오늘)을 기간 시작으로 잡는다.
    // (이번 주 월요일 기준으로 잡으면 주중 당일등록·당일수정 학생이 곧바로 며칠 뒤처진 것으로 표시됨)
    // 각 회독은 직전 창 다음날부터 이어붙인다.
    let phaseStart = new Date(today);

    // 날짜 직렬화는 모듈 상단 seoulDateStr(KST) 사용 — toISOString()은 UTC라 KST 자정이 전날로
    // 밀려(당일이 어제로 저장) 당일등록 학생이 하루 뒤처진 것으로 계산되던 문제를 막는다.
    const appendDeadlineWeeks = (
      passNumber: number,
      windowStart: Date,
      weeks: number,
      amount: number,
      baseAmount: number,
      weeklyLimit?: number,
      capDate?: Date,
    ) => {
      const safeWeeks = Math.max(1, Math.min(12, Math.round(weeks)));
      const totalAmount = Math.max(0, Math.round(amount));
      let currentStart = new Date(windowStart);
      currentStart.setHours(0, 0, 0, 0);
      if (totalAmount <= 0) return currentStart;

      // 주별 목표량을 미리 계산해 앞 주 몰림을 없앤다.
      // - weeklyLimit(레거시 weeklyAmount): 매주 limit 을 채우고 남는 만큼만 마지막 주에.
      // - 그 외(deadlineWeeks): 균등 분배(floor)하고 나머지는 뒤쪽 주에 +1 씩.
      //   과거엔 매주 ceil(남은량/남은주수)라 나머지가 첫 주들로 쏠려, "주 1회인데 첫 주만 2회"로 보였다.
      //   분량이 주수보다 적으면 그만큼의 주만 써서(빈 주 없이) 조기 완료한다.
      const weekAmounts: number[] = [];
      if (weeklyLimit) {
        const limit = Math.max(1, Math.round(weeklyLimit));
        let rem = totalAmount;
        while (rem > 0 && weekAmounts.length < safeWeeks) {
          const take = Math.min(rem, limit);
          weekAmounts.push(take);
          rem -= take;
        }
      } else {
        const effectiveWeeks = Math.max(1, Math.min(safeWeeks, totalAmount));
        const base = Math.floor(totalAmount / effectiveWeeks);
        const extra = totalAmount - base * effectiveWeeks; // 뒤 extra개 주에 +1
        for (let i = 0; i < effectiveWeeks; i++) {
          weekAmounts.push(base + (i >= effectiveWeeks - extra ? 1 : 0));
        }
      }

      let completed = 0;
      for (const thisWeekAmount of weekAmounts) {
        let currentEnd = new Date(currentStart);
        currentEnd.setDate(currentStart.getDate() + 6);
        // 마감일 절단: 마지막 주 창이 마감일을 넘으면 마감일에서 끝낸다.
        // (주수 = ceil(일수/7)이라 모든 창의 시작일은 항상 마감일 이전 — 끝만 당기면 된다.)
        if (capDate && currentEnd > capDate) currentEnd = new Date(capDate);

        const startStr = seoulDateStr(currentStart);
        const endStr = seoulDateStr(currentEnd);
        const studyDaysInWeek = Math.max(1, countStudyDaysInRange(currentStart, currentEnd, studyDays));
        const dailyAmount = Math.max(1, Math.ceil(thisWeekAmount / studyDaysInWeek));
        const fromNum = baseAmount + completed + 1;
        const toNum = fromNum + thisWeekAmount - 1;

        plans.push({
          id: `plan_${Date.now()}_${plans.length}_${Math.random().toString(36).substr(2, 5)}`,
          materialId,
          weekNumber: plans.length + 1,
          passNumber,
          startDate: startStr,
          endDate: endStr,
          targetAmount: thisWeekAmount,
          dailyAmount,
          rangeText: `${passNumber}회독 ${fromNum}${unit} ~ ${toNum}${unit}`,
          periodType: 'deadline',
          periodWeeks: 1,
          isCompleted: false,
        });

        completed += thisWeekAmount;
        currentStart = new Date(currentEnd);
        currentStart.setDate(currentEnd.getDate() + 1);
      }

      return currentStart;
    };

    // deadlineWeeks → N주. weeklyAmount(레거시 데이터 폴백) → 주당량을 주수로 환산:
    // ceil(잔량/주당량)을 1~12주로 클램프. (과거 "1주 창에 전체 잔량" 회귀 방지)
    const firstWeeks = goalType === 'weeklyAmount'
      ? Math.max(1, Math.min(12, Math.ceil(planAmount / Math.max(1, Math.round(goalValue || 1)))))
      : Math.max(1, Math.min(12, Math.round(goalValue || 1)));

    // 마감일 절단 대상(1회독 창에만 적용): 유효한 날짜이고 시작일 이후일 때만.
    const deadlineCap = (() => {
      if (!deadlineDateStr || !/^\d{4}-\d{2}-\d{2}$/.test(deadlineDateStr)) return undefined;
      const cap = parseDate(deadlineDateStr);
      if (!cap) return undefined;
      cap.setHours(0, 0, 0, 0);
      return cap >= today ? cap : undefined;
    })();

    if (planAmount > 0) {
      phaseStart = appendDeadlineWeeks(
        1,
        phaseStart,
        firstWeeks,
        planAmount,
        safeCurrentAmount,
        goalType === 'weeklyAmount' ? Math.max(1, Math.round(goalValue || 1)) : undefined,
        deadlineCap,
      );
    }

    // 회독 창 이어붙이기(v1 단순 처리): 각 회독은 전체 분량을 pass.days → 주수 근사한 창으로.
    const enabledPasses = reviewPasses
      .filter((pass) => pass.days > 0)
      .sort((a, b) => a.passNumber - b.passNumber);
    enabledPasses.forEach((pass) => {
      const phaseWeeks = Math.max(1, Math.min(12, Math.ceil(pass.days / 7)));
      phaseStart = appendDeadlineWeeks(pass.passNumber, phaseStart, phaseWeeks, totalAmount, 0);
    });

    const lastDeadlinePlan = plans[plans.length - 1];
    const calculatedTargetDate = lastDeadlinePlan?.endDate || seoulDateStr(today);
    return { plans, calculatedTargetDate };
  }

  const appendPlansByWeeklyAmount = (
    passNumber: number,
    phaseAmount: number,
    startBaseAmount: number,
    firstWeekAmount: number,
    amountPerWeek: number,
    totalWeeks: number,
    phaseStartWeek: Date,
    firstWeekFromDate?: Date,
    // 첫 주(i===0) plan.startDate 를 이 문자열로 강제(명시 시작일 기능). 미지정 시 그 주 월요일.
    firstWeekStartOverride?: string,
    // 하루 목표(dailyAmount 방식) — 지정 시 매주 이 값을 dailyAmount 로 고정한다(그 주 분량이 더 적으면
    // 그만큼만). 미지정(weeks 방식·회독)이면 종전대로 ceil(그주분량/그주학습일)로 역산한다.
    // 지정 시: 마지막 부분 주가 ceil(잔량/6일)로 희석돼 "하루 3강 목표인데 계획표엔 일일 2강"으로 보이던 버그 방지.
    fixedDailyAmount?: number
  ) => {
    let remainingAmount = phaseAmount;
    let currentStart = new Date(phaseStartWeek);

    for (let i = 0; i < totalWeeks; i++) {
      // KST 직렬화 — toISOString()은 KST 브라우저에서 하루 밀려 일요일 시작 plan 을 만들던 버그.
      // 명시 시작일이 있으면 첫 주 시작을 그 날짜로(월요일 스냅 대신) — 시작 전 유령 뒤처짐 방지.
      const startStr = i === 0 && firstWeekStartOverride ? firstWeekStartOverride : seoulDateStr(currentStart);
      const currentEnd = new Date(currentStart);
      currentEnd.setDate(currentStart.getDate() + 6);
      const endStr = seoulDateStr(currentEnd);

      const thisWeekAmount = i === 0
        ? Math.min(remainingAmount, firstWeekAmount)
        : Math.min(remainingAmount, amountPerWeek);

      if (thisWeekAmount <= 0) break;

      const fromNum = startBaseAmount + (phaseAmount - remainingAmount) + 1;
      const toNum = fromNum + thisWeekAmount - 1;
      const unit = customUnit || (type === 'book' ? 'p' : '강');
      const rangeText = `${passNumber}회독 ${fromNum}${unit} ~ ${toNum}${unit}`;
      const dailyDays = getStudyDaysInWeek(currentStart, i === 0 ? firstWeekFromDate : undefined);

      // 하루 목표(dailyAmount 방식): 매주 목표 일일량을 유지(그 주 분량이 더 적으면 그만큼만).
      // 그 외(weeks 방식·회독): 주간 분량을 그 주 학습일로 나눠 역산.
      let dailyAmount = fixedDailyAmount != null
        ? Math.max(1, Math.min(fixedDailyAmount, thisWeekAmount))
        : Math.ceil(thisWeekAmount / dailyDays);
      if (type === 'lecture' && category !== '문제풀이' && maxLecturesPerDay !== Infinity) {
        dailyAmount = Math.min(dailyAmount, maxLecturesPerDay);
      }

      plans.push({
        id: `plan_${Date.now()}_${plans.length}_${Math.random().toString(36).substr(2, 5)}`,
        materialId,
        weekNumber: plans.length + 1,
        passNumber,
        startDate: startStr,
        endDate: endStr,
        targetAmount: thisWeekAmount,
        dailyAmount,
        rangeText,
        isCompleted: false
      });

      remainingAmount -= thisWeekAmount;
      if (remainingAmount <= 0) break;

      currentStart = new Date(currentEnd);
      currentStart.setDate(currentEnd.getDate() + 1);
    }
  };

  const firstWeekDays = getStudyDaysInWeek(startOfWeek, today);
  let totalWeeks = 1;
  let firstWeekAmount = planAmount;
  let amountPerWeek = 0;
  // 하루 목표(dailyAmount 방식)일 때만 매주 고정할 일일량. weeks 방식은 undefined(주간→일일 역산 유지).
  let fixedDailyRate: number | undefined;

  if (goalType === 'weeks') {
    let baseWeeks = Math.max(1, Math.round(adjustedGoalValue));
    if (type === 'lecture' && category !== '문제풀이' && maxLecturesPerDay !== Infinity) {
      const maxWeeklyAmount = maxLecturesPerDay * daysCountPerWeek;
      const minWeeks = Math.ceil(planAmount / maxWeeklyAmount);
      if (baseWeeks < minWeeks) {
        baseWeeks = minWeeks;
      }
    }
    totalWeeks = Math.max(1, baseWeeks);
    if (totalWeeks === 1) {
      firstWeekAmount = planAmount;
      amountPerWeek = 0;
    } else {
      const totalLearningDays = firstWeekDays + (totalWeeks - 1) * daysCountPerWeek;
      const baseDailyAmount = planAmount / totalLearningDays;
      firstWeekAmount = Math.min(planAmount, Math.round(baseDailyAmount * firstWeekDays));
      const remainingForOthers = planAmount - firstWeekAmount;
      amountPerWeek = Math.ceil(remainingForOthers / (totalWeeks - 1));
    }
  } else if (goalType === 'dailyAmount') {
    const targetDaily = Math.max(1, Math.round(adjustedGoalValue));
    fixedDailyRate = targetDaily;
    firstWeekAmount = Math.min(planAmount, targetDaily * firstWeekDays);
    const remainingForOthers = planAmount - firstWeekAmount;
    if (remainingForOthers <= 0) {
      totalWeeks = 1;
      amountPerWeek = 0;
    } else {
      const weeklyAmount = targetDaily * daysCountPerWeek;
      const extraWeeks = Math.ceil(remainingForOthers / weeklyAmount);
      totalWeeks = 1 + extraWeeks;
      amountPerWeek = weeklyAmount;
    }
  }

  // 명시 시작일이 이번(첫) 주 창[월~일] 안에 있으면 첫 주 plan.startDate 를 그 날짜로 강제.
  // 범위를 벗어나는 경계 케이스(예: 일요일 시작)는 오버라이드하지 않아 startDate<=endDate 불변식을 지킨다.
  const firstWeekEnd = new Date(startOfWeek);
  firstWeekEnd.setDate(startOfWeek.getDate() + 6);
  const firstWeekStartOverride = explicitStart && today >= startOfWeek && today <= firstWeekEnd
    ? seoulDateStr(today)
    : undefined;

  if (planAmount > 0) {
    appendPlansByWeeklyAmount(1, planAmount, safeCurrentAmount, firstWeekAmount, amountPerWeek, totalWeeks, startOfWeek, today, firstWeekStartOverride, fixedDailyRate);
  }

  const enabledReviewPasses = reviewPasses
    .filter((pass) => pass.days > 0)
    .sort((a, b) => a.passNumber - b.passNumber);

  enabledReviewPasses.forEach((pass) => {
    const lastPlan = plans[plans.length - 1];
    const phaseStart = lastPlan ? new Date(lastPlan.endDate) : new Date(startOfWeek);
    if (lastPlan) {
      phaseStart.setDate(phaseStart.getDate() + 1);
    }
    const phaseWeeks = Math.max(1, Math.ceil(pass.days / daysCountPerWeek));
    const phaseWeeklyAmount = Math.ceil(totalAmount / phaseWeeks);
    appendPlansByWeeklyAmount(pass.passNumber, totalAmount, 0, phaseWeeklyAmount, phaseWeeklyAmount, phaseWeeks, phaseStart);
  });

  const lastPlan = plans[plans.length - 1];
  const calculatedTargetDate = lastPlan?.endDate || seoulDateStr(today);
  return { plans, calculatedTargetDate };
}
