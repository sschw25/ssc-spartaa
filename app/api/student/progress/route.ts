import { NextRequest, NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { getStudentById, saveStudent } from '@/lib/store';
import type { DetailedPlan } from '@/lib/types/student';

// 학생이 본인 교재/인강 진도를 직접 갱신 (즉시 반영)
export async function PATCH(req: NextRequest) {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }

  let body: { 
    materialType?: unknown; 
    materialId?: unknown; 
    value?: unknown; 
    planId?: unknown; 
    isCompleted?: unknown;
    solvedQuestions?: unknown;
    incorrectTags?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const materialType = body?.materialType === 'lecture' ? 'lecture' : body?.materialType === 'book' ? 'book' : null;
  const materialId = typeof body?.materialId === 'string' ? body.materialId : '';
  const hasProgressValue = body?.value !== undefined;
  const rawValue = hasProgressValue ? Number(body.value) : 0;
  const planId = typeof body?.planId === 'string' ? body.planId : '';
  const hasPlanCompletion = planId.length > 0 && typeof body?.isCompleted === 'boolean';
  const hasSolvedQuestions = body?.solvedQuestions !== undefined;
  const hasIncorrectTags = body?.incorrectTags !== undefined;

  if (!materialType || !materialId) {
    return NextResponse.json({ success: false, message: '대상 자료 정보가 올바르지 않습니다.' }, { status: 400 });
  }
  if (!hasProgressValue && !hasPlanCompletion && !hasSolvedQuestions && !hasIncorrectTags) {
    return NextResponse.json({ success: false, message: '진도 값 또는 완료 계획 정보, 혹은 해결 문항수 등이 필요합니다.' }, { status: 400 });
  }
  if (hasProgressValue && (!Number.isFinite(rawValue) || rawValue < 0)) {
    return NextResponse.json({ success: false, message: '진도 값이 올바르지 않습니다.' }, { status: 400 });
  }
  if (planId && typeof body?.isCompleted !== 'boolean') {
    return NextResponse.json({ success: false, message: '완료 체크 값이 올바르지 않습니다.' }, { status: 400 });
  }

  const student = await getStudentById(studentId);
  if (!student) {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }

  const nowIso = new Date().toISOString();
  let updated: { 
    value: number; 
    total: number; 
    planId?: string; 
    isCompleted?: boolean;
    solvedQuestions?: number;
    incorrectTags?: Record<string, number>;
  } | null = null;

  const clampProgressValue = (value: number, total: number) => {
    const rounded = Math.max(0, Math.round(value));
    return total > 0 ? Math.min(rounded, total) : rounded;
  };

  const getPlanEndAmount = (plan: DetailedPlan) => {
    const values = (plan.rangeText || '').match(/\d+/g)?.map(Number) || [];
    if (values.length > 0) return values[values.length - 1];
    return Number(plan.targetAmount || 0);
  };

  for (const subject of student.subjects || []) {
    if (materialType === 'book') {
      const book = (subject.books || []).find((b) => b.id === materialId);
      if (book) {
        const total = book.totalPages || 0;
        let nextValue = hasProgressValue ? clampProgressValue(rawValue, total) : clampProgressValue(book.currentPage || 0, total);

        if (hasPlanCompletion) {
          const plan = (book.detailedPlans || []).find((p) => p.id === planId);
          if (!plan) {
            return NextResponse.json({ success: false, message: '해당 주간 계획을 찾을 수 없습니다.' }, { status: 404 });
          }

          plan.isCompleted = Boolean(body.isCompleted);
          if (plan.isCompleted) {
            nextValue = Math.max(nextValue, clampProgressValue(getPlanEndAmount(plan), total));
          }
        }

        if (hasSolvedQuestions) {
          const solvedVal = Number(body.solvedQuestions);
          if (Number.isFinite(solvedVal) && solvedVal >= 0) {
            book.solvedQuestions = solvedVal;
          }
        }

        if (hasIncorrectTags) {
          if (typeof body.incorrectTags === 'object' && body.incorrectTags !== null) {
            book.incorrectTags = body.incorrectTags as Record<string, number>;
          }
        }

        book.currentPage = nextValue;
        book.updatedAt = nowIso;
        updated = { 
          value: nextValue, 
          total, 
          ...(hasPlanCompletion ? { planId, isCompleted: Boolean(body.isCompleted) } : {}),
          solvedQuestions: book.solvedQuestions,
          incorrectTags: book.incorrectTags
        };
        break;
      }
    } else {
      const lecture = (subject.lectures || []).find((l) => l.id === materialId);
      if (lecture) {
        const total = lecture.totalLectures || 0;
        let nextValue = hasProgressValue ? clampProgressValue(rawValue, total) : clampProgressValue(lecture.completedLectures || 0, total);

        if (hasPlanCompletion) {
          const plan = (lecture.detailedPlans || []).find((p) => p.id === planId);
          if (!plan) {
            return NextResponse.json({ success: false, message: '해당 주간 계획을 찾을 수 없습니다.' }, { status: 404 });
          }

          plan.isCompleted = Boolean(body.isCompleted);
          if (plan.isCompleted) {
            nextValue = Math.max(nextValue, clampProgressValue(getPlanEndAmount(plan), total));
          }
        }

        lecture.completedLectures = nextValue;
        lecture.updatedAt = nowIso;
        updated = { value: nextValue, total, ...(hasPlanCompletion ? { planId, isCompleted: Boolean(body.isCompleted) } : {}) };
        break;
      }
    }
  }

  if (!updated) {
    return NextResponse.json({ success: false, message: '해당 학습 자료를 찾을 수 없습니다.' }, { status: 404 });
  }

  await saveStudent(student);
  return NextResponse.json({ 
    success: true, 
    value: updated.value, 
    total: updated.total, 
    planId: updated.planId, 
    isCompleted: updated.isCompleted,
    solvedQuestions: (updated as any).solvedQuestions,
    incorrectTags: (updated as any).incorrectTags
  });
}
