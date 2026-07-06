import { NextRequest, NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { getStudentById, patchStudentProgress } from '@/lib/store';
import type { BookProgress, DetailedPlan, LectureProgress, Student } from '@/lib/types/student';

type UpdatedInfo = {
  value: number;
  total: number;
  planId?: string;
  isCompleted?: boolean;
  dateKey?: string;
  actualAmount?: number;
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

// 진도 입력한 날(KST)을 자료 inputLog 에 축적 — 중복제거·최근 120일 캡. 히트맵용.
const kstToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
function appendInputLog(material: { inputLog?: string[] }) {
  const today = kstToday();
  const log = material.inputLog || [];
  const next = log.includes(today) ? log : [...log, today];
  material.inputLog = next.slice(-120);
}

const getPlanEndAmount = (plan: DetailedPlan) => {
  const values = (plan.rangeText || '').match(/\d+/g)?.map(Number) || [];
  if (values.length > 0) return values[values.length - 1];
  return Number(plan.targetAmount || 0);
};

// rangeText 에서 시작량(누적 기준 이전량+1)을 추출. 기간 목표 current 동기화에 사용.
const getPlanStartAmount = (plan: DetailedPlan) => {
  const values = (plan.rangeText || '').match(/\d+/g)?.map(Number).filter(Number.isFinite) || [];
  const end = values.length > 0 ? values[values.length - 1] : Number(plan.targetAmount || 0);
  const start = values.length > 1
    ? values[values.length - 2]
    : Math.max(1, end - Number(plan.targetAmount || 0) + 1);
  return start;
};

const getPlanDailyAmount = (plan: DetailedPlan) =>
  Math.max(0, Math.round(plan.dailyAmount ?? Math.ceil((plan.targetAmount || 1) / 6)));

const getActualAmountFromBody = (body: Record<string, unknown>, plan: DetailedPlan) => {
  const actualAmount = Number(body.actualAmount);
  return Number.isFinite(actualAmount) && actualAmount >= 0
    ? Math.round(actualAmount)
    : getPlanDailyAmount(plan);
};

// 기간 목표(deadline) 누적 진행량 입력 — plan.actualAmount(0~target 캡)·isCompleted 갱신 +
// 자료 current(currentPage/completedLectures)를 rangeText 시작량 기준으로 best-effort 동기화.
function applyDeadlineMutation(
  student: Student,
  materialType: 'book' | 'lecture',
  materialId: string,
  planId: string,
  rawAmount: number,
): MutationResult {
  const nowIso = new Date().toISOString();
  if (materialType === 'book') {
    const matchingBooks: BookProgress[] = [
      ...((student.books || []).filter((book) => book.id === materialId)),
      ...((student.subjects || []).flatMap((subject) => (subject.books || []).filter((book) => book.id === materialId))),
    ];
    if (matchingBooks.length === 0) return { ok: false, reason: 'material-not-found' };
    const total = matchingBooks[0].totalPages || 0;
    let matchedPlan = false;
    let actual = 0;
    let completed = false;
    let nextCurrent = matchingBooks[0].currentPage || 0;
    matchingBooks.forEach((book) => {
      const plan = (book.detailedPlans || []).find((item) => item.id === planId);
      if (!plan) return;
      matchedPlan = true;
      const target = Math.max(0, Number(plan.targetAmount || 0));
      actual = Math.min(target, Math.max(0, Math.round(rawAmount)));
      completed = target > 0 && actual >= target;
      plan.actualAmount = actual;
      plan.isCompleted = completed;
      const startAmount = getPlanStartAmount(plan);
      nextCurrent = clampProgressValue(startAmount - 1 + actual, total);
    });
    if (!matchedPlan) return { ok: false, reason: 'plan-not-found' };
    matchingBooks.forEach((book) => { book.currentPage = nextCurrent; book.updatedAt = nowIso; appendInputLog(book); });
    return { ok: true, updated: { value: nextCurrent, total, planId, isCompleted: completed, actualAmount: actual } };
  } else {
    const matchingLectures: LectureProgress[] = [
      ...((student.lectures || []).filter((lecture) => lecture.id === materialId)),
      ...((student.subjects || []).flatMap((subject) => (subject.lectures || []).filter((lecture) => lecture.id === materialId))),
    ];
    if (matchingLectures.length === 0) return { ok: false, reason: 'material-not-found' };
    const total = matchingLectures[0].totalLectures || 0;
    let matchedPlan = false;
    let actual = 0;
    let completed = false;
    let nextCurrent = matchingLectures[0].completedLectures || 0;
    matchingLectures.forEach((lecture) => {
      const plan = (lecture.detailedPlans || []).find((item) => item.id === planId);
      if (!plan) return;
      matchedPlan = true;
      const target = Math.max(0, Number(plan.targetAmount || 0));
      actual = Math.min(target, Math.max(0, Math.round(rawAmount)));
      completed = target > 0 && actual >= target;
      plan.actualAmount = actual;
      plan.isCompleted = completed;
      const startAmount = getPlanStartAmount(plan);
      nextCurrent = clampProgressValue(startAmount - 1 + actual, total);
    });
    if (!matchedPlan) return { ok: false, reason: 'plan-not-found' };
    matchingLectures.forEach((lecture) => { lecture.completedLectures = nextCurrent; lecture.updatedAt = nowIso; appendInputLog(lecture); });
    return { ok: true, updated: { value: nextCurrent, total, planId, isCompleted: completed, actualAmount: actual } };
  }
}

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
    dateKey: string;
    body: Record<string, unknown>;
  },
): MutationResult {
  const nowIso = new Date().toISOString();
  const {
    materialType, materialId, hasProgressValue, rawValue,
    planId, hasPlanCompletion, hasSolvedQuestions, hasIncorrectTags, dateKey, body,
  } = opts;

  if (materialType === 'book') {
    const matchingBooks: BookProgress[] = [
      ...((student.books || []).filter((book) => book.id === materialId)),
      ...((student.subjects || []).flatMap((subject) => (subject.books || []).filter((book) => book.id === materialId))),
    ];

    if (matchingBooks.length === 0) return { ok: false, reason: 'material-not-found' };

    const baseBook = matchingBooks[0];
    const total = baseBook.totalPages || 0;
    // 자율 입력(selfPaced) 자료는 목표 총량 개념이 없다 — 총량 상한(clamp cap) 없이 누적을 허용한다.
    const clampTotal = baseBook.goalType === 'selfPaced' ? 0 : total;
    let nextValue = hasProgressValue ? clampProgressValue(rawValue, clampTotal) : clampProgressValue(baseBook.currentPage || 0, clampTotal);

    let planCompletedVal = false;
    let planActualAmount: number | undefined;
    let matchedPlan = !hasPlanCompletion;
    if (hasPlanCompletion) {
      let dailyDeltaApplied = false;
      matchingBooks.forEach((book) => {
        const plan = (book.detailedPlans || []).find((item) => item.id === planId);
        if (plan) {
          matchedPlan = true;
          const nextCompleted = Boolean(body.isCompleted);
          planCompletedVal = nextCompleted;

          if (dateKey) {
            const currentDaily = plan.dailyCompletions?.[dateKey];
            const previousAmount = currentDaily?.isCompleted && typeof currentDaily.actualAmount === 'number'
              ? currentDaily.actualAmount
              : 0;

            if (nextCompleted) {
              const actualAmount = getActualAmountFromBody(body, plan);
              planActualAmount = actualAmount;
              plan.dailyCompletions = {
                ...(plan.dailyCompletions || {}),
                [dateKey]: { isCompleted: true, actualAmount, completedAt: nowIso },
              };
              if (!dailyDeltaApplied) {
                nextValue = clampProgressValue(nextValue + actualAmount - previousAmount, total);
                dailyDeltaApplied = true;
              }
            } else {
              if (plan.dailyCompletions) {
                const nextDailyCompletions = { ...plan.dailyCompletions };
                delete nextDailyCompletions[dateKey];
                plan.dailyCompletions = Object.keys(nextDailyCompletions).length > 0 ? nextDailyCompletions : undefined;
              }
              if (!dailyDeltaApplied) {
                nextValue = clampProgressValue(nextValue - previousAmount, total);
                dailyDeltaApplied = true;
              }
              planActualAmount = undefined;
            }
          } else {
            plan.isCompleted = nextCompleted;
            if (plan.isCompleted) {
              nextValue = Math.max(nextValue, clampProgressValue(getPlanEndAmount(plan), total));
              if (typeof body.actualAmount === 'number' && body.actualAmount >= 0) {
                plan.actualAmount = body.actualAmount;
                planActualAmount = body.actualAmount;
              }
            } else {
              plan.actualAmount = undefined;
              planActualAmount = undefined;
            }
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
      appendInputLog(book);
    });

    return {
      ok: true,
      updated: {
        value: nextValue,
        total,
        ...(hasPlanCompletion ? { planId, isCompleted: planCompletedVal } : {}),
        ...(hasPlanCompletion && dateKey ? { dateKey, actualAmount: planActualAmount } : {}),
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
    // 자율 입력(selfPaced) 자료는 목표 총량 개념이 없다 — 총량 상한(clamp cap) 없이 누적을 허용한다.
    const clampTotal = baseLecture.goalType === 'selfPaced' ? 0 : total;
    let nextValue = hasProgressValue ? clampProgressValue(rawValue, clampTotal) : clampProgressValue(baseLecture.completedLectures || 0, clampTotal);

    let planCompletedVal = false;
    let planActualAmount: number | undefined;
    let matchedPlan = !hasPlanCompletion;
    if (hasPlanCompletion) {
      let dailyDeltaApplied = false;
      matchingLectures.forEach((lecture) => {
        const plan = (lecture.detailedPlans || []).find((item) => item.id === planId);
        if (plan) {
          matchedPlan = true;
          const nextCompleted = Boolean(body.isCompleted);
          planCompletedVal = nextCompleted;

          if (dateKey) {
            const currentDaily = plan.dailyCompletions?.[dateKey];
            const previousAmount = currentDaily?.isCompleted && typeof currentDaily.actualAmount === 'number'
              ? currentDaily.actualAmount
              : 0;

            if (nextCompleted) {
              const actualAmount = getActualAmountFromBody(body, plan);
              planActualAmount = actualAmount;
              plan.dailyCompletions = {
                ...(plan.dailyCompletions || {}),
                [dateKey]: { isCompleted: true, actualAmount, completedAt: nowIso },
              };
              if (!dailyDeltaApplied) {
                nextValue = clampProgressValue(nextValue + actualAmount - previousAmount, total);
                dailyDeltaApplied = true;
              }
            } else {
              if (plan.dailyCompletions) {
                const nextDailyCompletions = { ...plan.dailyCompletions };
                delete nextDailyCompletions[dateKey];
                plan.dailyCompletions = Object.keys(nextDailyCompletions).length > 0 ? nextDailyCompletions : undefined;
              }
              if (!dailyDeltaApplied) {
                nextValue = clampProgressValue(nextValue - previousAmount, total);
                dailyDeltaApplied = true;
              }
              planActualAmount = undefined;
            }
          } else {
            plan.isCompleted = nextCompleted;
            if (plan.isCompleted) {
              nextValue = Math.max(nextValue, clampProgressValue(getPlanEndAmount(plan), total));
              if (typeof body.actualAmount === 'number' && body.actualAmount >= 0) {
                plan.actualAmount = body.actualAmount;
                planActualAmount = body.actualAmount;
              }
            } else {
              plan.actualAmount = undefined;
              planActualAmount = undefined;
            }
          }
        }
      });
      if (!matchedPlan) return { ok: false, reason: 'plan-not-found' };
    }

    matchingLectures.forEach((lecture) => {
      lecture.completedLectures = nextValue;
      lecture.updatedAt = nowIso;
      appendInputLog(lecture);
    });

    return {
      ok: true,
      updated: {
        value: nextValue,
        total,
        ...(hasPlanCompletion ? { planId, isCompleted: planCompletedVal } : {}),
        ...(hasPlanCompletion && dateKey ? { dateKey, actualAmount: planActualAmount } : {}),
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
    dateKey?: unknown;
    actualAmount?: unknown;
    solvedQuestions?: unknown;
    incorrectTags?: unknown;
    deadlineAmount?: unknown;
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
  const dateKey = typeof body?.dateKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.dateKey) ? body.dateKey : '';
  const hasPlanCompletion = planId.length > 0 && typeof body?.isCompleted === 'boolean';
  const hasSolvedQuestions = body?.solvedQuestions !== undefined;
  const hasIncorrectTags = body?.incorrectTags !== undefined;
  // 기간 목표(deadline) 누적 진행량 입력 — planId + deadlineAmount(숫자). isCompleted 미동반.
  const hasDeadlineAmount = planId.length > 0 && body?.deadlineAmount !== undefined;
  const deadlineAmount = hasDeadlineAmount ? Number(body.deadlineAmount) : 0;

  if (!materialType || !materialId) {
    return NextResponse.json({ success: false, message: '대상 자료 정보가 올바르지 않습니다.' }, { status: 400 });
  }

  // 기간 목표 진행 입력은 전용 경로로 처리(일반 진도/완료 검증과 분리).
  if (hasDeadlineAmount) {
    if (!Number.isFinite(deadlineAmount) || deadlineAmount < 0) {
      return NextResponse.json({ success: false, message: '진행량이 올바르지 않습니다.' }, { status: 400 });
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      const student = await getStudentById(studentId);
      if (!student) {
        return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
      }
      const originalUpdatedAt = student.updatedAt ?? '';
      const result = applyDeadlineMutation(student, materialType as 'book' | 'lecture', materialId, planId, deadlineAmount);
      if (!result.ok) {
        const msg = result.reason === 'plan-not-found' ? '해당 기간 목표를 찾을 수 없습니다.' : '해당 학습 자료를 찾을 수 없습니다.';
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
        actualAmount: updated.actualAmount,
      });
    }
    return NextResponse.json({ success: false, message: '진도 저장 충돌, 다시 시도해주세요.' }, { status: 409 });
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
    dateKey,
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
      dateKey: updated.dateKey,
      actualAmount: updated.actualAmount,
      solvedQuestions: updated.solvedQuestions,
      incorrectTags: updated.incorrectTags,
    });
  }

  return NextResponse.json(
    { success: false, message: '진도 저장 충돌, 다시 시도해주세요.' },
    { status: 409 },
  );
}
