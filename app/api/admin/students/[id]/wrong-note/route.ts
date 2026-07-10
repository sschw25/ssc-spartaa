import { NextRequest, NextResponse } from 'next/server';
import { canAdminAccessStudent } from '@/lib/auth';
import { getStudentById, patchStudentProgress, signedWrongNoteUrl } from '@/lib/store';
import type { BookProgress, Student } from '@/lib/types/student';

// 대상 교재(루트 books + subjects.books)를 모두 찾는다.
function matchingBooks(student: Student, materialId: string): BookProgress[] {
  return [
    ...((student.books || []).filter((b) => b.id === materialId)),
    ...((student.subjects || []).flatMap((s) => (s.books || []).filter((b) => b.id === materialId))),
  ];
}

// 관리자: 오답노트 문제 사진 열람용 서명 URL 발급 (짧은 수명). 캠퍼스 접근 권한 검사.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await canAdminAccessStudent(id))) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });
  }
  const materialId = req.nextUrl.searchParams.get('materialId') || '';
  const noteId = req.nextUrl.searchParams.get('noteId') || '';
  if (!materialId || !noteId) return NextResponse.json({ success: false, message: '대상 정보가 필요합니다.' }, { status: 400 });

  const student = await getStudentById(id);
  if (!student) return NextResponse.json({ success: false, message: '해당 원생을 찾을 수 없습니다.' }, { status: 404 });
  const books = matchingBooks(student, materialId);
  const note = books.length > 0 ? (books[0].wrongNotes || []).find((n) => n.id === noteId) : undefined;
  if (!note?.imagePath) {
    return NextResponse.json({ success: false, message: '첨부된 사진이 없습니다.' }, { status: 404 });
  }
  try {
    const url = await signedWrongNoteUrl(note.imagePath, 300);
    return NextResponse.json({ success: true, url });
  } catch (e) {
    return NextResponse.json({ success: false, message: e instanceof Error ? e.message : '열람 링크 생성에 실패했습니다.' }, { status: 500 });
  }
}

// 관리자: 오답노트 확인 처리 토글 (resolvedAt 설정/해제). 캠퍼스 접근 권한 검사.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await canAdminAccessStudent(id))) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });
  }
  let body: { materialId?: unknown; noteId?: unknown; resolved?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }
  const materialId = typeof body.materialId === 'string' ? body.materialId : '';
  const noteId = typeof body.noteId === 'string' ? body.noteId : '';
  const resolved = body.resolved !== false; // 기본 true(확인). false 면 미확인으로 되돌림.
  if (!materialId || !noteId) return NextResponse.json({ success: false, message: '대상 정보가 필요합니다.' }, { status: 400 });

  for (let attempt = 0; attempt < 3; attempt++) {
    const student = await getStudentById(id);
    if (!student) return NextResponse.json({ success: false, message: '해당 원생을 찾을 수 없습니다.' }, { status: 404 });
    const originalUpdatedAt = student.updatedAt ?? '';
    const books = matchingBooks(student, materialId);
    if (books.length === 0) return NextResponse.json({ success: false, message: '해당 교재를 찾을 수 없습니다.' }, { status: 404 });
    const exists = (books[0].wrongNotes || []).some((n) => n.id === noteId);
    if (!exists) return NextResponse.json({ success: false, message: '해당 오답을 찾을 수 없습니다.' }, { status: 404 });
    const nowIso = new Date().toISOString();
    books.forEach((b) => {
      b.wrongNotes = (b.wrongNotes || []).map((n) => {
        if (n.id !== noteId) return n;
        const updated = { ...n };
        if (resolved) updated.resolvedAt = nowIso;
        else delete updated.resolvedAt;
        return updated;
      });
    });
    const saved = await patchStudentProgress(student, originalUpdatedAt);
    if (saved === 'conflict') continue;
    return NextResponse.json({ success: true, resolvedAt: resolved ? nowIso : undefined });
  }
  return NextResponse.json({ success: false, message: '저장이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' }, { status: 409 });
}
