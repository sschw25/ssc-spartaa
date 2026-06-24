import { NextResponse } from 'next/server';
import { getStudentById, saveStudent } from '@/lib/store';
import { ConsultationLog } from '@/lib/types/student';
import { isAdmin } from '@/lib/auth';

// 특정 학생 상담 등록 API
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const { date, manager, content, nextConsultationDate, type, subjects } = await request.json();

    if (!date || !content) {
      return NextResponse.json({ success: false, message: '상담일자와 상담 내용은 필수입니다.' }, { status: 400 });
    }

    // 1. 해당 학생 단일 조회
    const student = await getStudentById(id);

    if (!student) {
      return NextResponse.json({ success: false, message: '해당 원생을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 2. 상담 로그 조립 및 삽입
    const newLog: ConsultationLog = {
      id: `csl_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      date,
      manager: manager || student.manager || '담당 매니저',
      content,
      type: type || 'learning'
    };

    const updatedLogs = [newLog, ...student.consultationLogs]; // 최신 상담이 맨 앞으로 오게 배치

    const updatedStudent = {
      ...student,
      consultationLogs: updatedLogs,
      nextConsultationDate: nextConsultationDate || student.nextConsultationDate,
      subjects: subjects || student.subjects,
      updatedAt: new Date().toISOString()
    };

    // 3. 저장
    const saved = await saveStudent(updatedStudent);

    return NextResponse.json({ success: true, data: saved });
  } catch (error) {
    console.error('API POST /consultation error:', error);
    return NextResponse.json({ success: false, message: '상담 일지 등록에 실패했습니다.' }, { status: 500 });
  }
}
