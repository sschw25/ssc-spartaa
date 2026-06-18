import { BookProgress, DetailedPlan, LectureProgress, Student } from '@/lib/types/student';

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

function getExpectedFromPlans(plans: DetailedPlan[] | undefined, today: Date) {
  if (!plans || plans.length === 0) return null;

  const sortedPlans = [...plans].sort((a, b) => a.startDate.localeCompare(b.startDate));
  let latestPastPlan: DetailedPlan | null = null;

  for (const plan of sortedPlans) {
    const start = parseDate(plan.startDate);
    const end = parseDate(plan.endDate);
    if (!start || !end) continue;

    if (today < start) {
      return latestPastPlan ? parsePlanEndAmount(latestPastPlan) : 0;
    }

    if (today <= end) {
      return parsePlanEndAmount(plan);
    }

    latestPastPlan = plan;
  }

  return latestPastPlan ? parsePlanEndAmount(latestPastPlan) : null;
}

function getExpectedLinear(total: number, startDate?: string, targetDate?: string, today = new Date()) {
  const start = parseDate(startDate);
  const target = parseDate(targetDate);
  if (!start || !target || total <= 0) return null;

  const totalDays = Math.max(1, Math.ceil((target.getTime() - start.getTime()) / DAY_MS));
  const elapsedDays = Math.min(totalDays, Math.max(0, Math.ceil((today.getTime() - start.getTime()) / DAY_MS)));

  return Math.min(total, Math.ceil((total * elapsedDays) / totalDays));
}

function buildItem(
  student: Student,
  subjectName: string,
  material: BookProgress | LectureProgress,
  type: ProgressItemType,
  today: Date
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

  const expectedFromPlans = getExpectedFromPlans(material.detailedPlans, today);
  const expectedToday = expectedFromPlans ?? getExpectedLinear(total, student.createdAt, material.targetDate, today);
  const shortage = expectedToday === null ? null : Math.max(0, expectedToday - current);

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
    status: expectedToday === null ? 'no-plan' : current + 1 < expectedToday ? 'behind' : current >= expectedToday ? 'ahead' : 'on-track',
    daysToTarget: diffDays(today, material.targetDate),
    daysToConsultation: diffDays(today, student.nextConsultationDate),
  };
}

export function getManagedProgressItems(students: Student[], today = new Date()): ManagedProgressItem[] {
  today.setHours(0, 0, 0, 0);

  return students.flatMap((student) => {
    if (student.subjects && student.subjects.length > 0) {
      return student.subjects.flatMap((subject) => [
        ...(subject.books || []).map((book) => buildItem(student, subject.name, book, 'book', today)),
        ...(subject.lectures || []).map((lecture) => buildItem(student, subject.name, lecture, 'lecture', today)),
      ]);
    }

    return [
      ...(student.books || []).map((book) => buildItem(student, '기본', book, 'book', today)),
      ...(student.lectures || []).map((lecture) => buildItem(student, '기본', lecture, 'lecture', today)),
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

export function getStudentTodayTotalStudyTimeMin(student: Student, todayStr?: string): number {
  const targetDateStr = todayStr || new Date().toISOString().split('T')[0];
  let totalMin = 0;

  const checkPlan = (
    plans: DetailedPlan[] | undefined,
    unit: string | undefined,
    type: ProgressItemType,
    estimatedMinutesPerUnit?: number
  ) => {
    if (!plans) return;
    const todayPlan = plans.find(p => p.startDate <= targetDateStr && targetDateStr <= p.endDate);
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
        totalMin += getEstimatedStudyTimeMin(unit, dailyAmount, type, estimatedMinutesPerUnit);
      }
    }
  };

  if (student.subjects) {
    student.subjects.forEach(sub => {
      (sub.books || []).forEach(b => checkPlan(b.detailedPlans, b.unit, 'book', b.estimatedMinutesPerUnit));
      (sub.lectures || []).forEach(l => checkPlan(l.detailedPlans, '강', 'lecture', l.estimatedMinutesPerUnit));
    });
  } else {
    (student.books || []).forEach(b => checkPlan(b.detailedPlans, b.unit, 'book', b.estimatedMinutesPerUnit));
    (student.lectures || []).forEach(l => checkPlan(l.detailedPlans, '강', 'lecture', l.estimatedMinutesPerUnit));
  }

  // 속도 가중치 보정 반영 (0.8배속은 1.25배 오래 걸림, 1.2배속은 0.83배 덜 걸림)
  const speedMultiplier = student.speedMultiplier || 1.0;
  const rawTotalMin = totalMin / speedMultiplier;
  
  // 소수점 없이 완전한 정수(분) 단위로 반올림하여 반환
  return Math.round(rawTotalMin);
}
