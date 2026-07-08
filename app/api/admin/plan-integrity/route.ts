import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession, canAdminAccessStudent } from '@/lib/auth';
import { getStudents, updateStudentById } from '@/lib/store';
import { scanStalePlans, fixStalePlansForStudentMaterial } from '@/lib/plan-integrity';

// 계획 정합성 점검(비상 진단). GET=재설정 필요 학생/자료 스캔, POST=특정 자료 제자리 교정.
// 하루 목표(dailyAmount) 자료의 일일량 희석 버그를 검출/교정한다.

// GET /api/admin/plan-integrity — 로그인 관리자 캠퍼스 범위 내 재설정 필요 목록.
export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }

  const all = await getStudents();
  const scoped = session.campus === 'all' ? all : all.filter((s) => s.campus === session.campus);
  const students = scanStalePlans(scoped);
  const materialCount = students.reduce((n, s) => n + s.materials.length, 0);
  return NextResponse.json({ success: true, students, studentCount: students.length, materialCount });
}

// POST /api/admin/plan-integrity { studentId, materialId } — 그 자료의 일일량만 제자리 교정.
export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }

  let body: { studentId?: unknown; materialId?: unknown } = {};
  try { body = await req.json(); } catch { /* noop */ }
  const studentId = typeof body.studentId === 'string' ? body.studentId : '';
  const materialId = typeof body.materialId === 'string' ? body.materialId : '';
  if (!studentId || !materialId) {
    return NextResponse.json({ success: false, message: 'studentId·materialId 가 필요합니다.' }, { status: 400 });
  }
  if (!(await canAdminAccessStudent(studentId))) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });
  }

  const result = await updateStudentById(studentId, (student) => {
    return fixStalePlansForStudentMaterial(student, materialId);
  });

  if (result === 'not_found') return NextResponse.json({ success: false, message: '학생을 찾을 수 없습니다.' }, { status: 404 });
  if (result === 'abort') return NextResponse.json({ success: false, message: '교정할 계획이 없습니다(이미 정상).' }, { status: 400 });
  if (result === 'conflict') return NextResponse.json({ success: false, message: '저장이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' }, { status: 409 });
  return NextResponse.json({ success: true });
}
