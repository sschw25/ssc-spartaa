import type { DetailedPlan, Student } from './types/student';
import { deriveDeadlineGoals } from './deadline-goals';
import { getDailyChecklistFromStudent, getPlanDailyCompletion, readActivityEnvelope } from './student-activity';

const WEEK_DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export function addDateDays(dateKey: string, delta: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

export function eachDateKey(start: string, end: string): string[] {
  const keys: string[] = [];
  for (let cur = start; cur <= end; cur = addDateDays(cur, 1)) keys.push(cur);
  return keys;
}

function weekdayKeyOf(dateKey: string): typeof WEEK_DAY_KEYS[number] {
  const [y, m, d] = dateKey.split('-').map(Number);
  return WEEK_DAY_KEYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

function isSubjectActiveOnDate(
  subject: { studyDays?: Array<typeof WEEK_DAY_KEYS[number]> },
  dateKey: string,
): boolean {
  const days = subject.studyDays || [];
  return days.length === 0 || days.includes(weekdayKeyOf(dateKey));
}

function isPlanActiveOnDate(plan: DetailedPlan, dateKey: string) {
  return !plan.periodType && plan.startDate <= dateKey && dateKey <= plan.endDate;
}

export function getWeeklyPlanCompletionStats(student: Student, start: string, end: string) {
  let expected = 0;
  let completed = 0;

  for (const dateKey of eachDateKey(start, end)) {
    const subjects = student.subjects && student.subjects.length > 0
      ? student.subjects
      : [{
          id: 'legacy',
          name: '전체',
          studyDays: [] as Array<typeof WEEK_DAY_KEYS[number]>,
          books: student.books || [],
          lectures: student.lectures || [],
          updatedAt: student.updatedAt,
        }];

    for (const subject of subjects) {
      if (!isSubjectActiveOnDate(subject, dateKey)) continue;
      const plans = [
        ...(subject.books || []).flatMap((book) => book.detailedPlans || []),
        ...(subject.lectures || []).flatMap((lecture) => lecture.detailedPlans || []),
      ].filter((plan) => isPlanActiveOnDate(plan, dateKey));

      expected += plans.length;
      completed += plans.filter((plan) => getPlanDailyCompletion(plan, dateKey).isCompleted).length;
    }
  }

  const rate = expected > 0 ? completed / expected : null;
  return { expected, completed, rate };
}

export function getPhoneFocusStats(student: Student, start: string, end: string) {
  let count = 0;
  const dates: string[] = [];
  for (const dateKey of eachDateKey(start, end)) {
    const entry = getDailyChecklistFromStudent(student, dateKey);
    const status = entry?.phone_status ?? (entry?.phone_submitted ? 'submitted' : undefined);
    if (status === 'submitted' || status === 'locker') {
      count++;
      dates.push(dateKey);
    }
  }
  return { count, dates };
}

export function getDeadlineZeroOverdueStats(student: Student, today: Date, todayKey: string) {
  const { deadlineGoals, deadlineSummary } = deriveDeadlineGoals(student, today, todayKey);
  const activeCount = deadlineGoals.length;
  const riskCount = deadlineSummary?.riskCount ?? 0;
  return {
    activeCount,
    riskCount,
    achieved: activeCount > 0 && riskCount === 0,
  };
}

export type MockReviewEntry = {
  id: string;
  testName: string;
  testDate: string;
  wrongNotes: string;
  actionPlan: string;
  submittedAt: string;
};

export function getMockReviews(student: Student): MockReviewEntry[] {
  const note = readActivityEnvelope(student);
  return Array.isArray(note.mock_reviews) ? (note.mock_reviews as MockReviewEntry[]) : [];
}

export function getMockReviewStats(student: Student, start: string, end: string, minChars: number) {
  const reviews = getMockReviews(student).filter((review) => {
    const date = review.testDate || review.submittedAt.slice(0, 10);
    return (
      date >= start &&
      date <= end &&
      review.wrongNotes.trim().length >= minChars &&
      review.actionPlan.trim().length >= minChars
    );
  });
  return { count: reviews.length, latest: reviews.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0] || null };
}
