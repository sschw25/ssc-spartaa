import { NextRequest, NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { getStudentById, saveStudent } from '@/lib/store';
import type { ConsultationLog } from '@/lib/types/student';

export async function POST(req: NextRequest) {
  let body: { studentId?: unknown; message?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  // studentId는 반드시 검증된 세션에서만 유도한다(클라이언트 body 폴백 금지 — IDOR 방지)
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }

  const message = String(body?.message ?? '').trim();
  if (!message) {
    return NextResponse.json({ success: false, message: '건의 내용을 입력해 주세요.' }, { status: 400 });
  }
  if (message.length > 1000) {
    return NextResponse.json({ success: false, message: '건의 내용이 너무 깁니다.' }, { status: 400 });
  }

  const student = await getStudentById(studentId);
  if (!student) {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }

  const nowIso = new Date().toISOString();
  const suggestion: ConsultationLog = {
    id: `sug_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date()),
    manager: '학생 건의',
    content: message,
    type: 'suggestion',
    status: 'pending',
    createdAt: nowIso,
  };

  student.consultationLogs = [suggestion, ...(student.consultationLogs || [])];
  await saveStudent(student);

  return NextResponse.json({ success: true, suggestion });
}

export async function DELETE(req: NextRequest) {
  // studentId는 반드시 검증된 세션에서만 유도한다(쿼리 폴백 금지 — IDOR 방지)
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ success: false, message: '취소할 건의사항이 없습니다.' }, { status: 400 });
  }

  const student = await getStudentById(studentId);
  if (!student) {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }

  const target = (student.consultationLogs || []).find((log) => log.id === id && log.type === 'suggestion');
  if (!target) {
    return NextResponse.json({ success: false, message: '건의사항을 찾을 수 없습니다.' }, { status: 404 });
  }
  if (target.status === 'resolved') {
    return NextResponse.json({ success: false, message: '이미 처리된 건의사항은 취소할 수 없습니다.' }, { status: 403 });
  }

  student.consultationLogs = (student.consultationLogs || []).filter((log) => log.id !== id);
  await saveStudent(student);

  return NextResponse.json({ success: true });
}
