import { NextRequest, NextResponse } from 'next/server';
import { canAdminAccessStudent } from '@/lib/auth';
import { updateStudentById } from '@/lib/store';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!(await canAdminAccessStudent(id))) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });
  }

  const { title, date } = await req.json();

  if (!title || !title.trim()) {
    return NextResponse.json({ success: false, message: '디데이 제목을 입력해 주세요.' }, { status: 400 });
  }
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ success: false, message: '날짜 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  try {
    const newDday = {
      id: `dday_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title: title.trim(),
      date,
      createdAt: new Date().toISOString(),
    };

    const result = await updateStudentById(id, (student) => {
      student.ddays = [...(student.ddays || []), newDday];
    });
    if (result === 'not_found') {
      return NextResponse.json({ success: false, message: '원생을 찾을 수 없습니다.' }, { status: 404 });
    }
    if (typeof result === 'string') {
      return NextResponse.json({ success: false, message: '저장이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' }, { status: 409 });
    }

    return NextResponse.json({ success: true, dday: newDday });
  } catch (error: any) {
    console.error('Admin add D-Day error:', error);
    return NextResponse.json({ success: false, message: error?.message || '디데이 추가 실패' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!(await canAdminAccessStudent(id))) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });
  }

  const ddayId = req.nextUrl.searchParams.get('id');

  if (!ddayId) {
    return NextResponse.json({ success: false, message: '삭제할 D-Day ID가 없습니다.' }, { status: 400 });
  }

  try {
    const result = await updateStudentById(id, (student) => {
      student.ddays = (student.ddays || []).filter((d: any) => d.id !== ddayId);
    });
    if (result === 'not_found') {
      return NextResponse.json({ success: false, message: '원생을 찾을 수 없습니다.' }, { status: 404 });
    }
    if (typeof result === 'string') {
      return NextResponse.json({ success: false, message: '저장이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' }, { status: 409 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Admin delete D-Day error:', error);
    return NextResponse.json({ success: false, message: error?.message || '디데이 삭제 실패' }, { status: 500 });
  }
}
