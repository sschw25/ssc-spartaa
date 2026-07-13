import { NextRequest, NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import {
  getStudentById,
  patchStudentProgress,
  uploadWrongNoteImage,
  signedWrongNoteUrl,
  deleteWrongNoteImage,
} from '@/lib/store';
import type { BookProgress, Student, WrongNote } from '@/lib/types/student';

const MAX_BYTES = 6 * 1024 * 1024;
const MIME_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_NOTES_PER_BOOK = 50; // 자료당 오답 노트 상한
const MAX_TEXT_LEN = 2000;     // 문제/오답 내용 길이 상한
// 기본 오답 사유 태그 4종 — 여기에 학생이 만든 커스텀 태그(subject.customWrongTags)가 더해져
// "그 학생의 동적 화이트리스트"가 된다(고정 화이트리스트 대체).
const BASE_TAGS = new Set(['calculation_error', 'time_limit', 'misread_condition', 'concept_leak']);
const BASE_TAG_LABELS = new Set(['연산', '시간', '오독', '개념']); // 커스텀 태그명으로 금지(기본과 혼동 방지)
const MAX_CUSTOM_TAGS_PER_SUBJECT = 12; // 학생당 과목별 커스텀 태그 상한
const MAX_TAG_NAME_LEN = 10;            // 커스텀 태그명 길이 상한(1~10자)

// 그 학생에게 허용된 태그 전체 — 기본 4종 + 모든 과목의 커스텀 태그(union).
function allowedTagSet(student: Student): Set<string> {
  const set = new Set(BASE_TAGS);
  (student.subjects || []).forEach((s) => (s.customWrongTags || []).forEach((t) => set.add(t)));
  return set;
}

// 요청 태그 원본 파싱 — 트림·중복 제거만. 화이트리스트 검증은 학생 로드 후 finalizeTags 로.
function parseTagList(raw: unknown): string[] {
  let arr: string[] = [];
  if (Array.isArray(raw)) arr = raw.map((v) => String(v));
  else if (typeof raw === 'string') arr = raw.split(',');
  return Array.from(new Set(arr.map((v) => v.trim()).filter(Boolean))).slice(0, 12);
}

// 화이트리스트(기본+커스텀) 적용 + 노트당 최대 4개 유지.
function finalizeTags(list: string[], allowed: Set<string>): string[] | undefined {
  const cleaned = list.filter((v) => allowed.has(v)).slice(0, 4);
  return cleaned.length > 0 ? cleaned : undefined;
}

function cleanText(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().slice(0, MAX_TEXT_LEN) : '';
}

// 대상 교재(루트 books + subjects.books)를 모두 찾는다. 두 저장 위치를 함께 갱신해 동기 유지.
// 주의: rowToStudent 가 루트 books 를 subjects 에서 '같은 객체 참조'로 평탄화하므로 반드시 참조 기준
// 중복 제거를 해야 한다 — 안 하면 append 류 변이가 한 객체에 두 번 적용된다(오답 이중 저장 버그).
function matchingBooks(student: Student, materialId: string): BookProgress[] {
  return Array.from(new Set([
    ...((student.books || []).filter((b) => b.id === materialId)),
    ...((student.subjects || []).flatMap((s) => (s.books || []).filter((b) => b.id === materialId))),
  ]));
}

// 학생: 오답노트 문제 사진의 서명 URL 일괄 발급 (본인 소유 노트 이미지만).
export async function GET() {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }
  const student = await getStudentById(studentId);
  if (!student) return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });

  const paths = new Set<string>();
  const collect = (b: BookProgress) => (b.wrongNotes || []).forEach((n) => { if (n.imagePath) paths.add(n.imagePath); });
  (student.books || []).forEach(collect);
  (student.subjects || []).forEach((s) => (s.books || []).forEach(collect));

  const urls: Record<string, string> = {};
  await Promise.all(
    Array.from(paths).map(async (p) => {
      try { urls[p] = await signedWrongNoteUrl(p, 300); } catch { /* 만료·삭제된 객체는 건너뜀 */ }
    }),
  );
  return NextResponse.json({ success: true, urls });
}

