import { NextRequest, NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { getStudentById, patchStudentProgress } from '@/lib/store';
import { generateDetailedPlans, isStudyDay } from '@/lib/progress-plan';
import type { Student } from '@/lib/types/student';

// targetDate까지 남은 학습 요일 수 계산
function getLearningDaysUntil(targetDate?: string, studyDays?: string[]) {
  if (!targetDate) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(targetDate);
  target.setHours(0, 0, 0, 0);
  if (Number.isNaN(target.getTime()) || target < today) return 0;

  let days = 0;
  const cursor = new Date(today);
  while (cursor <= target) {
    if (isStudyDay(cursor, studyDays)) days += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export async function POST(request: NextRequest) {
  try {
    const studentId = await getStudentSessionId();
    if (!studentId) {
      return NextResponse.json({ success: false, message: '인증되지 않은 요청입니다.' }, { status: 401 });
    }

    const student = await getStudentById(studentId);
    if (!student) {
      return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    const { mode } = await request.json().catch(() => ({ mode: 'keepTargetDate' }));
    const nowStr = new Date().toISOString();

    const updatedSubjects = (student.subjects || []).map((subject) => {
      const studyDays = subject.studyDays || [];

      const updatedBooks = (subject.books || []).map((book) => {
        const totalAmount = book.totalPages || 0;
        const currentAmount = book.currentPage || 0;
        const remainingAmount = Math.max(0, totalAmount - currentAmount);

        if (remainingAmount <= 0) return book;

        let goalType = book.goalType || 'weeks';
        let goalValue = Number(book.goalValue) || 1;

        if (mode === 'keepTargetDate' && book.targetDate) {
          const learningDays = getLearningDaysUntil(book.targetDate, studyDays);
          if (learningDays > 0) {
            goalType = 'dailyAmount';
            goalValue = Math.max(1, Math.ceil(remainingAmount / learningDays));
          }
        }

        if (goalValue <= 0) {
          goalType = 'weeks';
          goalValue = 1;
        }

        const { plans, calculatedTargetDate } = generateDetailedPlans(
          book.id,
          totalAmount,
          'book',
          goalType,
          goalValue,
          currentAmount,
          book.unit,
          book.reviewPasses || [],
          studyDays,
          1.0,
          book.estimatedMinutesPerUnit,
          subject.studyTime,
          book.category
        );

        return {
          ...book,
          goalType,
          goalValue,
          targetDate: mode === 'keepTargetDate' && book.targetDate ? book.targetDate : calculatedTargetDate,
          detailedPlans: plans,
          updatedAt: nowStr,
        };
      });

      const updatedLectures = (subject.lectures || []).map((lecture) => {
        const totalAmount = lecture.totalLectures || 0;
        const currentAmount = lecture.completedLectures || 0;
        const remainingAmount = Math.max(0, totalAmount - currentAmount);

        if (remainingAmount <= 0) return lecture;

        let goalType = lecture.goalType || 'weeks';
        let goalValue = Number(lecture.goalValue) || 1;
        const speed = Number(lecture.speedMultiplier || 1.0);

        if (mode === 'keepTargetDate' && lecture.targetDate) {
          const learningDays = getLearningDaysUntil(lecture.targetDate, studyDays);
          if (learningDays > 0) {
            goalType = 'dailyAmount';
            goalValue = Math.max(1, Math.ceil((remainingAmount / learningDays) / speed));
          }
        }

        if (goalValue <= 0) {
          goalType = 'weeks';
          goalValue = 1;
        }

        const { plans, calculatedTargetDate } = generateDetailedPlans(
          lecture.id,
          totalAmount,
          'lecture',
          goalType,
          goalValue,
          currentAmount,
          undefined,
          lecture.reviewPasses || [],
          studyDays,
          speed,
          lecture.estimatedMinutesPerUnit,
          subject.studyTime,
          lecture.category
        );

        return {
          ...lecture,
          goalType,
          goalValue,
          targetDate: mode === 'keepTargetDate' && lecture.targetDate ? lecture.targetDate : calculatedTargetDate,
          detailedPlans: plans,
          updatedAt: nowStr,
        };
      });

      return {
        ...subject,
        books: updatedBooks,
        lectures: updatedLectures,
        updatedAt: nowStr,
      };
    });

    const updatedStudent: Student = {
      ...student,
      subjects: updatedSubjects,
      updatedAt: nowStr,
    };

    const result = await patchStudentProgress(updatedStudent, student.updatedAt);
    if (!result || result === 'conflict') {
      return NextResponse.json({ success: false, message: '학생 정보 업데이트에 실패했거나 동시성 충돌이 발생했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Error realigning student plans:', error);
    return NextResponse.json({ success: false, message: '일괄 재조정 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
