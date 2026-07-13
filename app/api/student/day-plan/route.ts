import { NextRequest, NextResponse } from 'next/server';
import { getStudentSessionId, isAdmin, canAdminAccessStudent } from '@/lib/auth';
import { getStudentById } from '@/lib/store';
import { getDayStudyItems, summarizeDayStudy } from '@/lib/student-calendar';

// 학생: 특정 날짜의 공부 계획 항목 + 달성 요약 (수험 캘린더 상세용).
// 관리자가 학생페이지(?audience=student)로 열람할 때는 세션이 없으므로 ?studentId= + 캠퍼스 권한으로 허용(읽기 전용).
export async function GET(req: NextRequest) {
  const selfId = await getStudentSessionId();
  let studentId = selfId;
  if (!studentId) {
    if (!(await isAdmin())) {
      return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
    }
    const targetId = req.nextUrl.searchParams.get('studentId') || '';
    if (!targetId || !(await canAdminAccessStudent(targetId))) {
      return NextResponse.json({ success: false, message: '열람 권한이 없습니다.' }, { status: 403 });
    }
    studentId = targetId;
  }
  const date = req.nextUrl.searchParams.get('date') || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ success: false, message: '날짜가 올바르지 않습니다.' }, { status: 400 });
  }
  const student = await getStudentById(studentId);
  if (!student) {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }

  const raw = getDayStudyItems(student, date);
  // 화면 표시에 필요한 필드만 추려서 전달(진도 원본은 노출 안 함)
  const items = raw.map((i) => ({
    subjectName: i.subjectName,
    title: i.title,
    unit: i.unit,
    amount: i.amount,
    range: i.range,
    isCompleted: !!i.isCompleted,
    actualAmount: i.actualAmount ?? 0,
    selfPaced: !!i.selfPaced,
    current: i.current ?? 0,
    weekly: !!i.weekly,
  }));
  return NextResponse.json({ success: true, date, summary: summarizeDayStudy(raw), items });
}