// 학생: 커스텀 오답 태그 추가/삭제 (과목 단위 · subject.customWrongTags).
// 삭제해도 기존 노트에 저장된 태그 문자열은 건드리지 않는다(노트 라벨은 그대로 표시).
export async function PUT(req: NextRequest) {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }
  let body: { subjectId?: unknown; action?: unknown; tag?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }
  const subjectId = typeof body.subjectId === 'string' ? body.subjectId : '';
  const action = body.action === 'add' || body.action === 'remove' ? body.action : null;
  const tag = typeof body.tag === 'string' ? body.tag.trim() : '';
  if (!subjectId || !action || !tag) {
    return NextResponse.json({ success: false, message: '태그 정보가 올바르지 않습니다.' }, { status: 400 });
  }
  if (action === 'add') {
    if (tag.length > MAX_TAG_NAME_LEN) {
      return NextResponse.json({ success: false, message: `태그는 ${MAX_TAG_NAME_LEN}자 이내로 지어 주세요.` }, { status: 400 });
    }
    // ','는 노트 태그 전송(comma join) 구분자와 충돌 — 태그명에 금지.
    if (tag.includes(',')) {
      return NextResponse.json({ success: false, message: '태그 이름에는 쉼표를 쓸 수 없어요.' }, { status: 400 });
    }
    if (BASE_TAGS.has(tag) || BASE_TAG_LABELS.has(tag)) {
      return NextResponse.json({ success: false, message: '기본 태그와 같은 이름은 만들 수 없어요.' }, { status: 400 });
    }
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const student = await getStudentById(studentId);
    if (!student) return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
    const originalUpdatedAt = student.updatedAt ?? '';
    const subject = (student.subjects || []).find((s) => s.id === subjectId);
    if (!subject) return NextResponse.json({ success: false, message: '해당 과목을 찾을 수 없습니다.' }, { status: 404 });
    const current = subject.customWrongTags || [];

    if (action === 'add') {
      if (current.includes(tag)) {
        return NextResponse.json({ success: false, message: '이미 있는 태그예요.' }, { status: 400 });
      }
      if (current.length >= MAX_CUSTOM_TAGS_PER_SUBJECT) {
        return NextResponse.json({ success: false, message: `태그는 과목당 최대 ${MAX_CUSTOM_TAGS_PER_SUBJECT}개까지 만들 수 있어요.` }, { status: 400 });
      }
      subject.customWrongTags = [...current, tag];
    } else {
      if (!current.includes(tag)) {
        // 이미 없음 — 멱등 성공
        return NextResponse.json({ success: true, customWrongTags: current });
      }
      subject.customWrongTags = current.filter((t) => t !== tag);
    }

    const saved = await patchStudentProgress(student, originalUpdatedAt);
    if (saved === 'conflict') continue;
    return NextResponse.json({ success: true, customWrongTags: subject.customWrongTags });
  }
  return NextResponse.json({ success: false, message: '저장이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' }, { status: 409 });
}

