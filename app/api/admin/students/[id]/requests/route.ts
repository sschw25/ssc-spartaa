import { NextResponse } from 'next/server';
import { canAdminAccessStudent } from '@/lib/auth';
import { updateStudentById } from '@/lib/store';
import { generateDetailedPlans, getMaterialStudyDays } from '@/lib/progress-plan';
import { appendThreadMessage } from '@/lib/thread';
import { weekKeyOf } from '@/lib/makeup-carryover';

type GoalType = 'weeks' | 'weeklyAmount' | 'dailyAmount' | 'deadlineWeeks' | 'selfPaced';

const kstDateKey = (at?: string) => {
  const d = at ? new Date(at) : new Date();
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(Number.isNaN(d.getTime()) ? new Date() : d);
};

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

  let body: { requestId?: unknown; status?: unknown; reply?: unknown; planStartDateOverride?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const requestId = typeof body?.requestId === 'string' ? body.requestId : '';
  const status = body?.status === 'pending' ? 'pending' : body?.status === 'resolved' ? 'resolved' : null;
  const reply = typeof body?.reply === 'string' ? body.reply.trim() : null;
  const planStartDateOverride = typeof body?.planStartDateOverride === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.planStartDateOverride)
    ? body.planStartDateOverride
    : undefined;
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
        currentProgress,
        proposedWeekNumber,
        proposedRangeText,
        studyDays: proposedStudyDays,
      } = target.proposedGoal;
      // 계획 시작일: 관리자 override > 학생 선택. 과거 날짜는 오늘로 보정(승인 지연 시 첫날부터 뒤처진 계획 방지).
      const approvalDateKey = kstDateKey();
      let planStartDate = planStartDateOverride || target.proposedGoal.planStartDate;
      if (planStartDate && planStartDate < approvalDateKey) planStartDate = approvalDateKey;
      // 기록에는 클램프된 값 저장 — 과거 override 가 raw 로 남아 표시·실제가 어긋나지 않게.
      if (planStartDateOverride) target.proposedGoal.planStartDate = planStartDate || planStartDateOverride;
      // 마감일 모드: 학생이 신청 시점에 환산한 주수는 시작일이 바뀌면 어긋난다 — 목표 완료일 기준으로 재환산.
      // 목표일이 이미 지났으면(승인 방치) 1주 최단 계획으로 — 학생이 고른 마감을 조용히 초과 생성하지 않는다.
      let goalValue = target.proposedGoal.goalValue;
      if (goalType === 'deadlineWeeks' && target.proposedGoal.targetDate) {
        const fromMs = new Date(`${planStartDate || approvalDateKey}T00:00:00+09:00`).getTime();
        const toMs = new Date(`${target.proposedGoal.targetDate}T00:00:00+09:00`).getTime();
        const days = Math.round((toMs - fromMs) / 86400000);
        goalValue = days > 0 ? Math.min(12, Math.max(1, Math.ceil(days / 7))) : 1;
      }
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
            updated.category,
            planStartDate
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
            updated.category,
            planStartDate
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
      // 계획 시작일: 관리자 override > 학생 선택. 과거 날짜는 오늘로 보정(승인 지연 시 첫날부터 뒤처진 계획 방지).
      const pmApprovalDateKey = kstDateKey();
      let planStartDate = planStartDateOverride || pm.planStartDate;
      if (planStartDate && planStartDate < pmApprovalDateKey) planStartDate = pmApprovalDateKey;
      // 기록에는 클램프된 값 저장 — 과거 override 가 raw 로 남아 표시·실제가 어긋나지 않게.
      if (planStartDateOverride) pm.planStartDate = planStartDate || planStartDateOverride;
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
      let effGoalValue = wantsPlan ? Number(pm.goalValue) : 0;
      // 마감일 모드: 시작일이 바뀌면 주수도 목표 완료일 기준으로 재환산(proposedGoal 분기와 동일 규칙).
      // 목표일이 이미 지났으면 1주 최단 계획으로.
      if (wantsPlan && pm.goalType === 'deadlineWeeks' && pm.targetDate) {
        const fromMs = new Date(`${planStartDate || pmApprovalDateKey}T00:00:00+09:00`).getTime();
        const toMs = new Date(`${pm.targetDate}T00:00:00+09:00`).getTime();
        const days = Math.round((toMs - fromMs) / 86400000);
        effGoalValue = days > 0 ? Math.min(12, Math.max(1, Math.ceil(days / 7))) : 1;
      }
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
            clampedCurrent, pm.unit || undefined, [], effStudyDays, 1.0, undefined, pm.studyTime || undefined, '기본', planStartDate,
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
          // 신청 폼에서 '오답노트 사용'을 체크한 인강 — 오답노트 탭에 노출
          ...(pm.useWrongNotes ? { useWrongNotes: true } : {}),
          ...commonExtra,
        };
        if (wantsPlan) {
          const { plans, calculatedTargetDate } = generateDetailedPlans(
            newLecture.id, pm.total!, 'lecture', effGoalType, effGoalValue,
            clampedCurrent, undefined, [], effStudyDays, 1.0, undefined, pm.studyTime || undefined, '기본', planStartDate,
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

    // 학생 기존 교재/인강 수정 제안(materialEdit) — 추가/삭제와 대칭인 형제 분기.
    // subjects(진도 단일소스)와 top-level books/lectures 미러 양쪽의 대상 자료에 "제안된 필드만" 반영한다(dual-write).
    // 목표(goalType/goalValue)·계획(detailedPlans)은 건드리지 않는다 → 총 분량·요일이 바뀌어도 기존 계획은
    // 그대로 남는다(필요하면 관리자가 학습계획을 따로 재생성. 인박스가 계획 보유 자료면 그렇게 안내한다).
    // 진도도 유지가 원칙이나, 총량이 진도보다 작아지는 경우만 새 총량으로 맞춘다(100% 초과 방지).
    // appliedAt 마킹으로 재승인(resolved 토글) 시 중복 반영 방지(멱등).
    if (status === 'resolved' && target.proposedMaterialEdit && !target.proposedMaterialEdit.appliedAt) {
      const pme = target.proposedMaterialEdit;
      const listKey = pme.materialType === 'book' ? 'books' : 'lectures';
      const progressKey = pme.materialType === 'book' ? 'currentPage' : 'completedLectures';
      // 현재 자료를 먼저 찾는다 — goalType/진도에 따라 반영 방식이 갈리기 때문(아래 studySlot·clamp).
      const currentMaterial = [
        ...(student.subjects || []).flatMap((sub: any) => sub[listKey] || []),
        ...(student[listKey] || []),
      ].find((m: any) => m?.id === pme.materialId);

      const patch: Record<string, unknown> = {};
      if (pme.title) patch[pme.materialType === 'book' ? 'title' : 'name'] = pme.title;
      if (typeof pme.total === 'number' && pme.total > 0) {
        patch[pme.materialType === 'book' ? 'totalPages' : 'totalLectures'] = pme.total;
        // 관리자가 확인하고 승인한 값이므로 더 이상 학생 예측치가 아니다.
        patch.totalIsEstimate = false;
        // 총량이 줄어 진도가 총량을 넘게 되면 진도를 새 총량에 맞춘다(=완료). 그대로 두면 100% 초과가 된다.
        const currentProgress = Number(currentMaterial?.[progressKey]) || 0;
        if (currentProgress > pme.total) patch[progressKey] = pme.total;
      }
      if (pme.unit && pme.materialType === 'book') patch.unit = pme.unit;
      if (pme.studyDays && pme.studyDays.length > 0) patch.studyDays = pme.studyDays;
      if (pme.studyTime !== undefined) {
        // 시간대는 관리자 소유 필드(studyTime)에 반영한다.
        patch.studyTime = pme.studyTime;
        // studySlot(학생 소유·우선순위 1위)이 살아 있으면 studyTime을 덮어써 승인 결과가 화면에 안 보인다.
        // selfPaced 자료는 studySlot 이 시간표 노출의 단일 소스라 반드시 맞춰 주고,
        // 계획형 자료는 studySlot 을 남기면 이후 관리자 시간대 편집이 영구히 묻히므로(STUDENT_OWNED_MATERIAL_FIELDS
        // 라 전체저장으로도 못 지움) 기존에 값이 있을 때만 동기화한다.
        if (currentMaterial?.goalType === 'selfPaced' || currentMaterial?.studySlot) {
          patch.studySlot = pme.studyTime;
        }
      }

      // 대상 id 하나에만 적용. 이미 없는 자료면 no-op(에러 없이 마킹만) — 삭제 분기와 같은 안전 우선 규칙.
      const applyTo = (m: any) => (m?.id === pme.materialId ? { ...m, ...patch, updatedAt: nowIso } : m);
      if (Array.isArray(student.subjects)) {
        student.subjects = student.subjects.map((sub: any) => ({
          ...sub,
          [listKey]: (sub[listKey] || []).map(applyTo),
        }));
      }
      student[listKey] = (student[listKey] || []).map(applyTo);

      pme.appliedAt = nowIso;

      const noticeText = `요청하신 대로 '${pme.materialTitle}' 정보를 수정했어요.`;
      appendThreadMessage(target, { from: 'admin', text: noticeText, author: '코멘터' });
      target.adminReply = noticeText;
      target.repliedAt = nowIso;
    }

    // 학생 교재/인강 또는 과목 삭제 제안(materialDelete) — proposedMaterial(추가)과 대칭인 형제 분기.
    // subjects(진도 단일소스)와 top-level books/lectures 미러 양쪽에서 대상을 제거한다(dual-write).
    // 이미 없는 대상(다른 경로로 지워짐 등)이어도 필터가 no-op 이므로 에러 없이 deletedAt만 마킹(멱등·안전 우선).
    if (status === 'resolved' && target.proposedMaterialDelete && !target.proposedMaterialDelete.deletedAt) {
      const pmd = target.proposedMaterialDelete;
      if (pmd.scope === 'material' && pmd.materialId && pmd.materialType) {
        const materialId = pmd.materialId;
        if (pmd.materialType === 'book') {
          if (student.subjects) {
            student.subjects = student.subjects.map((sub: any) => ({
              ...sub,
              books: (sub.books || []).filter((b: any) => b.id !== materialId),
            }));
          }
          student.books = (student.books || []).filter((b: any) => b.id !== materialId);
        } else {
          if (student.subjects) {
            student.subjects = student.subjects.map((sub: any) => ({
              ...sub,
              lectures: (sub.lectures || []).filter((l: any) => l.id !== materialId),
            }));
          }
          student.lectures = (student.lectures || []).filter((l: any) => l.id !== materialId);
        }
      } else if (pmd.scope === 'subject' && pmd.subjectId) {
        const subjectId = pmd.subjectId;
        const targetSubject = (student.subjects || []).find((s: any) => s.id === subjectId);
        const removedBookIds = new Set((targetSubject?.books || []).map((b: any) => b.id));
        const removedLectureIds = new Set((targetSubject?.lectures || []).map((l: any) => l.id));
        if (student.subjects) {
          student.subjects = student.subjects.filter((s: any) => s.id !== subjectId);
        }
        if (removedBookIds.size > 0) {
          student.books = (student.books || []).filter((b: any) => !removedBookIds.has(b.id));
        }
        if (removedLectureIds.size > 0) {
          student.lectures = (student.lectures || []).filter((l: any) => !removedLectureIds.has(l.id));
        }
      }

      pmd.deletedAt = nowIso;

      const noticeText = pmd.scope === 'subject'
        ? `요청하신 대로 '${pmd.subjectName}' 과목을 삭제했어요.`
        : `요청하신 대로 '${pmd.materialTitle || pmd.subjectName}'을(를) 삭제했어요.`;
      appendThreadMessage(target, { from: 'admin', text: noticeText, author: '코멘터' });
      target.adminReply = noticeText;
      target.repliedAt = nowIso;
    }

    // 학생 주말 보강 수정 제안(makeup) — 승인 시 해당 자료의 makeupDone(주 스코프)을 제안값으로 반영한다.
    // 진도(currentPage/completedLectures)는 건드리지 않는다 → 재승인(resolved 토글) 시에도 멱등.
    if (status === 'resolved' && target.proposedMakeup) {
      const { materialId, materialType, done } = target.proposedMakeup;
      // 신청 시점(createdAt) 기준 주차로 귀속 — 주말 신청을 다음 주에 승인해도 지난 주 보강이 정정되게.
      const weekKey = weekKeyOf(kstDateKey(target.createdAt));
      const applyMakeup = (material: any) => {
        if (material.id !== materialId) return material;
        // 자료에 더 새로운 주차의 보강 기록이 이미 있으면 낡은 정정으로 덮어쓰지 않는다.
        if (typeof material.makeupWeekKey === 'string' && material.makeupWeekKey > weekKey) return material;
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
