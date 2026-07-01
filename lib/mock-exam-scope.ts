import type { MockExam, Student } from './types/student';

export function isMockExamTargetedToStudent(exam: MockExam, student: Student): boolean {
  if (exam.campus && exam.campus !== 'all' && exam.campus !== student.campus) return false;

  const targetExamTypes = (exam.targetExamTypes || [])
    .map((type) => type.trim())
    .filter(Boolean);
  if (targetExamTypes.length === 0) return true;

  const contact = student.contact || '';
  return targetExamTypes.some((type) => contact.includes(type));
}

export function isMockExamVisibleToStudent(
  exam: MockExam,
  student: Student,
  options: { requireNotified?: boolean } = {},
): boolean {
  if (options.requireNotified && !exam.notifiedAt) return false;
  return isMockExamTargetedToStudent(exam, student);
}

export function filterMockExamsForStudent(
  exams: MockExam[],
  student: Student,
  options: { requireNotified?: boolean } = {},
): MockExam[] {
  return exams.filter((exam) => isMockExamVisibleToStudent(exam, student, options));
}
