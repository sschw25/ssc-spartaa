import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { setStudentNotifyInfo } from '@/lib/store';

// 관리자: 출결 알림 수신 연락처/대상 설정
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  const { id } = await params;
  try {
    const { parentPhone, studentPhone, smsTargets } = await request.json();
    const targets: Array<'parent' | 'student'> = (Array.isArray(smsTargets) ? smsTargets : ['parent'])
      .filter((t: unknown): t is 'parent' | 'student' => t === 'parent' || t === 'student');
    await setStudentNotifyInfo(id, {
      parentPhone: (parentPhone || '').replace(/[^\d]/g, ''),
      studentPhone: (studentPhone || '').replace(/[^\d]/g, ''),
      smsTargets: targets.length ? targets : ['parent'],
    });
    return NextResponse.json({ success: true, message: '출결 알림 설정이 저장되었습니다.' });
  } catch (e: any) {
    console.error('set notify info error:', e);
    return NextResponse.json({ success: false, message: e?.message || '저장 실패' }, { status: 500 });
  }
}
