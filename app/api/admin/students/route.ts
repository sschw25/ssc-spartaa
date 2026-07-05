import { NextResponse } from 'next/server';
import { getStudents, saveStudent } from '@/lib/store';
import { Student } from '@/lib/types/student';
import { getAdminSession } from '@/lib/auth';

type SmsTarget = 'parent' | 'student';

function onlyDigits(value: unknown): string {
  return typeof value === 'string' ? value.replace(/[^\d]/g, '') : '';
}

function normalizeSmsTargets(value: unknown): SmsTarget[] {
  if (!Array.isArray(value)) return ['parent'];
  return value.filter((target): target is SmsTarget => target === 'parent' || target === 'student');
}

function normalizeSeatNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

// 저장 오염/DoS 방어: 문자열/배열 상한을 넉넉히 건다(PUT 경로와 동일 정책).
function capStr(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}
function capArr<T>(value: T[] | undefined, max: number): T[] {
  if (!Array.isArray(value)) return [];
  return value.length > max ? value.slice(0, max) : value;
}

// 1. 전체 학생 및 진도/상담/성적 일괄 조회
export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  try {
    const students = await getStudents();
    const campusScoped = session.campus === 'all' 
      ? students 
      : students.filter(s => s.campus === session.campus);

    const sanitized = campusScoped.map((student) => {
      const next = { ...student };
      delete next.sharePasswordHash;
      return next;
    });
    return NextResponse.json({ success: true, data: sanitized });
  } catch (error) {
    console.error('API GET /students error:', error);
    return NextResponse.json({ success: false, message: '데이터 조회에 실패했습니다.' }, { status: 500 });
  }
}

// 2. 신규 학생 추가
export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  try {
    const studentData = await request.json() as Partial<Student>;
    if (!studentData.name || !studentData.campus) {
      return NextResponse.json({ success: false, message: '원생 이름과 캠퍼스 정보는 필수입니다.' }, { status: 400 });
    }

    if (session.campus !== 'all' && studentData.campus !== session.campus) {
      return NextResponse.json({ success: false, message: '담당 캠퍼스 이외의 원생을 추가할 권한이 없습니다.' }, { status: 403 });
    }

    // 신규 ID 및 날짜 생성
    const id = `std_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const now = new Date().toISOString();

    const newStudent: Student = {
      id,
      name: capStr(studentData.name, 200),
      loginId: studentData.loginId?.trim().toLowerCase() || undefined,
      campus: studentData.campus,
      manager: capStr(studentData.manager, 200),
      contact: capStr(studentData.contact, 200),
      lifeComment: capStr(studentData.lifeComment, 20000),
      studentLifeComment: capStr(studentData.studentLifeComment, 20000),
      specialNote: capStr(studentData.specialNote, 20000),
      nextConsultationDate: studentData.nextConsultationDate || undefined,
      parentPhone: onlyDigits(studentData.parentPhone),
      studentPhone: onlyDigits(studentData.studentPhone),
      smsTargets: normalizeSmsTargets(studentData.smsTargets),
      seatNumber: normalizeSeatNumber(studentData.seatNumber),
      createdAt: now,
      updatedAt: now,
      books: capArr(studentData.books, 500),
      lectures: capArr(studentData.lectures, 500),
      consultationLogs: capArr(studentData.consultationLogs, 500),
      grades: capArr(studentData.grades, 500),
      subjects: capArr(studentData.subjects, 500),
      enrollmentEndDate: studentData.enrollmentEndDate || undefined,
      weeklyGradeCheck: Boolean(studentData.weeklyGradeCheck),
      awaySchedules: capArr(studentData.awaySchedules, 500),
    };

    const saved = await saveStudent(newStudent);
    return NextResponse.json({ success: true, data: saved });
  } catch (error) {
    console.error('API POST /students error:', error);
    return NextResponse.json({ success: false, message: '원생 등록에 실패했습니다.' }, { status: 500 });
  }
}
