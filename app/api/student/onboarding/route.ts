import { NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { markStudentOnboarded } from '@/lib/store';

export async function POST() {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }
  try {
    await markStudentOnboarded(studentId); // 멱등 — 이미 완료여도 성공으로 본다
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[student onboarding POST]', err);
    return NextResponse.json({ success: false, message: '저장에 실패했습니다.' }, { status: 500 });
  }
}
