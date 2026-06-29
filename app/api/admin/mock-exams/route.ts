import { NextResponse } from 'next/server';
import { isAdmin, getAdminSession } from '@/lib/auth';
import { getMockExams, saveMockExam, deleteMockExam, notifyMockExam } from '@/lib/store';
import type { MockExam } from '@/lib/types/student';

const CAMPUSES = ['wonju', 'chuncheon', 'chungju'];

// 관리자: 모의고사 일정 목록 조회 (센터 범위 관리자는 자기 센터 + 전체센터 일정만)
export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  try {
    const all = await getMockExams();
    const exams = session.campus === 'all'
      ? all
      : all.filter((e) => !e.campus || e.campus === 'all' || e.campus === session.campus);
    return NextResponse.json({ success: true, exams });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '조회 실패';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

// 관리자: 모의고사 일정 등록 (센터별)
export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  let body: { name?: unknown; date?: unknown; targetExamTypes?: unknown; campus?: unknown };
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
  const targetExamTypes: string[] = Array.isArray(body?.targetExamTypes)
    ? (body.targetExamTypes as unknown[]).filter((t): t is string => typeof t === 'string')
    : [];

  // 센터: 범위 관리자는 자기 센터로 강제, 전체 관리자는 body 값(미지정/all = 전체)
  let campus: string | undefined;
  if (session.campus !== 'all') {
    campus = session.campus;
  } else {
    const raw = String(body?.campus ?? '').trim();
    campus = CAMPUSES.includes(raw) ? raw : undefined; // 그 외엔 전체 센터
  }

  const nowIso = new Date().toISOString();
  const exam: MockExam = {
    id: `exam_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    date,
    targetExamTypes,
    campus,
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

// 관리자: 학생에게 모의고사 알림 발송/취소 (notifiedAt 설정/해제)
export async function PATCH(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  let body: { examId?: unknown; action?: unknown };
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
    const cancel = body?.action === 'cancel';
    const exam = await notifyMockExam(examId, cancel ? null : new Date().toISOString());
    return NextResponse.json({ success: true, exam });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '처리 실패';
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
