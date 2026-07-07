import { NextResponse } from 'next/server';
import { canAdminAccessStudent } from '@/lib/auth';
import { updateStudentById } from '@/lib/store';
import { generateDetailedPlans, getMaterialStudyDays } from '@/lib/progress-plan';
import { appendThreadMessage } from '@/lib/thread';

type GoalType = 'weeks' | 'weeklyAmount' | 'dailyAmount' | 'deadlineWeeks' | 'selfPaced';

const kstDateKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());

const clampProgress = (value: unknown, total: unknown) => {
  const progress = Number(value);
  const max = Math.max(0, Number(total) || 0);
  if (!Number.isFinite(progress)) return null;
  const rounded = Math.max(0, Math.round(progress));
  // selfPaced 자료는 총량(max)이 0 → 상한을 걸지 않고 누적값 보존 (학생 진도 경로와 동일)
  return max > 0 ? Math.min(rounded, max) : rounded;
};

const appendInputLog = (inputLog: unknown, dateKey: string) => {
  const prev = Array.isArray(inputLog) ? inputLog.filter((d): d is string => typeof d === 'string') : [];
  return Array.from(new Set([...prev, dateKey])).slice(-120);
};

const applyWeekRangeOverride = (plans: unknown, weekNumber?: number, rangeText?: string) => {
  if (!weekNumber || !rangeText || !Array.isArray(plans)) return plans;
  return plans.map((plan: any) => (plan.weekNumber === weekNumber ? { ...plan, rangeText } : plan));
};

const resolveGoalType = (material: any, proposedGoalType: GoalType, proposedGoalValue: number): GoalType => {
  if (proposedGoalValue > 0) return proposedGoalType;
  return material.goalType || proposedGoalType || 'deadlineWeeks';
};

const resolveGoalValue = (material: any, proposedGoalValue: number) => {
  if (proposedGoalValue > 0) return proposedGoalValue;
  const current = Number(material.goalValue);
  if (Number.isFinite(current) && current > 0) return current;
  if ((!material.goalType || material.goalType === 'weeks' || material.goalType === 'deadlineWeeks') && Array.isArray(material.detailedPlans)) {
    const planWeeks = Math.max(0, ...material.detailedPlans.map((plan: any) => Number(plan.weekNumber) || 0));
    if (planWeeks > 0) return planWeeks;
  }
  return 0;
};

