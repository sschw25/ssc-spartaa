import { NextResponse } from 'next/server';
import { canAdminAccessStudent } from '@/lib/auth';
import { updateStudentById } from '@/lib/store';
import { generateDetailedPlans, getMaterialStudyDays } from '@/lib/progress-plan';
import { appendThreadMessage } from '@/lib/thread';
import { weekKeyOf } from '@/lib/makeup-carryover';

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
        studyDays: proposedStudyDays,
      } = target.proposedGoal;
      // 학생이 고른 학습 요일(예: 주말 제외) — 자료 단위 단일 소스(studyDays)로 반영해 계획 생성에 투입.
      const nextStudyDays = Array.isArray(proposedStudyDays) && proposedStudyDays.length > 0
        ? proposedStudyDays
        : null;
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
        if (nextStudyDays) { updated.studyDays = nextStudyDays; updated.updatedAt = nowIso; }
        const clampedProgress = hasCurrentProgress ? clampProgress(currentProgress, updated.totalPages) : null;
        if (clampedProgress !== null) {
          const prevCurrent = Number(updated.currentPage || 0);
          updated.currentPage = clampedProgress;
          if (clampedProgress !== prevCurrent) {
            // 승인으로 진도 위치가 바뀐 것도 시작점 조정 이력에 남긴다(auto:false = 승인 배지).
            updated.adjustLog = [...(updated.adjustLog || []), { date: inputDate, from: prevCurrent, to: clampedProgress, auto: false }].slice(-30);
          }
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

        if ((hasCurrentProgress || goalValue > 0 || nextStudyDays) && nextGoalValue > 0) {
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
        if (nextStudyDays) { updated.studyDays = nextStudyDays; updated.updatedAt = nowIso; }
        const clampedProgress = hasCurrentProgress ? clampProgress(currentProgress, updated.totalLectures) : null;
        if (clampedProgress !== null) {
          const prevCurrent = Number(updated.completedLectures || 0);
          updated.completedLectures = clampedProgress;
          if (clampedProgress !== prevCurrent) {
            // 승인으로 진도 위치가 바뀐 것도 시작점 조정 이력에 남긴다(auto:false = 승인 배지).
            updated.adjustLog = [...(updated.adjustLog || []), { date: inputDate, from: prevCurrent, to: clampedProgress, auto: false }].slice(-30);
          }
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

        if ((hasCurrentProgress || goalValue > 0 || hasProposedSpeed || nextStudyDays) && nextGoalValue > 0) {
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

    // 학생 교재/인강 추가 제안(materialAdd) — 기존 proposedGoal 로직과 별개의 형제 분기.
    // 항상 selfPaced 자료로 생성(총량 알든 모르든 자율 누적). 해당 과목이 없으면 새로 만들어 붙인다.
    // createdMaterialId 로 멱등 보장 — 재승인(resolved 토글) 시 자료 중복 생성 방지.
    if (status === 'resolved' && target.proposedMaterial && !target.proposedMaterial.createdMaterialId) {
      const pm = target.proposedMaterial;
      if (!Array.isArray(student.subjects)) student.subjects = [];
      const wantName = (pm.subjectName || '').trim().toLowerCase();
      let subject = student.subjects.find((s: any) => String(s.name || '').trim().toLowerCase() === wantName);
      if (!subject) {
        subject = {
          id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: pm.subjectName.trim(),
          books: [],
          lectures: [],
          updatedAt: nowIso,
        } as any;
        student.subjects.push(subject!);
      }
      const hasTotal = typeof pm.total === 'number' && pm.total > 0;
      const clampedCurrent = pm.currentProgress !== undefined
        ? (clampProgress(pm.currentProgress, hasTotal ? pm.total : 0) ?? 0)
        : 0;
      // 학생이 추가하면서 고른 학습 방식(마감일/하루분량)은 총량이 있어야 계획 생성 가능. 없으면 자율(selfPaced)로 폴백.
      const wantsPlan = (pm.goalType === 'deadlineWeeks' || pm.goalType === 'dailyAmount')
        && Number(pm.goalValue) > 0 && hasTotal;
      const effGoalType: GoalType = wantsPlan ? (pm.goalType as GoalType) : 'selfPaced';
      const effGoalValue = wantsPlan ? Number(pm.goalValue) : 0;
      const effStudyDays = getMaterialStudyDays(subject!.studyDays, pm.studyDays);
      const commonExtra: Record<string, unknown> = {
        goalType: effGoalType,
        ...(wantsPlan ? { goalValue: effGoalValue } : {}),
        ...(pm.studyDays && pm.studyDays.length > 0 ? { studyDays: pm.studyDays } : {}),
        ...(pm.studyTime ? { studyTime: pm.studyTime } : {}),
        ...(hasTotal ? { totalIsEstimate: true } : {}),
      };
      if (pm.materialType === 'book') {
        const newBook: any = {
          id: `book_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          title: pm.title,
          totalPages: hasTotal ? pm.total : 0,
          currentPage: clampedCurrent,
          updatedAt: nowIso,
          category: '기본',
          ...(pm.unit ? { unit: pm.unit } : {}),
          ...commonExtra,
        };
        if (wantsPlan) {
          const { plans, calculatedTargetDate } = generateDetailedPlans(
            newBook.id, pm.total!, 'book', effGoalType, effGoalValue,
            clampedCurrent, pm.unit || undefined, [], effStudyDays, 1.0, undefined, pm.studyTime || undefined, '기본',
          );
          newBook.detailedPlans = plans;
          newBook.targetDate = calculatedTargetDate;
        }
        subject!.books = [...(subject!.books || []), newBook];
        pm.createdMaterialId = newBook.id;
      } else {
        const newLecture: any = {
          id: `lec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: pm.title,
          totalLectures: hasTotal ? pm.total : 0,
          completedLectures: clampedCurrent,
          updatedAt: nowIso,
          category: '기본',
          speedMultiplier: 1.0,
          ...commonExtra,
        };
        if (wantsPlan) {
          const { plans, calculatedTargetDate } = generateDetailedPlans(
            newLecture.id, pm.total!, 'lecture', effGoalType, effGoalValue,
            clampedCurrent, undefined, [], effStudyDays, 1.0, undefined, pm.studyTime || undefined, '기본',
          );
          newLecture.detailedPlans = plans;
          newLecture.targetDate = calculatedTargetDate;
        }
        subject!.lectures = [...(subject!.lectures || []), newLecture];
        pm.createdMaterialId = newLecture.id;
      }
      subject!.updatedAt = nowIso;

      const noticeText = wantsPlan
        ? '요청하신 자료를 학습 계획과 함께 추가했어요. 학습 탭에서 확인할 수 있어요.'
        : '요청하신 자료를 추가했어요. 총량을 알게 되면 예상 강의 수를 입력할 수 있어요.';
      appendThreadMessage(target, { from: 'admin', text: noticeText, author: '코멘터' });
      target.adminReply = noticeText;
      target.repliedAt = nowIso;
    }

    // 학생 주말 보강 수정 제안(makeup) — 승인 시 해당 자료의 makeupDone(주 스코프)을 제안값으로 반영한다.
    // 진도(currentPage/completedLectures)는 건드리지 않는다 → 재승인(resolved 토글) 시에도 멱등.
    if (status === 'resolved' && target.proposedMakeup) {
      const { materialId, materialType, done } = target.proposedMakeup;
      const weekKey = weekKeyOf(kstDateKey());
      const applyMakeup = (material: any) => {
        if (material.id !== materialId) return material;
        const total = materialType === 'book' ? Number(material.totalPages) : Number(material.totalLectures);
        const cap = Number.isFinite(total) && total > 0 ? total : 9999;
        const nextDone = Math.max(0, Math.min(Math.round(Number(done) || 0), cap));
        return { ...material, makeupDone: nextDone, makeupWeekKey: weekKey, updatedAt: nowIso };
      };
      if (materialType === 'book') {
        if (student.subjects) {
          student.subjects = student.subjects.map((sub: any) => ({ ...sub, books: (sub.books || []).map(applyMakeup) }));
        }
        student.books = (student.books || []).map(applyMakeup);
      } else {
        if (student.subjects) {
          student.subjects = student.subjects.map((sub: any) => ({ ...sub, lectures: (sub.lectures || []).map(applyMakeup) }));
        }
        student.lectures = (student.lectures || []).map(applyMakeup);
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
