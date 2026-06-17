import { NextResponse } from 'next/server';
import { getStudentById } from '@/lib/store';

// 학부모/학생용 비로그인 결과 리포트 조회 API
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const student = await getStudentById(id);

    if (!student) {
      return NextResponse.json(
        { success: false, message: '리포트 대상 원생을 찾을 수 없거나 주소가 올바르지 않습니다.' },
        { status: 404 }
      );
    }

    // 보안 및 프라이버시를 위해 연락처 등 민감 정보는 제거하거나 마스킹하여 전달
    const maskedStudent = {
      id: student.id,
      name: student.name,
      campus: student.campus,
      manager: student.manager,
      contact: student.contact || '',
      lifeComment: student.lifeComment || '',
      studentLifeComment: student.studentLifeComment || '',
      nextConsultationDate: student.nextConsultationDate,
      speedMultiplier: student.speedMultiplier !== undefined ? Number(student.speedMultiplier) : 1.0,
      books: student.books,
      lectures: student.lectures,
      // 부모님 공개용으로는 가장 최근 상담 일지 2건 정도만 전달 (전부 보이고 싶으면 전체 전달)
      consultationLogs: student.consultationLogs.slice(0, 3), 
      grades: student.grades,
      subjects: student.subjects || []
    };

    return NextResponse.json({ success: true, data: maskedStudent });
  } catch (error) {
    console.error(`API GET /report/${id} error:`, error);
    return NextResponse.json(
      { success: false, message: '리포트 로드 중 에러가 발생했습니다.' },
      { status: 500 }
    );
  }
}
