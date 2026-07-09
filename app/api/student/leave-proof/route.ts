import { NextRequest, NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { getStudentById, patchStudentProgress, uploadLeaveProof, deleteLeaveProof } from '@/lib/store';
import { leaveNeedsProof, isProofWindowOpen, PROOF_WINDOW_HOURS } from '@/lib/leave';

const MAX_BYTES = 6 * 1024 * 1024;
const MIME_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// 학생: 병가/개인사정 휴가에 사진 증빙 첨부 (신청 후 24시간 이내, 대기중 건만).
export async function POST(req: NextRequest) {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }
  const leaveId = String(form.get('leaveId') ?? '').trim();
  if (!leaveId) return NextResponse.json({ success: false, message: '신청 정보가 필요합니다.' }, { status: 400 });
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, message: '증빙 사진이 필요합니다.' }, { status: 400 });
  }
  const ext = MIME_EXT[file.type];
  if (!ext) return NextResponse.json({ success: false, message: 'JPEG/PNG/WebP 이미지만 첨부할 수 있어요.' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ success: false, message: '이미지 용량이 너무 큽니다(6MB 이하).' }, { status: 400 });

  // 첨부 대상 검증(본인 소유·증빙대상 유형·대기중·24h 창) — 업로드 전에 확인.
  const precheck = await getStudentById(studentId);
  if (!precheck) return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  const targetPre = (precheck.leaveRequests || []).find((r) => r.id === leaveId);
  if (!targetPre) return NextResponse.json({ success: false, message: '신청을 찾을 수 없습니다.' }, { status: 404 });
  if (!leaveNeedsProof(targetPre.type)) {
    return NextResponse.json({ success: false, message: '이 신청은 사진 증빙 대상이 아니에요.' }, { status: 400 });
  }
  if (targetPre.status !== 'pending') {
    return NextResponse.json({ success: false, message: '이미 처리된 신청에는 증빙을 첨부할 수 없어요.' }, { status: 403 });
  }
  if (!isProofWindowOpen(targetPre.createdAt, Date.now())) {
    return NextResponse.json({ success: false, message: `증빙 첨부는 신청 후 ${PROOF_WINDOW_HOURS}시간 이내에만 가능해요.` }, { status: 403 });
  }

  // Storage 업로드
  let newPath: string;
  try {
    const buffer = await file.arrayBuffer();
    ({ path: newPath } = await uploadLeaveProof(studentId, leaveId, buffer, file.type, ext));
  } catch (e) {
    return NextResponse.json({ success: false, message: e instanceof Error ? e.message : '업로드에 실패했어요.' }, { status: 500 });
  }

  // 낙관적 잠금으로 경로 기록. 기존 증빙이 있으면 교체(옛 객체는 저장 후 삭제).
  for (let attempt = 0; attempt < 3; attempt++) {
    const student = await getStudentById(studentId);
    if (!student) {
      await deleteLeaveProof(newPath);
      return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
    }
    const originalUpdatedAt = student.updatedAt ?? '';
    const target = (student.leaveRequests || []).find((r) => r.id === leaveId);
    if (!target) {
      await deleteLeaveProof(newPath);
      return NextResponse.json({ success: false, message: '신청을 찾을 수 없습니다.' }, { status: 404 });
    }
    // 저장 직전 재검증(동시에 관리자가 처리했을 수 있음)
    if (target.status !== 'pending') {
      await deleteLeaveProof(newPath);
      return NextResponse.json({ success: false, message: '이미 처리된 신청에는 증빙을 첨부할 수 없어요.' }, { status: 403 });
    }
    const oldPath = target.proofPath;
    target.proofPath = newPath;
    target.proofUploadedAt = new Date().toISOString();
    const saved = await patchStudentProgress(student, originalUpdatedAt);
    if (saved === 'conflict') continue;
    if (oldPath && oldPath !== newPath) await deleteLeaveProof(oldPath);
    return NextResponse.json({ success: true, uploadedAt: target.proofUploadedAt });
  }
  // 저장 실패 — 방금 올린 객체 정리
  await deleteLeaveProof(newPath);
  return NextResponse.json({ success: false, message: '저장이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' }, { status: 409 });
}

// 학생: 첨부한 증빙 삭제 (대기중 건만)
export async function DELETE(req: NextRequest) {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }
  const leaveId = req.nextUrl.searchParams.get('leaveId');
  if (!leaveId) return NextResponse.json({ success: false, message: '신청 정보가 필요합니다.' }, { status: 400 });

  for (let attempt = 0; attempt < 3; attempt++) {
    const student = await getStudentById(studentId);
    if (!student) return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
    const originalUpdatedAt = student.updatedAt ?? '';
    const target = (student.leaveRequests || []).find((r) => r.id === leaveId);
    if (!target) return NextResponse.json({ success: false, message: '신청을 찾을 수 없습니다.' }, { status: 404 });
    if (target.status !== 'pending') {
      return NextResponse.json({ success: false, message: '이미 처리된 신청은 변경할 수 없어요.' }, { status: 403 });
    }
    const oldPath = target.proofPath;
    if (!oldPath) return NextResponse.json({ success: true });
    target.proofPath = undefined;
    target.proofUploadedAt = undefined;
    const saved = await patchStudentProgress(student, originalUpdatedAt);
    if (saved === 'conflict') continue;
    await deleteLeaveProof(oldPath);
    return NextResponse.json({ success: true });
  }
  return NextResponse.json({ success: false, message: '저장이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' }, { status: 409 });
}
