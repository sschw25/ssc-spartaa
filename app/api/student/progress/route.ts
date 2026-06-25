import { NextRequest, NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { getStudentById, patchStudentProgress } from '@/lib/store';
import type { BookProgress, DetailedPlan, LectureProgress, Student } from '@/lib/types/student';

type UpdatedInfo = {
  value: number;
  total: number;
  planId?: string;
  isCompleted?: boolean;
  solvedQuestions?: number;
  incorrectTags?: Record<string, number>;
};

type MutationResult =
  | { ok: true; updated: UpdatedInfo }
  | { ok: false; reason: 'plan-not-found' | 'material-not-found' };

const clampProgressValue = (value: number, total: number) => {
  const rounded = Math.max(0, Math.round(value));
  return total > 0 ? Math.min(rounded, total) : rounded;
};

const getPlanEndAmount = (plan: DetailedPlan) => {
  const values = (plan.rangeText || '').match(/\d+/g)?.map(Number) || [];
  if (values.length > 0) return values[values.length - 1];
  return Number(plan.targetAmount || 0);
};

function applyProgressMutation(
  student: Student,
  opts: {
    materialType: 'book' | 'lecture';
    materialId: string;
    hasProgressValue: boolean;
    rawValue: number;
    planId: string;
    hasPlanCompletion: boolean;
    hasSolvedQuestions: boolean;
    hasIncorrectTags: boolean;
    body: Record<string, unknown>;
  },
): MutationResult {
  const nowIso = new Date().toISOString();
  const {
    materialType, materialId, hasProgressValue, rawValue,
    planId, hasPlanCompletion, hasSolvedQuestions, hasIncorrectTags, body,
  } = opts;

  if (materialType === 'book') {
    const matchingBooks: BookProgress[] = [
      ...((student.books || []).filter((book) => book.id === materialId)),
      ...((student.subjects || []).flatMap((subject) => (subject.books || []).filter((book) => book.id === materialId))),
    ];

    if (matchingBooks.length === 0) return { ok: false, reason: 'material-not-found' };

    const baseBook = matchingBooks[0];
    const total = baseBook.totalPages || 0;
    let nextValue = hasProgressValue ? clampProgressValue(rawValue, total) : clampProgressValue(baseBook.currentPage || 0, total);

    let planCompletedVal = false;
    let matchedPlan = !hasPlanCompletion;
    if (hasPlanCompletion) {
      matchingBooks.forEach((book) => {
        const plan = (book.detailedPlans || []).find((item) => item.id === planId);
        if (plan) {
          matchedPlan = true;
          plan.isCompleted = Boolean(body.isCompleted);
          planCompletedVal = plan.isCompleted;
          if (plan.isCompleted) {
            nextValue = Math.max(nextValue, clampProgressValue(getPlanEndAmount(plan), total));
            if (typeof body.actualAmount === 'number' && body.actualAmount >= 0) {
              plan.actualAmount = body.actualAmount;
            }
          } else {
            plan.actualAmount = undefined;
          }
        }
      });
      if (!matchedPlan) return { ok: false, reason: 'plan-not-found' };
    }

    matchingBooks.forEach((book) => {
      if (hasSolvedQuestions) {
        const solvedVal = Number(body.solvedQuestions);
        if (Number.isFinite(solvedVal) && solvedVal >= 0) book.solvedQuestions = solvedVal;
      }
      if (hasIncorrectTags) {
        if (typeof body.incorrectTags === 'object' && body.incorrectTags !== null) {
          // 오버포스팅 방지: 엔트리 수 상한 + 값은 0 이상 유한 정수로 정규화
          const raw = body.incorrectTags as Record<string, unknown>;
          const normalized: Record<string, number> = {};
          for (const key of Object.keys(raw).slice(0, 50)) {
            const v = Number(raw[key]);
            if (Number.isFinite(v) && v >= 0) {
              normalized[String(key).slice(0, 60)] = Math.min(9999, Math.round(v));
            }
          }
          book.incorrectTags = normalized;
        }
      }
      book.currentPage = nextValue;
      book.updatedAt = nowIso;
    });

    return {
      ok: true,
      updated: {
        value: nextValue,
        total,
        ...(hasPlanCompletion ? { planId, isCompleted: planCompletedVal } : {}),
        solvedQuestions: baseBook.solvedQuestions,
        incorrectTags: baseBook.incorrectTags,
      },
    };
  } else {
    const matchingLectures: LectureProgress[] = [
      ...((student.lectures || []).filter((lecture) => lecture.id === materialId)),
      ...((student.subjects || []).flatMap((subject) => (subject.lectures || []).filter((lecture) => lecture.id === materialId))),
    ];

    if (matchingLectures.length === 0) return { ok: false, reason: 'material-not-found' };

    const baseLecture = matchingLectures[0];
    const total = baseLecture.totalLectures || 0;
    let nextValue = hasProgressValue ? clampProgressValue(rawValue, total) : clampProgressValue(baseLecture.completedLectures || 0, total);

    let planCompletedVal = false;
    let matchedPlan = !hasPlanCompletion;
    if (hasPlanCompletion) {
      matchingLectures.forEach((lecture) => {
        const plan = (lecture.detailedPlans || []).find((item) => item.id === planId);
        if (plan) {
          matchedPlan = true;
          plan.isCompleted = Boolean(body.isCompleted);
          planCompletedVal = plan.isCompleted;
          if (plan.isCompleted) {
            nextValue = Math.max(nextValue, clampProgressValue(getPlanEndAmount(plan), total));
            if (typeof body.actualAmount === 'number' && body.actualAmount >= 0) {
              plan.actualAmount = body.actualAmount;
            }
          } else {
            plan.actualAmount = undefined;
          }
        }
      });
      if (!matchedPlan) return { ok: false, reason: 'plan-not-found' };
    }

    matchingLectures.forEach((lecture) => {
      lecture.completedLectures = nextValue;
      lecture.updatedAt = nowIso;
    });

    return {
      ok: true,
      updated: {
        value: nextValue,
        total,
        ...(hasPlanCompletion ? { planId, isCompleted: planCompletedVal } : {}),
      },
    };
  }
}

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
    actualAmount?: unknown;
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

  const mutationOpts = {
    materialType: materialType as 'book' | 'lecture',
    materialId,
    hasProgressValue,
    rawValue,
    planId,
    hasPlanCompletion,
    hasSolvedQuestions,
    hasIncorrectTags,
    body: body as Record<string, unknown>,
  };

  // optimistic locking: 최대 2회 시도, conflict 시 fresh 데이터로 재시도
  for (let attempt = 0; attempt < 2; attempt++) {
    const student = await getStudentById(studentId);
    if (!student) {
      return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    const originalUpdatedAt = student.updatedAt ?? '';
    const result = applyProgressMutation(student, mutationOpts);

    if (!result.ok) {
      const msg = result.reason === 'plan-not-found'
        ? '해당 주간 계획을 찾을 수 없습니다.'
        : '해당 학습 자료를 찾을 수 없습니다.';
      return NextResponse.json({ success: false, message: msg }, { status: 404 });
    }

    const saved = await patchStudentProgress(student, originalUpdatedAt);
    if (saved === 'conflict') continue;

    const { updated } = result;
    return NextResponse.json({
      success: true,
      value: updated.value,
      total: updated.total,
      planId: updated.planId,
      isCompleted: updated.isCompleted,
      solvedQuestions: updated.solvedQuestions,
      incorrectTags: updated.incorrectTags,
    });
  }

  return NextResponse.json(
    { success: false, message: '진도 저장 충돌, 다시 시도해주세요.' },
    { status: 409 },
  );
}
