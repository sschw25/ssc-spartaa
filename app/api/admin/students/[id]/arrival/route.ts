import { NextResponse } from 'next/server';
import { canAdminAccessStudent } from '@/lib/auth';
import { setStudentExpectedArrival } from '@/lib/store';
import { normalizeArrival } from '@/lib/attendance-time';

// 관리자: 학생별 지각 기준(등원 마감) 설정 — 기본 08:20, HH:MM 커스텀 시각 지원
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!(await canAdminAccessStudent(id))) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });
  }
  try {
    const { expectedArrival } = await request.json();
    const value = normalizeArrival(expectedArrival);
    await setStudentExpectedArrival(id, value);
    return NextResponse.json({ success: true, expectedArrival: value });
  } catch (e: any) {
    console.error('set expected arrival error:', e);
    return NextResponse.json({ success: false, message: e?.message || '지각 기준 저장에 실패했습니다.' }, { status: 500 });
  }
}
