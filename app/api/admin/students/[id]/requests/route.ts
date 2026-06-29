import { NextResponse } from 'next/server';
import { canAdminAccessStudent } from '@/lib/auth';
import { getStudentById, saveStudent } from '@/lib/store';
import { generateDetailedPlans } from '@/lib/progress-plan';
import { appendThreadMessage } from '@/lib/thread';

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

  const student = await getStudentById(id);
  if (!student) {
    return NextResponse.json({ success: false, message: '해당 원생을 찾을 수 없습니다.' }, { status: 404 });
  }

  const target = (student.consultationLogs || []).find((l) => l.id === requestId && l.type === 'request');
  if (!target) {
    return NextResponse.json({ success: false, message: '신청을 찾을 수 없습니다.' }, { status: 404 });
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

    // 승인(resolved) 시 제안된 변경 계획 데이터가 있다면 실제 학생 계획에 연동
    if (status === 'resolved' && target.proposedGoal) {
      const { materialId, materialType, goalType, goalValue, targetDate, proposedWeekNumber, proposedRangeText } = target.proposedGoal;
      
      const parentSubject = (student.subjects || []).find((s: any) => {
        const hasBook = s.books?.some((b: any) => b.id === materialId);
        const hasLecture = s.lectures?.some((l: any) => l.id === materialId);
        return hasBook || hasLecture;
      });
      const studyDays = parentSubject?.studyDays;

      if (materialType === 'book') {
        // 1. 과목 정보(subjects)에 적용
        if (student.subjects) {
          student.subjects = student.subjects.map((sub: any) => {
            if (sub.id !== parentSubject?.id) return sub;
            return {
              ...sub,
              books: (sub.books || []).map((b: any) => {
                if (b.id !== materialId) return b;
                const updated = { ...b };
                if (proposedWeekNumber && proposedRangeText) {
                  updated.detailedPlans = (updated.detailedPlans || []).map((p: any) => {
                    if (p.weekNumber === proposedWeekNumber) {
                      return { ...p, rangeText: proposedRangeText };
                    }
                    return p;
                  });
                }
                if (goalValue > 0) {
                  updated.goalType = goalType;
                  updated.goalValue = goalValue;
                  const { plans, calculatedTargetDate } = generateDetailedPlans(
                    materialId,
                    updated.totalPages,
                    'book',
                    goalType,
                    goalValue,
                    updated.currentPage,
                    updated.unit,
                    updated.reviewPasses || [],
                    studyDays,
                    1.0,
                    updated.estimatedMinutesPerUnit,
                    parentSubject?.studyTime,
                    updated.category
                  );
                  updated.detailedPlans = plans;
                  updated.targetDate = calculatedTargetDate;
                }
                return updated;
              })
            };
          });
        }
        // 2. 루트 레벨의 books 필드에도 싱크 (필요시)
        student.books = (student.books || []).map((b: any) => {
          if (b.id !== materialId) return b;
          const updated = { ...b };
          if (proposedWeekNumber && proposedRangeText) {
            updated.detailedPlans = (updated.detailedPlans || []).map((p: any) => {
              if (p.weekNumber === proposedWeekNumber) {
                return { ...p, rangeText: proposedRangeText };
              }
              return p;
            });
          }
          if (goalValue > 0) {
            updated.goalType = goalType;
            updated.goalValue = goalValue;
            const { plans, calculatedTargetDate } = generateDetailedPlans(
              materialId,
              updated.totalPages,
              'book',
              goalType,
              goalValue,
              updated.currentPage,
              updated.unit,
              updated.reviewPasses || [],
              studyDays,
              1.0,
              updated.estimatedMinutesPerUnit,
              parentSubject?.studyTime,
              updated.category
            );
            updated.detailedPlans = plans;
            updated.targetDate = calculatedTargetDate;
          }
          return updated;
        });
      } else if (materialType === 'lecture') {
        const proposedSpeed = target.proposedGoal.speedMultiplier || 1.0;
        
        if (student.subjects) {
          student.subjects = student.subjects.map((sub: any) => {
            if (sub.id !== parentSubject?.id) return sub;
            return {
              ...sub,
              lectures: (sub.lectures || []).map((l: any) => {
                if (l.id !== materialId) return l;
                const updated = { ...l, speedMultiplier: proposedSpeed };
                if (proposedWeekNumber && proposedRangeText) {
                  updated.detailedPlans = (updated.detailedPlans || []).map((p: any) => {
                    if (p.weekNumber === proposedWeekNumber) {
                      return { ...p, rangeText: proposedRangeText };
                    }
                    return p;
                  });
                }
                if (goalValue > 0) {
                  updated.goalType = goalType;
                  updated.goalValue = goalValue;
                  const { plans, calculatedTargetDate } = generateDetailedPlans(
                    materialId,
                    updated.totalLectures,
                    'lecture',
                    goalType,
                    goalValue,
                    updated.completedLectures,
                    undefined,
                    updated.reviewPasses || [],
                    studyDays,
                    proposedSpeed,
                    updated.estimatedMinutesPerUnit,
                    parentSubject?.studyTime,
                    updated.category
                  );
                  updated.detailedPlans = plans;
                  updated.targetDate = calculatedTargetDate;
                }
                return updated;
              })
            };
          });
        }
        student.lectures = (student.lectures || []).map((l: any) => {
          if (l.id !== materialId) return l;
          const updated = { ...l, speedMultiplier: proposedSpeed };
          if (proposedWeekNumber && proposedRangeText) {
            updated.detailedPlans = (updated.detailedPlans || []).map((p: any) => {
              if (p.weekNumber === proposedWeekNumber) {
                return { ...p, rangeText: proposedRangeText };
              }
              return p;
            });
          }
          if (goalValue > 0) {
            updated.goalType = goalType;
            updated.goalValue = goalValue;
            const { plans, calculatedTargetDate } = generateDetailedPlans(
              materialId,
              updated.totalLectures,
              'lecture',
              goalType,
              goalValue,
              updated.completedLectures,
              undefined,
              updated.reviewPasses || [],
              studyDays,
              proposedSpeed,
              updated.estimatedMinutesPerUnit,
              parentSubject?.studyTime,
              updated.category
            );
            updated.detailedPlans = plans;
            updated.targetDate = calculatedTargetDate;
          }
          return updated;
        });
      }
    }
  }
  await saveStudent(student);

  return NextResponse.json({ success: true, student });
}
