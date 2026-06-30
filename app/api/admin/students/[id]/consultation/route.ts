import { NextResponse } from 'next/server';
import { updateStudentById } from '@/lib/store';
import { ConsultationLog } from '@/lib/types/student';
import { canAdminAccessStudent } from '@/lib/auth';

// 특정 학생 상담 등록 API
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!(await canAdminAccessStudent(id))) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });
  }

  try {
    const { date, manager, content, nextConsultationDate, type, subjects } = await request.json();

    if (!date || !content) {
      return NextResponse.json({ success: false, message: '상담일자와 상담 내용은 필수입니다.' }, { status: 400 });
    }

    // 1~3. 해당 학생 단일 조회 → 상담 로그 조립/삽입 → 저장 (낙관적 잠금)
    const result = await updateStudentById(id, (student) => {
      const newLog: ConsultationLog = {
        id: `csl_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        date,
        manager: manager || student.manager || '담당 매니저',
        content,
        type: type || 'learning'
      };

      student.consultationLogs = [newLog, ...student.consultationLogs]; // 최신 상담이 맨 앞으로 오게 배치
      student.nextConsultationDate = nextConsultationDate || student.nextConsultationDate;
      student.subjects = subjects || student.subjects;
      student.updatedAt = new Date().toISOString();
    });

    if (result === 'not_found') {
      return NextResponse.json({ success: false, message: '해당 원생을 찾을 수 없습니다.' }, { status: 404 });
    }
    if (typeof result === 'string') {
      return NextResponse.json({ success: false, message: '저장이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' }, { status: 409 });
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('API POST /consultation error:', error);
    return NextResponse.json({ success: false, message: '상담 일지 등록에 실패했습니다.' }, { status: 500 });
  }
}
