import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { getStudentById, saveStudent } from '@/lib/store';
import type { PenaltyRecord } from '@/lib/types/student';

// 관리자: 벌점/상점 부여
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  const { id } = await params;

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

  const student = await getStudentById(id);
  if (!student) {
    return NextResponse.json({ success: false, message: '해당 원생을 찾을 수 없습니다.' }, { status: 404 });
  }

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
  student.penalties = [...(student.penalties || []), record];
  await saveStudent(student);

  return NextResponse.json({ success: true, record });
}

// 관리자: 벌점 항목 삭제
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const penaltyId = searchParams.get('penaltyId');
  if (!penaltyId) {
    return NextResponse.json({ success: false, message: 'penaltyId가 필요합니다.' }, { status: 400 });
  }

  const student = await getStudentById(id);
  if (!student) {
    return NextResponse.json({ success: false, message: '해당 원생을 찾을 수 없습니다.' }, { status: 404 });
  }

  student.penalties = (student.penalties || []).filter((p) => p.id !== penaltyId);
  await saveStudent(student);

  return NextResponse.json({ success: true });
}
