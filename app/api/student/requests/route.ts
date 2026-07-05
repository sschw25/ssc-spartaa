import { NextRequest, NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { updateStudentById } from '@/lib/store';
import type { ConsultationLog, ProposedGoal } from '@/lib/types/student';

const REQUEST_TYPES = ['progress', 'subject', 'plan', 'halfDay', 'restPass', 'etc'] as const;
const GOAL_TYPES = ['weeks', 'weeklyAmount', 'dailyAmount', 'deadlineWeeks'] as const;

// 학생 body의 proposedGoal은 관리자 승인 시 generateDetailedPlans에 그대로 투입되므로
// (admin/students/[id]/requests) 저장 시점에 필드 단위로 정규화한다. 검증 실패 필드는 버린다.
// - materialId/materialType 없으면 제안 자체를 폐기(undefined) — 소비처가 자료를 못 찾음
// - goalType은 union allowlist, goalValue는 유한수 0~9999 클램프
// - proposedWeekNumber 정수 1~12, proposedRangeText/goalDescription류 trim+길이상한
function normalizeProposedGoal(raw: unknown): ProposedGoal | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const g = raw as Record<string, unknown>;

  const materialId = typeof g.materialId === 'string' ? g.materialId.trim().slice(0, 100) : '';
  const materialType = g.materialType === 'book' || g.materialType === 'lecture' ? g.materialType : null;
  if (!materialId || !materialType) return undefined; // 자료 식별 불가한 제안은 폐기

  const goalType = (GOAL_TYPES as readonly string[]).includes(String(g.goalType))
    ? (g.goalType as ProposedGoal['goalType'])
    : 'weeks';

  const goalValueNum = Number(g.goalValue);
  const goalValue = Number.isFinite(goalValueNum) ? Math.max(0, Math.min(9999, goalValueNum)) : 0;

  const normalized: ProposedGoal = { materialId, materialType, goalType, goalValue };

  if (typeof g.targetDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(g.targetDate)) {
    normalized.targetDate = g.targetDate;
  }
  const weekNum = Number(g.proposedWeekNumber);
  if (Number.isFinite(weekNum) && weekNum >= 1) {
    normalized.proposedWeekNumber = Math.min(12, Math.round(weekNum));
  }
  if (typeof g.proposedRangeText === 'string') {
    const rangeText = g.proposedRangeText.trim().slice(0, 200);
    if (rangeText) normalized.proposedRangeText = rangeText;
  }
  const speedNum = Number(g.speedMultiplier);
  if (Number.isFinite(speedNum) && speedNum > 0) {
    normalized.speedMultiplier = Math.min(4, speedNum);
  }
  // currentGoal은 관리자 before/after 표시용(계획 계산에 미투입)이지만 동일 규격으로 방어
  if (g.currentGoal && typeof g.currentGoal === 'object') {
    const c = g.currentGoal as Record<string, unknown>;
    const cur: ProposedGoal['currentGoal'] = {};
    if ((GOAL_TYPES as readonly string[]).includes(String(c.goalType))) {
      cur.goalType = c.goalType as ProposedGoal['goalType'];
    }
    const cv = Number(c.goalValue);
    if (Number.isFinite(cv)) cur.goalValue = Math.max(0, Math.min(9999, cv));
    const cs = Number(c.speedMultiplier);
    if (Number.isFinite(cs) && cs > 0) cur.speedMultiplier = Math.min(4, cs);
    if (Object.keys(cur).length > 0) normalized.currentGoal = cur;
  }

  return normalized;
}

// 학생이 관리자에게 진도/과목/학습계획 변경 등을 신청 (consultation_logs 재사용, type==='request')
export async function POST(req: NextRequest) {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }

  let body: { requestType?: unknown; message?: unknown; proposedGoal?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const requestType = (REQUEST_TYPES as readonly string[]).includes(String(body?.requestType))
    ? (body!.requestType as ConsultationLog['requestType'])
    : 'etc';
  const message = String(body?.message ?? '').trim();
  if (!message) {
    return NextResponse.json({ success: false, message: '신청 내용을 입력해 주세요.' }, { status: 400 });
  }
  if (message.length > 1000) {
    return NextResponse.json({ success: false, message: '신청 내용이 너무 깁니다.' }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  const request: ConsultationLog = {
    id: `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date()),
    manager: '🙋 학생 신청',
    content: message,
    type: 'request',
    requestType,
    status: 'pending',
    proposedGoal: normalizeProposedGoal(body?.proposedGoal),
    createdAt: nowIso,
  };

  const result = await updateStudentById(studentId, (student) => {
    student.consultationLogs = [...(student.consultationLogs || []), request];
  });

  if (result === 'not_found') {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }
  if (typeof result === 'string') {
    return NextResponse.json({ success: false, message: '저장이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' }, { status: 409 });
  }

  return NextResponse.json({ success: true, request });
}

// 학생이 본인이 올린 '대기중' 신청을 취소
export async function DELETE(req: NextRequest) {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }
  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ success: false, message: '취소할 신청이 없습니다.' }, { status: 400 });
  }

  let errorResponse: NextResponse | null = null;
  const result = await updateStudentById(studentId, (student) => {
    const target = (student.consultationLogs || []).find((l) => l.id === id);
    if (!target || target.type !== 'request') {
      errorResponse = NextResponse.json({ success: false, message: '신청을 찾을 수 없습니다.' }, { status: 404 });
      return false;
    }
    if (target.status === 'resolved') {
      errorResponse = NextResponse.json({ success: false, message: '이미 처리된 신청은 취소할 수 없습니다.' }, { status: 403 });
      return false;
    }

    student.consultationLogs = (student.consultationLogs || []).filter((l) => l.id !== id);
  });

  if (errorResponse) return errorResponse;
  if (result === 'not_found') {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }
  if (typeof result === 'string') {
    return NextResponse.json({ success: false, message: '저장이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' }, { status: 409 });
  }

  return NextResponse.json({ success: true });
}
