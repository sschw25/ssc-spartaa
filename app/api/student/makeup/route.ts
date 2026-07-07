import { NextRequest, NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { updateStudentById } from '@/lib/store';
import { logMakeupDone } from '@/lib/makeup-ledger';

// 학생이 주말 보강을 완료 입력 — makeupDone 누적 + 진도 동반 회복(logMakeupDone 단일 소스).
export async function POST(req: NextRequest) {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }

  let body: { materialId?: unknown; materialType?: unknown; amount?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const materialId = String(body?.materialId ?? '').trim();
  const materialType = body?.materialType === 'lecture' ? 'lecture' : 'book';
  const amount = Math.floor(Number(body?.amount ?? 0));
  if (!materialId || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ success: false, message: '보강 입력값이 올바르지 않습니다.' }, { status: 400 });
  }

  let appliedOut = 0;
  let remainingOut = 0;
  let notFound = false;

  const saved = await updateStudentById(studentId, (student) => {
    const r = logMakeupDone(student, materialId, materialType, amount);
    if (r === null) {
      notFound = true;
      return false; // abort — 저장 스킵.
    }
    appliedOut = r.applied;
    remainingOut = r.remaining;
    if (r.applied <= 0) return false; // 남은 보강 없음 — 저장 스킵(멱등).
  });

  if (notFound) {
    return NextResponse.json({ success: false, message: '대상 학습 자료를 찾을 수 없습니다.' }, { status: 404 });
  }
  if (saved === 'not_found') {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }
  // abort 는 applied<=0(남은 보강 없음) 경우 — 성공으로 보고 현재 상태를 그대로 반환.
  if (saved === 'abort') {
    return NextResponse.json({ success: true, applied: appliedOut, remaining: remainingOut });
  }
  if (typeof saved === 'string') {
    return NextResponse.json({ success: false, message: '저장이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' }, { status: 409 });
  }

  return NextResponse.json({ success: true, applied: appliedOut, remaining: remainingOut });
}
