import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession, canAdminAccessStudent } from '@/lib/auth';
import { updateStudentById } from '@/lib/store';
import { applyAwayReplan } from '@/lib/away-impact';
import { kstToday } from '@/lib/leave';

// 관리자가 외출로 인한 계획 재조정을 적용(과목 단위). 적용 시 subject.studyDays 를 잃은 요일만큼
// 줄이고 자료 계획을 재생성 결과로 교체 → 재권고 방지(현실 반영) + 학생 홈 알림 append.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }
  if (!(await canAdminAccessStudent(id))) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });
  }

  let body: { subjectIds?: unknown } = {};
  try { body = await req.json(); } catch { /* 빈 바디 = 전체 적용 */ }
  const subjectIds = Array.isArray(body?.subjectIds) ? body.subjectIds.map(String) : null;

  const todayKey = kstToday();
  let appliedCount = 0;

  const result = await updateStudentById(id, (student) => {
    appliedCount = applyAwayReplan(student, todayKey, { subjectIds: subjectIds ?? undefined });
    if (appliedCount === 0) return false;
    return true;
  });

  if (result === 'not_found') return NextResponse.json({ success: false, message: '학생을 찾을 수 없습니다.' }, { status: 404 });
  if (result === 'abort') return NextResponse.json({ success: false, message: '적용할 계획 조정이 없습니다.' }, { status: 400 });
  if (result === 'conflict') return NextResponse.json({ success: false, message: '저장이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' }, { status: 409 });
  return NextResponse.json({ success: true, appliedCount });
}
