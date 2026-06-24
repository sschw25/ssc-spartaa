import { NextResponse } from 'next/server';
import { getStudents, saveStudent } from '@/lib/store';
import { Student } from '@/lib/types/student';
import { isAdmin } from '@/lib/auth';

// 1. 전체 학생 및 진도/상담/성적 일괄 조회
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  try {
    const students = await getStudents();
    const sanitized = students.map(({ sharePasswordHash: _h, ...s }) => s);
    return NextResponse.json({ success: true, data: sanitized });
  } catch (error) {
    console.error('API GET /students error:', error);
    return NextResponse.json({ success: false, message: '데이터 조회에 실패했습니다.' }, { status: 500 });
  }
}

// 2. 신규 학생 추가
export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  try {
    const studentData = await request.json() as Partial<Student>;
    if (!studentData.name || !studentData.campus) {
      return NextResponse.json({ success: false, message: '원생 이름과 캠퍼스 정보는 필수입니다.' }, { status: 400 });
    }

    // 신규 ID 및 날짜 생성
    const id = `std_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const now = new Date().toISOString();

    const newStudent: Student = {
      id,
      name: studentData.name,
      campus: studentData.campus,
      manager: studentData.manager || '',
      contact: studentData.contact || '',
      lifeComment: studentData.lifeComment || '',
      studentLifeComment: studentData.studentLifeComment || '',
      specialNote: studentData.specialNote || '',
      nextConsultationDate: studentData.nextConsultationDate || undefined,
      createdAt: now,
      updatedAt: now,
      books: studentData.books || [],
      lectures: studentData.lectures || [],
      consultationLogs: studentData.consultationLogs || [],
      grades: studentData.grades || [],
      subjects: studentData.subjects || [],
      enrollmentEndDate: studentData.enrollmentEndDate,
      weeklyGradeCheck: studentData.weeklyGradeCheck,
    };

    const saved = await saveStudent(newStudent);
    return NextResponse.json({ success: true, data: saved });
  } catch (error) {
    console.error('API POST /students error:', error);
    return NextResponse.json({ success: false, message: '원생 등록에 실패했습니다.' }, { status: 500 });
  }
}
