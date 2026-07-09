import { NextRequest, NextResponse } from 'next/server';
import { canAdminAccessStudent } from '@/lib/auth';
import { getStudentById, signedLeaveProofUrl } from '@/lib/store';

// 관리자: 휴가 증빙 사진 열람용 서명 URL 발급 (짧은 수명). 캠퍼스 접근 권한 검사.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await canAdminAccessStudent(id))) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });
  }
  const leaveId = req.nextUrl.searchParams.get('leaveId');
  if (!leaveId) return NextResponse.json({ success: false, message: '신청 정보가 필요합니다.' }, { status: 400 });

  const student = await getStudentById(id);
  if (!student) return NextResponse.json({ success: false, message: '해당 원생을 찾을 수 없습니다.' }, { status: 404 });
  const target = (student.leaveRequests || []).find((r) => r.id === leaveId);
  if (!target?.proofPath) {
    return NextResponse.json({ success: false, message: '첨부된 증빙이 없습니다.' }, { status: 404 });
  }
  try {
    const url = await signedLeaveProofUrl(target.proofPath, 120);
    return NextResponse.json({ success: true, url, uploadedAt: target.proofUploadedAt });
  } catch (e) {
    return NextResponse.json({ success: false, message: e instanceof Error ? e.message : '열람 링크 생성에 실패했습니다.' }, { status: 500 });
  }
}
