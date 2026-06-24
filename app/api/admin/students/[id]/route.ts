import { NextResponse } from 'next/server';
import { getStudentById, saveStudent, deleteStudent } from '@/lib/store';
import { Student } from '@/lib/types/student';
import { isAdmin } from '@/lib/auth';

// 0. 특정 원생 단건 조회
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const student = await getStudentById(id);
    if (!student) {
      return NextResponse.json({ success: false, message: '원생을 찾을 수 없습니다.' }, { status: 404 });
    }
    const { sharePasswordHash: _h, ...safeStudent } = student;
    return NextResponse.json({ success: true, data: safeStudent });
  } catch (error) {
    console.error(`API GET /students/${id} error:`, error);
    return NextResponse.json({ success: false, message: '원생 조회에 실패했습니다.' }, { status: 500 });
  }
}

// 1. 특정 원생의 상세 내용 일괄 수정 (교재/인강 진도 및 기본정보)
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const studentData = await request.json() as Student;
    if (studentData.id !== id) {
      return NextResponse.json({ success: false, message: '요청 정보가 일치하지 않습니다.' }, { status: 400 });
    }

    const updated = await saveStudent(studentData);
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error(`API PUT /students/${id} error:`, error);
    return NextResponse.json({ success: false, message: '원생 정보 갱신에 실패했습니다.' }, { status: 500 });
  }
}

// 2. 특정 원생 삭제
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const success = await deleteStudent(id);
    if (success) {
      return NextResponse.json({ success: true, message: '원생이 삭제되었습니다.' });
    }
    return NextResponse.json({ success: false, message: '삭제할 원생을 찾을 수 없습니다.' }, { status: 404 });
  } catch (error) {
    console.error(`API DELETE /students/${id} error:`, error);
    return NextResponse.json({ success: false, message: '원생 삭제에 실패했습니다.' }, { status: 500 });
  }
}
