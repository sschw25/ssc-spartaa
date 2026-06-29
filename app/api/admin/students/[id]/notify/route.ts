import { NextResponse } from 'next/server';
import { canAdminAccessStudent } from '@/lib/auth';
import { setStudentNotifyInfo } from '@/lib/store';

// 관리자: 등하원 알림 수신 연락처/대상 설정
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!(await canAdminAccessStudent(id))) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });
  }

  try {
    const { parentPhone, studentPhone, smsTargets } = await request.json();
    const targets: Array<'parent' | 'student'> = (Array.isArray(smsTargets) ? smsTargets : ['parent'])
      .filter((target: unknown): target is 'parent' | 'student' => target === 'parent' || target === 'student');

    await setStudentNotifyInfo(id, {
      parentPhone: (parentPhone || '').replace(/[^\d]/g, ''),
      studentPhone: (studentPhone || '').replace(/[^\d]/g, ''),
      smsTargets: targets,
    });

    return NextResponse.json({ success: true, message: '등하원 알림 설정이 저장되었습니다.' });
  } catch (error: unknown) {
    console.error('set notify info error:', error);
    const message = error instanceof Error ? error.message : '저장 실패';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
