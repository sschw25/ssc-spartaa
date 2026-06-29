import { NextResponse } from 'next/server';
import { canAdminAccessStudent } from '@/lib/auth';
import { getStudentById, patchStudentProgress } from '@/lib/store';
import type { PenaltyRecord } from '@/lib/types/student';

// 관리자: 벌점/상점 부여
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!(await canAdminAccessStudent(id))) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });
  }

  let body: { date?: unknown; points?: unknown; reason?: unknown; type?: unknown; awardedBy?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const type = body?.type === 'bonus' ? 'bonus' : 'penalty';
  const points = Number(body?.points);
  if (!Number.isFinite(points) || points <= 0) {
    return NextResponse.json({ success: false, message: '점수는 양수여야 합니다.' }, { status: 400 });
  }
  const date = String(body?.date ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ success: false, message: '날짜 형식이 올바르지 않습니다.' }, { status: 400 });
  }
  const reason = String(body?.reason ?? '').trim().slice(0, 200);
  if (!reason) {
    return NextResponse.json({ success: false, message: '사유를 입력해주세요.' }, { status: 400 });
  }
  const awardedBy = String(body?.awardedBy ?? '관리자').trim().slice(0, 50);

  const nowIso = new Date().toISOString();
  const record: PenaltyRecord = {
    id: `penalty_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    date,
    points,
    reason,
    type,
    awardedBy,
    createdAt: nowIso,
  };

  // optimistic locking: conflict 시 fresh 재조회·재시도 (전체 행 저장이 동시 쿠폰/변경을 덮어쓰지 않게)
  for (let attempt = 0; attempt < 2; attempt++) {
    const student = await getStudentById(id);
    if (!student) {
      return NextResponse.json({ success: false, message: '해당 원생을 찾을 수 없습니다.' }, { status: 404 });
    }
    const originalUpdatedAt = student.updatedAt ?? '';
    student.penalties = [...(student.penalties || []), record];
    const saved = await patchStudentProgress(student, originalUpdatedAt);
    if (saved === 'conflict') continue;
    return NextResponse.json({ success: true, record });
  }

  return NextResponse.json(
    { success: false, message: '저장 충돌이 발생했습니다. 다시 시도해주세요.' },
    { status: 409 },
  );
}

// 관리자: 벌점 항목 삭제
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!(await canAdminAccessStudent(id))) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const penaltyId = searchParams.get('penaltyId');
  if (!penaltyId) {
    return NextResponse.json({ success: false, message: 'penaltyId가 필요합니다.' }, { status: 400 });
  }

  // optimistic locking: conflict 시 fresh 재조회·재시도
  for (let attempt = 0; attempt < 2; attempt++) {
    const student = await getStudentById(id);
    if (!student) {
      return NextResponse.json({ success: false, message: '해당 원생을 찾을 수 없습니다.' }, { status: 404 });
    }
    const originalUpdatedAt = student.updatedAt ?? '';
    student.penalties = (student.penalties || []).filter((p) => p.id !== penaltyId);
    const saved = await patchStudentProgress(student, originalUpdatedAt);
    if (saved === 'conflict') continue;
    return NextResponse.json({ success: true });
  }

  return NextResponse.json(
    { success: false, message: '저장 충돌이 발생했습니다. 다시 시도해주세요.' },
    { status: 409 },
  );
}
