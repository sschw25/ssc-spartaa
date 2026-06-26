import { NextRequest, NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { getStudentById, saveStudent } from '@/lib/store';
import type { PhoneSubmission } from '@/lib/types/student';

function kstDateStr(): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date()).replace(/\. /g, '-').replace('.', '');
}

// 학생: 오늘 휴대폰 제출 방식 신청
export async function POST(req: NextRequest) {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }

  let body: { type?: unknown; reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const type = body?.type;
  if (type !== 'keep' && type !== 'locker') {
    return NextResponse.json({ success: false, message: '종류가 올바르지 않습니다.' }, { status: 400 });
  }
  const reason = String(body?.reason ?? '').trim().slice(0, 200);

  const student = await getStudentById(studentId);
  if (!student) {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }

  const today = kstDateStr();
  const existing = student.phoneSubmissions || [];

  // 오늘 이미 대기/승인 신청이 있으면 중복 방지
  const dup = existing.find((s) => s.date === today && s.status !== 'rejected');
  if (dup) {
    return NextResponse.json({ success: false, message: '오늘 이미 신청한 내역이 있습니다.' }, { status: 409 });
  }

  const submission: PhoneSubmission = {
    id: `phone_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    date: today,
    type,
    reason: reason || undefined,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  student.phoneSubmissions = [...existing, submission];
  await saveStudent(student);

  return NextResponse.json({ success: true, submission });
}

// 학생: 오늘 대기중 신청 취소
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

  const target = (student.phoneSubmissions || []).find((s) => s.id === id);
  if (!target) {
    return NextResponse.json({ success: false, message: '신청을 찾을 수 없습니다.' }, { status: 404 });
  }
  if (target.status !== 'pending') {
    return NextResponse.json({ success: false, message: '이미 처리된 신청은 취소할 수 없습니다.' }, { status: 403 });
  }

  student.phoneSubmissions = (student.phoneSubmissions || []).filter((s) => s.id !== id);
  await saveStudent(student);

  return NextResponse.json({ success: true });
}
