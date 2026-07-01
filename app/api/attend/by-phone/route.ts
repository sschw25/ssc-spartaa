import { NextResponse } from 'next/server';
import { verifyAttendToken } from '@/lib/attendance-token';
import { getStudentsSummary } from '@/lib/store';
import { toggleAttendance, processAttendance, type AttendanceAction } from '@/lib/attendance-service';
import { clientIp, sharedRateLimit } from '@/lib/rate-limit';
import type { Student } from '@/lib/types/student';

type Match = {
  id: string;
  name: string;
  campus: string;
};

const onlyDigits = (value: unknown) => String(value || '').replace(/\D/g, '');

function phoneValues(student: Student): string[] {
  return [student.studentPhone, student.parentPhone, student.contact]
    .map(onlyDigits)
    .filter((phone) => phone.length >= 4);
}

function findMatches(students: Student[], phoneInput: string): Match[] {
  const digits = onlyDigits(phoneInput);
  if (digits.length < 4) return [];

  return students
    .filter((student) => phoneValues(student).some((phone) => phone.endsWith(digits)))
    .map((student) => ({
      id: student.id,
      name: student.name,
      campus: student.campus || '',
    }));
}

export async function POST(request: Request) {
  const limited = await sharedRateLimit(`attend-phone:${clientIp(request)}`, 30, 60 * 1000);
  if (!limited.allowed) {
    return NextResponse.json(
      { success: false, message: `${limited.retryAfterSec}초 후 다시 시도해 주세요.` },
      { status: 429 }
    );
  }

  try {
    const { token, phone, studentId, action } = await request.json();
    if (!verifyAttendToken(token || '')) {
      return NextResponse.json(
        { success: false, message: '인증 시간이 만료되었습니다. 화면을 새로고침해 주세요.' },
        { status: 400 }
      );
    }

    const digits = onlyDigits(phone);
    if (digits.length < 4) {
      return NextResponse.json(
        { success: false, message: '전화번호 끝 4자리 이상을 입력해 주세요.' },
        { status: 400 }
      );
    }

    const students = await getStudentsSummary();
    const matches = findMatches(students, digits);

    if (matches.length === 0) {
      return NextResponse.json(
        { success: false, message: '일치하는 학생을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    const targetAction = (action as AttendanceAction) || 'check-in';

    if (studentId) {
      const selected = matches.find((match) => match.id === studentId);
      if (!selected) {
        return NextResponse.json(
          { success: false, message: '입력한 번호와 선택한 학생이 일치하지 않습니다.' },
          { status: 400 }
        );
      }

      const result = action
        ? await processAttendance(selected.id, targetAction, 'phone')
        : await toggleAttendance(selected.id, 'phone');
      return NextResponse.json({ success: true, ...result });
    }

    if (matches.length > 1) {
      return NextResponse.json({ success: true, needsSelection: true, matches });
    }

    const result = action
      ? await processAttendance(matches[0].id, targetAction, 'phone')
      : await toggleAttendance(matches[0].id, 'phone');
    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '번호 출결 처리 실패';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
