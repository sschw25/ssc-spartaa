import { NextRequest, NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { updateStudentById } from '@/lib/store';

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

    const newDday = {
      id: `dday_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title: title.trim().slice(0, 100),
      date,
      createdAt: new Date().toISOString(),
    };

    const result = await updateStudentById(studentId, (student) => {
      const currentDdays = student.ddays || [];
      // 무한 누적(DoS) 방지: 최근 40개만 유지. away-replan 알림 트리밍(slice(-60)) 관례를 따름.
      student.ddays = [...currentDdays, newDday].slice(-40);
    });

    if (result === 'not_found') {
      return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
    }
    if (typeof result === 'string') {
      return NextResponse.json({ success: false, message: '저장이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' }, { status: 409 });
    }

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
    const result = await updateStudentById(studentId, (student) => {
      student.ddays = (student.ddays || []).filter((d: any) => d.id !== id);
    });

    if (result === 'not_found') {
      return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
    }
    if (typeof result === 'string') {
      return NextResponse.json({ success: false, message: '저장이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' }, { status: 409 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Delete D-Day error:', error);
    return NextResponse.json({ success: false, message: '디데이 삭제 실패' }, { status: 500 });
  }
}
