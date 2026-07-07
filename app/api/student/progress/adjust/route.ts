import { NextRequest, NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { getStudentById, patchStudentProgress, updateStudentById } from '@/lib/store';
import { generateDetailedPlans, getMaterialStudyDays } from '@/lib/progress-plan';
import { normalizeProposedGoal } from '@/lib/student-requests';
import type { BookProgress, ConsultationLog, LectureProgress } from '@/lib/types/student';

// 학생 "오늘 시작점" 미세 조정 — current(currentPage/completedLectures)를 옮기고
// 해당 자료 계획을 오늘 anchor 로 재생성한다(기존 goal 설정 보존).
// - 자동 승인: 하루 누적 |delta| 합계가 전체 분량의 1/10(최소 1) 이내면 즉시 반영.
// - 초과: 사유 필수 → consultationLogs 에 type:'request' pending 신청 생성(관리자 승인은
//   기존 admin/students/[id]/requests PATCH 가 그대로 처리 — 이 라우트는 신청만 만든다).
// - 대상 제외: selfPaced 자료·세부 계획 없는 자료(자유 입력이 이미 있음).

type GoalType = 'weeks' | 'weeklyAmount' | 'dailyAmount' | 'deadlineWeeks' | 'selfPaced';
type MaterialLike = (BookProgress | LectureProgress) & { title?: string; name?: string };

const kstDateKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());

// 하루 자동 승인 임계치 — 자료 전체 분량의 1/10(최소 1).
const getAutoThreshold = (total: number) => Math.max(1, Math.ceil(Math.max(0, total) / 10));

// 오늘 자동 조정으로 이미 쓴 누적 |delta| — auto=true 항목만 집계(신청/승인 건 미포함).
const getUsedAutoToday = (material: MaterialLike, todayKey: string) =>
  (material.adjustLog || [])
    .filter((entry) => entry.date === todayKey && entry.auto)
    .reduce((sum, entry) => sum + Math.abs((Number(entry.to) || 0) - (Number(entry.from) || 0)), 0);

// 기존 goal 설정 유지가 원칙 — goalValue 미설정(0) 자료는 admin requests 승인 로직
// (resolveGoalValue)과 동일하게 weeks 계열이면 detailedPlans 주차수로 근사한다.
const resolveGoal = (material: MaterialLike): { goalType: GoalType; goalValue: number } => {
  const goalType: GoalType = material.goalType || 'weeks';
  const current = Number(material.goalValue);
  if (Number.isFinite(current) && current > 0) return { goalType, goalValue: current };
  if ((goalType === 'weeks' || goalType === 'deadlineWeeks') && Array.isArray(material.detailedPlans)) {
    const planWeeks = Math.max(0, ...material.detailedPlans.map((plan) => Number(plan.weekNumber) || 0));
    if (planWeeks > 0) return { goalType, goalValue: planWeeks };
  }
  return { goalType, goalValue: 0 };
};

// 같은 자료의 시작점(진도 정정) 신청이 대기 중인지 — 승인 시 proposedGoal.currentProgress 가
// current 를 덮어쓰므로, 대기 중에는 자동/신청 모두 차단해 유실·혼선을 막는다.
const hasPendingStartAdjust = (logs: ConsultationLog[] | undefined, materialId: string) =>
  (logs || []).some((log) =>
    log.type === 'request'
    && log.status === 'pending'
    && log.proposedGoal?.materialId === materialId
    && log.proposedGoal?.currentProgress !== undefined);

