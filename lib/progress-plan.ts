import { BookProgress, DetailedPlan, LectureProgress, Student, ReviewPassSetting } from '@/lib/types/student';

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

// 반복 iteration 은 로컬 자정 Date 로 도니 로컬 Y-M-D 로 키를 만든다(leaveRequests.date 와 동일 캘린더 기준).
export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 승인된 결석성 휴가 날짜 집합(YYYY-MM-DD). 반차/휴식/병가/개인휴가 모두, 반차도 그날 전부 면제.
export function getLeaveDates(student: Student): Set<string> {
  const dates = new Set<string>();
  for (const req of student.leaveRequests || []) {
    if (req.status !== 'approved') continue;
    if (typeof req.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.date)) dates.add(req.date);
  }
  return dates;
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

function getExpectedWithinCurrentPlan(plan: DetailedPlan, today: Date, studyDays?: string[], createdAt?: string, inclusiveToday = false, leaveDates?: Set<string>) {
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
  // 경과 학습일에서만 휴가일 제외(분모 totalStudyDays 는 그대로 — 보강은 별도 어드바이저리).
  const elapsedStudyDays = countStudyDaysInRange(effectiveStart, upperBound, studyDays, leaveDates);
  if (elapsedStudyDays <= 0) return beforePlanAmount;

  const totalStudyDays = Math.max(1, countStudyDaysInRange(start, end, studyDays));
  const dailyAmount = Math.max(1, Math.round(plan.dailyAmount ?? Math.ceil((plan.targetAmount || 1) / totalStudyDays)));
  return Math.min(endAmount, beforePlanAmount + dailyAmount * elapsedStudyDays);
}

function isSameDay(a: Date | null, b: Date) {
  return Boolean(a && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate());
}

export function getExpectedFromPlans(plans: DetailedPlan[] | undefined, today: Date, studyDays?: string[], createdAt?: string, inclusiveToday = false, leaveDates?: Set<string>) {
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

    if (today < start) {
      return latestPastPlan ? parsePlanEndAmount(latestPastPlan) : 0;
    }

    if (today <= end) {
      return getExpectedWithinCurrentPlan(plan, today, studyDays, createdAt, inclusiveToday, leaveDates);
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
  const rawExpectedToday = getExpectedFromPlans(material.detailedPlans, today, studyDays, progressBaselineDate, false, leaveDates);
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
    total,
    current,
    targetDate: material.targetDate,
    expectedToday,
    shortage,
    status,
    planKind,
    daysToTarget: diffDays(today, material.targetDate),
    daysToConsultation: diffDays(today, student.nextConsultationDate),
  };
}