// 학생: 오답노트 문제 추가 (텍스트 + 선택 사진). multipart/form-data.
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
  const materialId = String(form.get('materialId') ?? '').trim();
  if (!materialId) return NextResponse.json({ success: false, message: '대상 교재 정보가 필요합니다.' }, { status: 400 });
  const text = cleanText(form.get('text'));
  const rawTags = parseTagList(form.get('tags')); // 화이트리스트는 학생 로드 후 적용(커스텀 태그 반영)
  const file = form.get('file');
  const hasFile = file instanceof File && file.size > 0;
  if (!text && !hasFile) {
    return NextResponse.json({ success: false, message: '문제 내용을 적거나 사진을 첨부해 주세요.' }, { status: 400 });
  }

  // 사진 검증 + 업로드 (본문 저장 전에 먼저 확인)
  let imagePath: string | undefined;
  if (hasFile) {
    const ext = MIME_EXT[(file as File).type];
    if (!ext) return NextResponse.json({ success: false, message: 'JPEG/PNG/WebP 이미지만 첨부할 수 있어요.' }, { status: 400 });
    if ((file as File).size > MAX_BYTES) return NextResponse.json({ success: false, message: '이미지 용량이 너무 큽니다(6MB 이하).' }, { status: 400 });
    try {
      const buffer = await (file as File).arrayBuffer();
      ({ path: imagePath } = await uploadWrongNoteImage(studentId, materialId, buffer, (file as File).type, ext));
    } catch (e) {
      return NextResponse.json({ success: false, message: e instanceof Error ? e.message : '업로드에 실패했어요.' }, { status: 500 });
    }
  }

  const note: WrongNote = {
    id: `wn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ...(text ? { text } : {}),
    ...(imagePath ? { imagePath } : {}),
    createdAt: new Date().toISOString(),
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    const student = await getStudentById(studentId);
    if (!student) {
      if (imagePath) await deleteWrongNoteImage(imagePath);
      return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
    }
    const originalUpdatedAt = student.updatedAt ?? '';
    // 태그 확정 — 기본 4종 + 이 학생의 커스텀 태그만 통과(최대 4개).
    const tags = finalizeTags(rawTags, allowedTagSet(student));
    if (tags) note.tags = tags; else delete note.tags;
    const books = matchingBooks(student, materialId);
    if (books.length === 0) {
      if (imagePath) await deleteWrongNoteImage(imagePath);
      return NextResponse.json({ success: false, message: '해당 교재를 찾을 수 없습니다.' }, { status: 404 });
    }
    if ((books[0].wrongNotes || []).length >= MAX_NOTES_PER_BOOK) {
      if (imagePath) await deleteWrongNoteImage(imagePath);
      return NextResponse.json({ success: false, message: `한 교재에는 오답을 최대 ${MAX_NOTES_PER_BOOK}개까지 저장할 수 있어요.` }, { status: 400 });
    }
    books.forEach((b) => { b.wrongNotes = [...(b.wrongNotes || []), note]; });
    const saved = await patchStudentProgress(student, originalUpdatedAt);
    if (saved === 'conflict') continue;
    let signedUrl: string | undefined;
    if (imagePath) { try { signedUrl = await signedWrongNoteUrl(imagePath, 300); } catch { /* 표시는 GET 재조회로 복구 */ } }
    return NextResponse.json({ success: true, note, ...(signedUrl ? { signedUrl } : {}) });
  }
  if (imagePath) await deleteWrongNoteImage(imagePath);
  return NextResponse.json({ success: false, message: '저장이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' }, { status: 409 });
}

// 학생: 오답노트 내용/태그 수정 (사진은 변경하지 않음 — 사진 교체는 삭제 후 재등록).
export async function PATCH(req: NextRequest) {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }
  let body: { materialId?: unknown; noteId?: unknown; text?: unknown; tags?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }
  const materialId = typeof body.materialId === 'string' ? body.materialId : '';
  const noteId = typeof body.noteId === 'string' ? body.noteId : '';
  if (!materialId || !noteId) return NextResponse.json({ success: false, message: '수정 대상 정보가 필요합니다.' }, { status: 400 });
  const hasText = body.text !== undefined;
  const hasTags = body.tags !== undefined;
  const nextText = hasText ? cleanText(body.text) : '';
  const rawTags = hasTags ? parseTagList(body.tags) : [];

  for (let attempt = 0; attempt < 3; attempt++) {
    const student = await getStudentById(studentId);
    if (!student) return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
    const originalUpdatedAt = student.updatedAt ?? '';
    // 태그 확정 — 기본 4종 + 이 학생의 커스텀 태그만 통과(최대 4개).
    const nextTags = hasTags ? finalizeTags(rawTags, allowedTagSet(student)) : undefined;
    const books = matchingBooks(student, materialId);
    if (books.length === 0) return NextResponse.json({ success: false, message: '해당 교재를 찾을 수 없습니다.' }, { status: 404 });
    const target = (books[0].wrongNotes || []).find((n) => n.id === noteId);
    if (!target) return NextResponse.json({ success: false, message: '해당 오답을 찾을 수 없습니다.' }, { status: 404 });
    // 내용·사진이 모두 비면 삭제와 다름없으니 막는다(사진은 유지).
    if (hasText && !nextText && !target.imagePath) {
      return NextResponse.json({ success: false, message: '문제 내용을 비울 수 없어요. 삭제하려면 삭제를 눌러 주세요.' }, { status: 400 });
    }
    books.forEach((b) => {
      b.wrongNotes = (b.wrongNotes || []).map((n) => {
        if (n.id !== noteId) return n;
        const updated: WrongNote = { ...n };
        if (hasText) { if (nextText) updated.text = nextText; else delete updated.text; }
        if (hasTags) { if (nextTags) updated.tags = nextTags; else delete updated.tags; }
        return updated;
      });
    });
    const saved = await patchStudentProgress(student, originalUpdatedAt);
    if (saved === 'conflict') continue;
    return NextResponse.json({ success: true });
  }
  return NextResponse.json({ success: false, message: '저장이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' }, { status: 409 });
}

// 학생: 오답노트 삭제 (사진도 함께 제거).
export async function DELETE(req: NextRequest) {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }
  const materialId = req.nextUrl.searchParams.get('materialId') || '';
  const noteId = req.nextUrl.searchParams.get('noteId') || '';
  if (!materialId || !noteId) return NextResponse.json({ success: false, message: '삭제 대상 정보가 필요합니다.' }, { status: 400 });

  for (let attempt = 0; attempt < 3; attempt++) {
    const student = await getStudentById(studentId);
    if (!student) return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
    const originalUpdatedAt = student.updatedAt ?? '';
    const books = matchingBooks(student, materialId);
    if (books.length === 0) return NextResponse.json({ success: false, message: '해당 교재를 찾을 수 없습니다.' }, { status: 404 });
    const target = (books[0].wrongNotes || []).find((n) => n.id === noteId);
    if (!target) return NextResponse.json({ success: true }); // 이미 없음 — 멱등 성공
    const imagePath = target.imagePath;
    books.forEach((b) => { b.wrongNotes = (b.wrongNotes || []).filter((n) => n.id !== noteId); });
    const saved = await patchStudentProgress(student, originalUpdatedAt);
    if (saved === 'conflict') continue;
    if (imagePath) await deleteWrongNoteImage(imagePath);
    return NextResponse.json({ success: true });
  }
  return NextResponse.json({ success: false, message: '저장이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' }, { status: 409 });
}
