import { NextRequest, NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { updateStudentById } from '@/lib/store';
// normalizeProposedGoal — lib/student-requests 로 이동(시작점 조정 신청 경로와 공유). 동작 동일.
import { normalizeProposedGoal, normalizeProposedMaterial, normalizeProposedMaterialDelete, normalizeProposedMakeup } from '@/lib/student-requests';
import type { ConsultationLog } from '@/lib/types/student';

const REQUEST_TYPES = ['progress', 'subject', 'plan', 'halfDay', 'restPass', 'materialAdd', 'materialDelete', 'makeup', 'etc'] as const;

// 학생이 관리자에게 진도/과목/학습계획 변경 등을 신청 (consultation_logs 재사용, type==='request')
export async function POST(req: NextRequest) {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }

  let body: { requestType?: unknown; message?: unknown; proposedGoal?: unknown; proposedMaterial?: unknown; proposedMaterialDelete?: unknown; proposedMakeup?: unknown };
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
    proposedMaterial: normalizeProposedMaterial(body?.proposedMaterial),
    proposedMaterialDelete: normalizeProposedMaterialDelete(body?.proposedMaterialDelete),
    proposedMakeup: normalizeProposedMakeup(body?.proposedMakeup),
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
