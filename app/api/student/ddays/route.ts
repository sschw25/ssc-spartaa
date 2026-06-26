import { NextRequest, NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { getStudentById, saveStudent } from '@/lib/store';

export async function POST(req: NextRequest) {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }

  try {
    const { title, date } = await req.json();
    if (!title || !title.trim()) {
      return NextResponse.json({ success: false, message: '디데이 제목을 입력해 주세요.' }, { status: 400 });
    }
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ success: false, message: '날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)' }, { status: 400 });
    }

    const student = await getStudentById(studentId);
    if (!student) {
      return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    const currentDdays = student.ddays || [];
    const newDday = {
      id: `dday_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title: title.trim(),
      date,
      createdAt: new Date().toISOString(),
    };

    student.ddays = [...currentDdays, newDday];
    await saveStudent(student);

    return NextResponse.json({ success: true, dday: newDday });
  } catch (error: any) {
    console.error('Add D-Day error:', error);
    return NextResponse.json({ success: false, message: '디데이 추가 실패' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ success: false, message: '삭제할 디데이 ID가 없습니다.' }, { status: 400 });
  }

  try {
    const student = await getStudentById(studentId);
    if (!student) {
      return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    student.ddays = (student.ddays || []).filter((d: any) => d.id !== id);
    await saveStudent(student);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Delete D-Day error:', error);
    return NextResponse.json({ success: false, message: '디데이 삭제 실패' }, { status: 500 });
  }
}