// 관리자: 학생 변경 신청 처리 상태 변경 (pending <-> resolved)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!(await canAdminAccessStudent(id))) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });
  }

  let body: { requestId?: unknown; status?: unknown; reply?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const requestId = typeof body?.requestId === 'string' ? body.requestId : '';
  const status = body?.status === 'pending' ? 'pending' : body?.status === 'resolved' ? 'resolved' : null;
  const reply = typeof body?.reply === 'string' ? body.reply.trim() : null;
  if (!requestId) {
    return NextResponse.json({ success: false, message: '처리 대상이 올바르지 않습니다.' }, { status: 400 });
  }
  if (!status && reply === null) {
    return NextResponse.json({ success: false, message: '처리 상태 또는 답변이 필요합니다.' }, { status: 400 });
  }

  let errorResponse: NextResponse | null = null;
  const result = await updateStudentById(id, (student) => {
  const target = (student.consultationLogs || []).find((l) => l.id === requestId && l.type === 'request');
  if (!target) {
    errorResponse = NextResponse.json({ success: false, message: '신청을 찾을 수 없습니다.' }, { status: 404 });
    return false;
  }

  const nowIso = new Date().toISOString();
  if (reply) {
    appendThreadMessage(target, { from: 'admin', text: reply, author: '코멘터' });
    target.adminReply = reply;
    target.repliedAt = nowIso;
  }
  if (status) {
    target.status = status;
    target.resolvedAt = status === 'resolved' ? nowIso : undefined;
    target.acknowledgedAt = status === 'pending' ? nowIso : undefined;

    // 승인(resolved) 시 제안된 현재 진도/계획 값을 실제 학생 계획에 연동한다.
    if (status === 'resolved' && target.proposedGoal) {
      const {
        materialId,
        materialType,
        goalType,
        goalValue,
        currentProgress,
        proposedWeekNumber,
        proposedRangeText,
      } = target.proposedGoal;
      const hasCurrentProgress = currentProgress !== undefined && Number.isFinite(Number(currentProgress));
      const inputDate = kstDateKey();

      const parentSubject = (student.subjects || []).find((s: any) => {
        const hasBook = s.books?.some((b: any) => b.id === materialId);
        const hasLecture = s.lectures?.some((l: any) => l.id === materialId);
        return hasBook || hasLecture;
      });
      const updateBook = (book: any) => {
        if (book.id !== materialId) return book;
        const updated = { ...book };
        const clampedProgress = hasCurrentProgress ? clampProgress(currentProgress, updated.totalPages) : null;
        if (clampedProgress !== null) {
          updated.currentPage = clampedProgress;
          updated.inputLog = appendInputLog(updated.inputLog, inputDate);
          updated.updatedAt = nowIso;
        }

        const nextGoalType = resolveGoalType(updated, goalType, goalValue);
        const nextGoalValue = resolveGoalValue(updated, goalValue);
        if (goalValue > 0) {
          updated.goalType = goalType;
          updated.goalValue = goalValue;
          updated.updatedAt = nowIso;
        }

        if ((hasCurrentProgress || goalValue > 0) && nextGoalValue > 0) {
          const { plans, calculatedTargetDate } = generateDetailedPlans(
            materialId,
            updated.totalPages,
            'book',
            nextGoalType,
            nextGoalValue,
            updated.currentPage,
            updated.unit,
            updated.reviewPasses || [],
            getMaterialStudyDays(parentSubject?.studyDays, updated.studyDays),
            1.0,
            updated.estimatedMinutesPerUnit,
            parentSubject?.studyTime,
            updated.category
          );
          updated.detailedPlans = plans;
          updated.targetDate = calculatedTargetDate;
          updated.goalType = nextGoalType;
          updated.goalValue = nextGoalValue;
        }

        updated.detailedPlans = applyWeekRangeOverride(updated.detailedPlans, proposedWeekNumber, proposedRangeText);
        return updated;
      };

      const updateLecture = (lecture: any) => {
        if (lecture.id !== materialId) return lecture;
        const proposedSpeed = Number(target.proposedGoal?.speedMultiplier);
        const hasProposedSpeed = Number.isFinite(proposedSpeed) && proposedSpeed > 0;
        const updated = { ...lecture };
        const clampedProgress = hasCurrentProgress ? clampProgress(currentProgress, updated.totalLectures) : null;
        if (clampedProgress !== null) {
          updated.completedLectures = clampedProgress;
          updated.inputLog = appendInputLog(updated.inputLog, inputDate);
          updated.updatedAt = nowIso;
        }
        if (hasProposedSpeed) {
          updated.speedMultiplier = Math.min(4, proposedSpeed);
          updated.updatedAt = nowIso;
        }

        const nextGoalType = resolveGoalType(updated, goalType, goalValue);
        const nextGoalValue = resolveGoalValue(updated, goalValue);
        const nextSpeed = Number(updated.speedMultiplier || 1.0);
        if (goalValue > 0) {
          updated.goalType = goalType;
          updated.goalValue = goalValue;
          updated.updatedAt = nowIso;
        }

        if ((hasCurrentProgress || goalValue > 0 || hasProposedSpeed) && nextGoalValue > 0) {
          const { plans, calculatedTargetDate } = generateDetailedPlans(
            materialId,
            updated.totalLectures,
            'lecture',
            nextGoalType,
            nextGoalValue,
            updated.completedLectures,
            undefined,
            updated.reviewPasses || [],
            getMaterialStudyDays(parentSubject?.studyDays, updated.studyDays),
            nextSpeed,
            updated.estimatedMinutesPerUnit,
            parentSubject?.studyTime,
            updated.category
          );
          updated.detailedPlans = plans;
          updated.targetDate = calculatedTargetDate;
          updated.goalType = nextGoalType;
          updated.goalValue = nextGoalValue;
        }

        updated.detailedPlans = applyWeekRangeOverride(updated.detailedPlans, proposedWeekNumber, proposedRangeText);
        return updated;
      };

      if (materialType === 'book') {
        if (student.subjects) {
          student.subjects = student.subjects.map((sub: any) => (
            sub.id !== parentSubject?.id ? sub : { ...sub, books: (sub.books || []).map(updateBook) }
          ));
        }
        student.books = (student.books || []).map(updateBook);
      } else if (materialType === 'lecture') {
        if (student.subjects) {
          student.subjects = student.subjects.map((sub: any) => (
            sub.id !== parentSubject?.id ? sub : { ...sub, lectures: (sub.lectures || []).map(updateLecture) }
          ));
        }
        student.lectures = (student.lectures || []).map(updateLecture);
      }
    }
  }
  });

  if (errorResponse) return errorResponse;
  if (result === 'not_found') {
    return NextResponse.json({ success: false, message: '해당 원생을 찾을 수 없습니다.' }, { status: 404 });
  }
  if (typeof result === 'string') {
    return NextResponse.json({ success: false, message: '저장이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' }, { status: 409 });
  }

  return NextResponse.json({ success: true, student: result });
}
