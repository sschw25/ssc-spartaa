import { NextRequest, NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { updateStudentById } from '@/lib/store';
import { readActivityEnvelope, writeActivityEnvelope } from '@/lib/student-activity';
import type { MockReviewEntry } from '@/lib/mission-metrics';

function cleanText(value: unknown, max = 1000) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function isDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00+09:00`).getTime());
}

// 학생: 모의고사 오답분석/보완계획 제출. 주간 쿠폰 미션(mock_review_complete)의 원천 데이터.
export async function POST(req: NextRequest) {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }

  let body: { testName?: unknown; testDate?: unknown; wrongNotes?: unknown; actionPlan?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const testName = cleanText(body.testName, 80);
  const testDate = cleanText(body.testDate, 10);
  const wrongNotes = cleanText(body.wrongNotes, 1000);
  const actionPlan = cleanText(body.actionPlan, 1000);

  if (!testName) {
    return NextResponse.json({ success: false, message: '시험명을 입력해 주세요.' }, { status: 400 });
  }
  if (!isDateKey(testDate)) {
    return NextResponse.json({ success: false, message: '시험일을 선택해 주세요.' }, { status: 400 });
  }
  if (wrongNotes.length < 5 || actionPlan.length < 5) {
    return NextResponse.json({ success: false, message: '오답분석과 보완계획을 각각 5자 이상 입력해 주세요.' }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  const review: MockReviewEntry = {
    id: `mock_review_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    testName,
    testDate,
    wrongNotes,
    actionPlan,
    submittedAt: nowIso,
  };

  const result = await updateStudentById(studentId, (student) => {
    const env = readActivityEnvelope(student);
    const current = Array.isArray(env.mock_reviews) ? env.mock_reviews : [];
    env.mock_reviews = [...current, review].slice(-30);
    writeActivityEnvelope(student, env);
  });

  if (result === 'not_found') {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }
  if (typeof result === 'string') {
    return NextResponse.json({ success: false, message: '저장이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' }, { status: 409 });
  }

  return NextResponse.json({ success: true, review });
}