export async function POST(req: NextRequest) {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }

  let body: { materialType?: unknown; materialId?: unknown; newValue?: unknown; reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const materialType = body?.materialType === 'lecture' ? 'lecture' : body?.materialType === 'book' ? 'book' : null;
  const materialId = typeof body?.materialId === 'string' ? body.materialId : '';
  const rawValue = Number(body?.newValue);
  const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 500) : '';

  if (!materialType || !materialId) {
    return NextResponse.json({ success: false, message: '대상 자료 정보가 올바르지 않습니다.' }, { status: 400 });
  }
  if (!Number.isFinite(rawValue) || rawValue < 0) {
    return NextResponse.json({ success: false, message: '시작점 값이 올바르지 않습니다.' }, { status: 400 });
  }

  // optimistic locking: 최대 2회 시도, conflict 시 fresh 데이터로 재시도 (student/progress 패턴)
  for (let attempt = 0; attempt < 2; attempt++) {
    const student = await getStudentById(studentId);
    if (!student) {
      return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
    }
    const originalUpdatedAt = student.updatedAt ?? '';
    const todayKey = kstDateKey();
    const nowIso = new Date().toISOString();

    // 대상 자료 수집 — 루트 + subjects 양쪽 사본에 동일 반영(진도 저장 경로와 동일한 이중 반영).
    const matching: MaterialLike[] = materialType === 'book'
      ? [
          ...((student.books || []).filter((b) => b.id === materialId)),
          ...((student.subjects || []).flatMap((s) => (s.books || []).filter((b) => b.id === materialId))),
        ]
      : [
          ...((student.lectures || []).filter((l) => l.id === materialId)),
          ...((student.subjects || []).flatMap((s) => (s.lectures || []).filter((l) => l.id === materialId))),
        ];
    if (matching.length === 0) {
      return NextResponse.json({ success: false, message: '해당 학습 자료를 찾을 수 없습니다.' }, { status: 404 });
    }

    const base = matching[0];
    const total = materialType === 'book'
      ? (base as BookProgress).totalPages || 0
      : (base as LectureProgress).totalLectures || 0;

    if (base.goalType === 'selfPaced') {
      return NextResponse.json({ success: false, message: '자율 입력 자료는 시작점 조정 대상이 아닙니다.' }, { status: 400 });
    }
    if (!matching.some((m) => (m.detailedPlans || []).length > 0)) {
      return NextResponse.json({ success: false, message: '세부 계획이 없는 자료는 시작점 조정 대상이 아닙니다.' }, { status: 400 });
    }
    if (total <= 0) {
      return NextResponse.json({ success: false, message: '전체 분량 정보가 없어 조정할 수 없습니다.' }, { status: 400 });
    }

    const newValue = Math.min(total, Math.max(0, Math.round(rawValue)));
    const from = materialType === 'book'
      ? (base as BookProgress).currentPage || 0
      : (base as LectureProgress).completedLectures || 0;
    const delta = newValue - from;
    if (delta === 0) {
      return NextResponse.json({ success: false, message: '지금 시작점과 같은 값입니다.' }, { status: 400 });
    }

    if (hasPendingStartAdjust(student.consultationLogs, materialId)) {
      return NextResponse.json(
        { success: false, message: '이미 관리자 확인을 기다리는 시작점 조정 신청이 있습니다. 처리 후 다시 시도해 주세요.' },
        { status: 409 },
      );
    }

    const threshold = getAutoThreshold(total);
    const usedToday = getUsedAutoToday(base, todayKey);
    const isAuto = usedToday + Math.abs(delta) <= threshold;

    // ── 초과: 사유 필수 → pending 신청 생성(관리자 승인은 기존 라우트가 처리) ──
    if (!isAuto) {
      if (!reason) {
        return NextResponse.json(
          { success: false, needsReason: true, threshold, message: '자동 승인 범위를 넘어 사유가 필요합니다.' },
          { status: 400 },
        );
      }

      const { goalType, goalValue } = resolveGoal(base);
      // 자동 경로와 동일 가드 — goalValue 근사 불가(0) 자료는 승인 시 계획 재생성이 스킵돼
      // 계획-현재 불일치가 생기므로, 그런 신청은 애초에 만들지 않는다.
      if (goalValue <= 0) {
        return NextResponse.json({ success: false, message: '목표 설정이 없어 계획을 다시 만들 수 없습니다. 학습계획 변경을 신청해 주세요.' }, { status: 400 });
      }
      const materialTitle = materialType === 'book' ? (base as BookProgress).title : (base as LectureProgress).name;
      const unit = materialType === 'book' ? ((base as BookProgress).unit || 'p') : '강';
      // proposedGoal 은 클라이언트 입력이 아니라 서버가 실제 자료값으로 구성 —
      // 저장 규격 일관성을 위해 student/requests 와 동일한 normalizeProposedGoal 을 통과시킨다.
      const proposedGoal = normalizeProposedGoal({
        materialId,
        materialType,
        goalType,
        goalValue,
        currentProgress: newValue,
        currentGoal: { goalType: base.goalType, goalValue: base.goalValue },
      });
      const request: ConsultationLog = {
        id: `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        date: todayKey,
        manager: '🙋 학생 신청',
        content: `[시작점 조정 신청(자동승인 범위 초과)] ${materialTitle}: ${from}${unit} → ${newValue}${unit} (오늘 ${Math.min(total, newValue + 1)}${unit}부터 시작)\n사유: ${reason}`,
        type: 'request',
        requestType: 'progress',
        status: 'pending',
        proposedGoal,
        createdAt: nowIso,
      };

      let errorResponse: NextResponse | null = null;
      const result = await updateStudentById(studentId, (s) => {
        // 콜백 내 재검증(레이스 방지) — 그 사이 같은 자료 신청이 생겼으면 중복 생성하지 않는다.
        if (hasPendingStartAdjust(s.consultationLogs, materialId)) {
          errorResponse = NextResponse.json(
            { success: false, message: '이미 관리자 확인을 기다리는 시작점 조정 신청이 있습니다.' },
            { status: 409 },
          );
          return false;
        }
        s.consultationLogs = [...(s.consultationLogs || []), request];
      });

      if (errorResponse) return errorResponse;
      if (result === 'not_found') {
        return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
      }
      if (typeof result === 'string') {
        return NextResponse.json({ success: false, message: '저장이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' }, { status: 409 });
      }

      return NextResponse.json({ success: true, auto: false, threshold, request });
    }

    // ── 자동 승인: current 갱신 + adjustLog + 오늘 anchor 계획 재생성(기존 설정 보존) ──
    const { goalType, goalValue } = resolveGoal(base);
    if (goalValue <= 0) {
      return NextResponse.json({ success: false, message: '목표 설정이 없어 계획을 다시 만들 수 없습니다. 학습계획 변경을 신청해 주세요.' }, { status: 400 });
    }

    const parentSubject = (student.subjects || []).find((s) =>
      materialType === 'book'
        ? (s.books || []).some((b) => b.id === materialId)
        : (s.lectures || []).some((l) => l.id === materialId));
    const speed = materialType === 'lecture' ? Number((base as LectureProgress).speedMultiplier || 1.0) : 1.0;

    // 기간형(weeks|deadlineWeeks) 목표는 기존 마감(targetDate) 보존 — 오늘 anchor 재생성에
    // goalValue 주를 통째로 다시 잡으면 조정할 때마다 마감이 뒤로 밀린다. 기존 targetDate 까지
    // 남은 주수(최소 1)로 재생성하고, targetDate 는 기존 값을 유지한다(주 단위 근사 오차로
    // 마감이 흔들리지 않게). targetDate 이미 지남 → 남은 분량을 1주로 마무리.
    // targetDate 미설정(희귀)이면 남은 분량을 1주로 압축하는 대신 원래 goalValue 로 재생성.
    // 페이스형(weeklyAmount|dailyAmount)은 페이스 고정이라 재앵커해도 마감이 남은 분량에서
    // 자연 파생 — 기존 로직 유지(targetDate 는 새 계산값 — 분량이 줄면 앞당겨지는 게 맞다).
    const isPeriodGoal = goalType === 'weeks' || goalType === 'deadlineWeeks';
    const existingTargetDate = isPeriodGoal
      && typeof base.targetDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(base.targetDate)
      ? base.targetDate
      : '';
    const remainingWeeks = isPeriodGoal && existingTargetDate
      ? Math.max(1, Math.ceil(
          (Date.parse(`${existingTargetDate}T00:00:00+09:00`) - Date.parse(`${todayKey}T00:00:00+09:00`))
          / (7 * 86400000),
        ))
      : goalValue;

    // admin requests 승인과 동일한 방식 — 새 current 기준으로 전체 재생성(오늘 anchor).
    // deadline(periodType) 자료도 새 plan 이 fromNum=newValue+1 부터 다시 만들어져 actualAmount 정합 유지.
    const { plans, calculatedTargetDate } = generateDetailedPlans(
      materialId,
      total,
      materialType,
      goalType,
      isPeriodGoal ? remainingWeeks : goalValue,
      newValue,
      materialType === 'book' ? (base as BookProgress).unit : undefined,
      base.reviewPasses || [],
      getMaterialStudyDays(parentSubject?.studyDays, base.studyDays),
      speed,
      base.estimatedMinutesPerUnit,
      parentSubject?.studyTime,
      base.category,
    );

    const logEntry = { date: todayKey, from, to: newValue, auto: true, ...(reason ? { reason } : {}) };
    matching.forEach((m) => {
      if (materialType === 'book') (m as BookProgress).currentPage = newValue;
      else (m as LectureProgress).completedLectures = newValue;
      m.adjustLog = [...(m.adjustLog || []), logEntry].slice(-30);
      m.detailedPlans = plans;
      // 기간형+기존 마감 보존 시 targetDate 는 그대로 — calculatedTargetDate 는 주 단위 근사값.
      m.targetDate = existingTargetDate || calculatedTargetDate;
      m.goalType = goalType;
      m.goalValue = goalValue;
      m.updatedAt = nowIso;
    });

    const saved = await patchStudentProgress(student, originalUpdatedAt);
    if (saved === 'conflict') continue;
    if (!saved) {
      return NextResponse.json({ success: false, message: '학생 정보 업데이트에 실패했습니다.' }, { status: 500 });
    }

    // 클라이언트 조용한 갱신용 최소 데이터 — 리포트 student 는 마스킹 투영이라 전체 교체 대신 병합.
    return NextResponse.json({
      success: true,
      auto: true,
      threshold,
      data: {
        subjects: saved.subjects,
        books: saved.books,
        lectures: saved.lectures,
        updatedAt: saved.updatedAt,
      },
    });
  }

  return NextResponse.json(
    { success: false, message: '시작점 저장 충돌, 다시 시도해주세요.' },
    { status: 409 },
  );
}
