import { NextRequest, NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { updateStudentById } from '@/lib/store';
import type { PersonalScheduleItem } from '@/lib/types/student';

const MAX_ITEMS = 1000; // 학생당 개인 일정 보관 상한

function readSchedule(state: Record<string, unknown> | undefined): PersonalScheduleItem[] {
  const raw = state?.personalSchedule;
  return Array.isArray(raw) ? (raw as PersonalScheduleItem[]) : [];
}

// 학생: 캘린더에 본인 개인 일정 작성 (수험 스케줄러). student_state.personalSchedule 에 보관.
export async function POST(req: NextRequest) {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }
  let body: { date?: unknown; title?: unknown; memo?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }
  const date = String(body?.date ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ success: false, message: '날짜를 선택해 주세요.' }, { status: 400 });
  }
  const title = String(body?.title ?? '').trim().slice(0, 100);
  if (!title) return NextResponse.json({ success: false, message: '일정 내용을 입력해 주세요.' }, { status: 400 });
  const memo = String(body?.memo ?? '').trim().slice(0, 500) || undefined;

  const entry: PersonalScheduleItem = {
    id: `psch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    date, title, ...(memo ? { memo } : {}), createdAt: new Date().toISOString(),
  };

  const result = await updateStudentById(studentId, (student) => {
    const state = (student.studentState as Record<string, unknown>) || {};
    const list = readSchedule(state);
    if (list.length >= MAX_ITEMS) list.splice(0, list.length - MAX_ITEMS + 1);
    student.studentState = { ...state, personalSchedule: [...list, entry] };
  });
  if (result === 'not_found') {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }
  if (typeof result === 'string') {
    return NextResponse.json({ success: false, message: '저장이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' }, { status: 409 });
  }
  return NextResponse.json({ success: true, entry });
}

// 학생: 본인 개인 일정 수정 (제목·메모·날짜). 본인 목록 안에서만 대상 매칭 → 타인 일정 수정 불가.
export async function PATCH(req: NextRequest) {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }
  let body: { id?: unknown; date?: unknown; title?: unknown; memo?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }
  const id = String(body?.id ?? '').trim();
  if (!id) return NextResponse.json({ success: false, message: '수정할 일정이 없습니다.' }, { status: 400 });
  const title = String(body?.title ?? '').trim().slice(0, 100);
  if (!title) return NextResponse.json({ success: false, message: '일정 내용을 입력해 주세요.' }, { status: 400 });
  const memo = String(body?.memo ?? '').trim().slice(0, 500);
  const date = String(body?.date ?? '').trim();
  const nextDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;

  let errorResponse: NextResponse | null = null;
  const result = await updateStudentById(studentId, (student) => {
    const state = (student.studentState as Record<string, unknown>) || {};
    const list = readSchedule(state);
    const target = list.find((p) => p.id === id);
    if (!target) {
      errorResponse = NextResponse.json({ success: false, message: '일정을 찾을 수 없습니다.' }, { status: 404 });
      return false;
    }
    student.studentState = {
      ...state,
      personalSchedule: list.map((p) =>
        p.id === id
          ? { ...p, title, memo: memo || undefined, ...(nextDate ? { date: nextDate } : {}) }
          : p,
      ),
    };
  });
  if (errorResponse) return errorResponse;
  if (result === 'not_found') {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }
  if (typeof result === 'string') {
    return NextResponse.json({ success: false, message: '저장이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' }, { status: 409 });
  }
  return NextResponse.json({ success: true });
}

// 학생: 본인 개인 일정 삭제
export async function DELETE(req: NextRequest) {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ success: false, message: '삭제할 일정이 없습니다.' }, { status: 400 });

  const result = await updateStudentById(studentId, (student) => {
    const state = (student.studentState as Record<string, unknown>) || {};
    const list = readSchedule(state);
    student.studentState = { ...state, personalSchedule: list.filter((p) => p.id !== id) };
  });
  if (result === 'not_found') {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }
  if (typeof result === 'string') {
    return NextResponse.json({ success: false, message: '저장이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' }, { status: 409 });
  }
  return NextResponse.json({ success: true });
}
