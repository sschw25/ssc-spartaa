import { NextRequest, NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { getStudentById, saveStudent } from '@/lib/store';
import type { ConsultationLog } from '@/lib/types/student';

const REQUEST_TYPES = ['progress', 'subject', 'plan', 'halfDay', 'restPass', 'etc'] as const;

// 학생이 관리자에게 진도/과목/학습계획 변경 등을 신청 (consultation_logs 재사용, type==='request')
export async function POST(req: NextRequest) {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }

  let body: { requestType?: unknown; message?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const requestType = (REQUEST_TYPES as readonly string[]).includes(String(body?.requestType))
    ? (body!.requestType as ConsultationLog['requestType'])
    : 'etc';
  const message = String(body?.message ?? '').trim();
  if (!message) {
    return NextResponse.json({ success: false, message: '신청 내용을 입력해 주세요.' }, { status: 400 });
  }
  if (message.length > 1000) {
    return NextResponse.json({ success: false, message: '신청 내용이 너무 깁니다.' }, { status: 400 });
  }

  const student = await getStudentById(studentId);
  if (!student) {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }

  const nowIso = new Date().toISOString();
  const request: ConsultationLog = {
    id: `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date()),
    manager: '🙋 학생 신청',
    content: message,
    type: 'request',
    requestType,
    status: 'pending',
    createdAt: nowIso,
  };
  student.consultationLogs = [...(student.consultationLogs || []), request];
  await saveStudent(student);

  return NextResponse.json({ success: true, request });
}

// 학생이 본인이 올린 '대기중' 신청을 취소
export async function DELETE(req: NextRequest) {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }
  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ success: false, message: '취소할 신청이 없습니다.' }, { status: 400 });
  }

  const student = await getStudentById(studentId);
  if (!student) {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }

  const target = (student.consultationLogs || []).find((l) => l.id === id);
  if (!target || target.type !== 'request') {
    return NextResponse.json({ success: false, message: '신청을 찾을 수 없습니다.' }, { status: 404 });
  }
  if (target.status === 'resolved') {
    return NextResponse.json({ success: false, message: '이미 처리된 신청은 취소할 수 없습니다.' }, { status: 403 });
  }

  student.consultationLogs = (student.consultationLogs || []).filter((l) => l.id !== id);
  await saveStudent(student);

  return NextResponse.json({ success: true });
}
