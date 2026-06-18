import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { setStudentExpectedArrival } from '@/lib/store';

// 관리자: 학생별 지각 기준(등원 마감 08:20 / 09:00) 설정
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  const { id } = await params;
  try {
    const { expectedArrival } = await request.json();
    const value: '08:20' | '09:00' = expectedArrival === '09:00' ? '09:00' : '08:20';
    await setStudentExpectedArrival(id, value);
    return NextResponse.json({ success: true, expectedArrival: value });
  } catch (e: any) {
    console.error('set expected arrival error:', e);
    return NextResponse.json({ success: false, message: e?.message || '지각 기준 저장에 실패했습니다.' }, { status: 500 });
  }
}