export function getManagedProgressItems(students: Student[], today = new Date()): ManagedProgressItem[] {
  today.setHours(0, 0, 0, 0);

  return students.flatMap((student) => {
    const leaveDates = getLeaveDates(student);
    if (student.subjects && student.subjects.length > 0) {
      return student.subjects.flatMap((subject) => [
        ...(subject.books || []).map((book) => buildItem(student, subject.name, book, 'book', today, subject.studyDays, leaveDates)),
        ...(subject.lectures || []).map((lecture) => buildItem(student, subject.name, lecture, 'lecture', today, subject.studyDays, leaveDates)),
      ]);
    }

    return [
      ...(student.books || []).map((book) => buildItem(student, '기본', book, 'book', today, undefined, leaveDates)),
      ...(student.lectures || []).map((lecture) => buildItem(student, '기본', lecture, 'lecture', today, undefined, leaveDates)),
    ];
  });
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
  const countRaw = (a: Date, b: Date) => {
    if (b < a) return 0;
    const cur = new Date(a); cur.setHours(0, 0, 0, 0);
    const last = new Date(b); last.setHours(0, 0, 0, 0);
    let c = 0;
    while (cur <= last) { if (isStudyDay(cur, studyDays)) c++; cur.setDate(cur.getDate() + 1); }
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
    todayRecommend = Math.ceil(remainingAmount / remainingStudyDays);
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
  const targetDateStr = todayStr || new Date().toISOString().split('T')[0];
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
        if (parentSubject && parentSubject.studyDays && parentSubject.studyDays.length > 0) {
          isStudyDay = parentSubject.studyDays.includes(todayKey);
        }
      }

      if (isStudyDay) {
        const dailyAmount = todayPlan.dailyAmount || Math.ceil(todayPlan.targetAmount / 6);
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

export function getAvailableMinutes(studyTime?: 'morning' | 'afternoon' | 'night' | '') {
  if (studyTime === 'morning') return 190;
  if (studyTime === 'afternoon') return 210;
  if (studyTime === 'night') return 250;
  return 650; // 기본 전체 자습 시간
}

export function generateDetailedPlans(
  materialId: string,
  totalAmount: number,
  type: 'book' | 'lecture',
  goalType: 'weeks' | 'weeklyAmount' | 'dailyAmount' | 'deadlineWeeks',
  goalValue: number,
  currentAmount = 0,
  customUnit?: string,
  reviewPasses: ReviewPassSetting[] = [],
  studyDays?: string[],
  lectureSpeedMultiplier = 1.0,
  estimatedMinutesPerUnit?: number,
  studyTime?: 'morning' | 'afternoon' | 'night' | '',
  category?: string
): { plans: DetailedPlan[], calculatedTargetDate: string } {
  const plans: DetailedPlan[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const safeCurrentAmount = Math.min(totalAmount, Math.max(0, Math.round(currentAmount)));
  const planAmount = Math.max(0, totalAmount - safeCurrentAmount);

  if (planAmount <= 0 && reviewPasses.length === 0) {
    return { plans, calculatedTargetDate: today.toISOString().split('T')[0] };
  }

  const activeStudyDays = getActiveStudyDays(studyDays);
  const daysCountPerWeek = activeStudyDays.length;

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

    // 기간 목표 날짜는 서울(KST) 기준으로 직렬화한다. toISOString()은 UTC라 KST 자정이 전날로
    // 밀려(당일이 어제로 저장) 당일등록 학생이 하루 뒤처진 것으로 계산되던 문제를 막는다.
    const seoulDateStr = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(d);
    const appendDeadlineWeeks = (
      passNumber: number,
      windowStart: Date,
      weeks: number,
      amount: number,
      baseAmount: number,
      weeklyLimit?: number,
    ) => {
      const safeWeeks = Math.max(1, Math.min(12, Math.round(weeks)));
      let remainingAmount = Math.max(0, Math.round(amount));
      let currentStart = new Date(windowStart);
      currentStart.setHours(0, 0, 0, 0);

      for (let i = 0; i < safeWeeks; i++) {
        if (remainingAmount <= 0) break;

        const weeksLeft = safeWeeks - i;
        const thisWeekAmount = weeklyLimit
          ? Math.min(remainingAmount, Math.max(1, Math.round(weeklyLimit)))
          : Math.ceil(remainingAmount / weeksLeft);
        const currentEnd = new Date(currentStart);
        currentEnd.setDate(currentStart.getDate() + 6);

        const startStr = seoulDateStr(currentStart);
        const endStr = seoulDateStr(currentEnd);
        const studyDaysInWeek = Math.max(1, countStudyDaysInRange(currentStart, currentEnd, studyDays));
        const dailyAmount = Math.max(1, Math.ceil(thisWeekAmount / studyDaysInWeek));
        const completedBeforeWeek = amount - remainingAmount;
        const fromNum = baseAmount + completedBeforeWeek + 1;
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

        remainingAmount -= thisWeekAmount;
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

    if (planAmount > 0) {
      phaseStart = appendDeadlineWeeks(
        1,
        phaseStart,
        firstWeeks,
        planAmount,
        safeCurrentAmount,
        goalType === 'weeklyAmount' ? Math.max(1, Math.round(goalValue || 1)) : undefined,
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
    const calculatedTargetDate = lastDeadlinePlan?.endDate || today.toISOString().split('T')[0];
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
    firstWeekFromDate?: Date
  ) => {
    let remainingAmount = phaseAmount;
    let currentStart = new Date(phaseStartWeek);

    for (let i = 0; i < totalWeeks; i++) {
      const startStr = currentStart.toISOString().split('T')[0];
      const currentEnd = new Date(currentStart);
      currentEnd.setDate(currentStart.getDate() + 6);
      const endStr = currentEnd.toISOString().split('T')[0];

      const thisWeekAmount = i === 0
        ? Math.min(remainingAmount, firstWeekAmount)
        : Math.min(remainingAmount, amountPerWeek);

      if (thisWeekAmount <= 0) break;

      const fromNum = startBaseAmount + (phaseAmount - remainingAmount) + 1;
      const toNum = fromNum + thisWeekAmount - 1;
      const unit = customUnit || (type === 'book' ? 'p' : '강');
      const rangeText = `${passNumber}회독 ${fromNum}${unit} ~ ${toNum}${unit}`;
      const dailyDays = getStudyDaysInWeek(currentStart, i === 0 ? firstWeekFromDate : undefined);
      
      let dailyAmount = Math.ceil(thisWeekAmount / dailyDays);
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

  if (planAmount > 0) {
    appendPlansByWeeklyAmount(1, planAmount, safeCurrentAmount, firstWeekAmount, amountPerWeek, totalWeeks, startOfWeek, today);
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
  const calculatedTargetDate = lastPlan?.endDate || today.toISOString().split('T')[0];
  return { plans, calculatedTargetDate };
}
