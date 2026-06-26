import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { getSessionsByDate } from '@/lib/store';

// GET /api/admin/seat-board?date=YYYY-MM-DD
// 출결판용: 해당 날짜의 전체 학생 세션 반환
export async function GET(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ success: false, message: '날짜 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  try {
    const sessions = await getSessionsByDate(date);
    return NextResponse.json({ success: true, sessions });
  } catch (e: unknown) {
    console.error('[seat-board GET]', e);
    const msg = e instanceof Error ? e.message : '조회 실패';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
