import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { getMockExams, saveMockExam, deleteMockExam, notifyMockExam } from '@/lib/store';
import type { MockExam } from '@/lib/types/student';

// 관리자: 모의고사 일정 목록 조회
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  try {
    const exams = await getMockExams();
    return NextResponse.json({ success: true, exams });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '조회 실패';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

// 관리자: 모의고사 일정 등록
export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  let body: { name?: unknown; date?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const name = String(body?.name ?? '').trim();
  if (!name) {
    return NextResponse.json({ success: false, message: '시험명을 입력해주세요.' }, { status: 400 });
  }
  const date = String(body?.date ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ success: false, message: '날짜 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  const exam: MockExam = {
    id: `exam_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    date,
    createdAt: nowIso,
  };

  try {
    const saved = await saveMockExam(exam);
    return NextResponse.json({ success: true, exam: saved });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '저장 실패';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

// 관리자: 모의고사 일정 삭제
// 관리자: 학생에게 모의고사 알림 발송 (notifiedAt 설정)
export async function PATCH(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  let body: { examId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const examId = String(body?.examId ?? '').trim();
  if (!examId) {
    return NextResponse.json({ success: false, message: 'examId가 필요합니다.' }, { status: 400 });
  }

  try {
    const nowIso = new Date().toISOString();
    const exam = await notifyMockExam(examId, nowIso);
    return NextResponse.json({ success: true, exam });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '발송 실패';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const examId = searchParams.get('examId');
  if (!examId) {
    return NextResponse.json({ success: false, message: 'examId가 필요합니다.' }, { status: 400 });
  }

  try {
    await deleteMockExam(examId);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '삭제 실패';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
