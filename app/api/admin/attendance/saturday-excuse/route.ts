import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession, type AdminSession } from '@/lib/auth';
import { getStudents, updateStudentById, getSessionsByDate } from '@/lib/store';
import type { SaturdayLateExcuse, PenaltyRecord, Student } from '@/lib/types/student';

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

// 캠퍼스 관리자는 본인 캠퍼스 학생만, 슈퍼 관리자('all')는 전원 접근 가능
const canAccessStudent = (session: AdminSession, student: Pick<Student, 'campus'>) =>
  session.campus === 'all' || student.campus === session.campus;

function getPrevSaturday(refDate = new Date()): string {
  const date = new Date(refDate);
  const day = date.getDay(); // 0: 일, 1: 월, ..., 6: 토
  const diff = day === 6 ? 0 : -(day + 1); // 직전 토요일과의 차이
  date.setDate(date.getDate() + diff);
  return date.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get('date');

  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateParam || '')
    ? dateParam!
    : getPrevSaturday();

  try {
    const [allStudents, sessions] = await Promise.all([
      getStudents(),
      getSessionsByDate(date)
    ]);

    // 캠퍼스 관리자는 본인 캠퍼스 학생만 노출
    const students = allStudents.filter((s) => canAccessStudent(session, s));
    const attendedStudentIds = new Set(sessions.map(s => s.student_id));

    const rows = students.map(student => {
      const hasAttended = attendedStudentIds.has(student.id);
      
      const hasApprovedLeave = (student.leaveRequests || []).some(
        r => r.date === date && r.status === 'approved'
      );

      const isTarget = !hasAttended && !hasApprovedLeave;

      if (!isTarget) return null;

      const excuse = (student.saturdayLateExcuses || []).find(e => e.date === date);

      return {
        studentId: student.id,
        name: student.name,
        campus: student.campus,
        manager: student.manager,
        excuseId: excuse?.id || null,
        status: excuse?.status || 'not_requested',
        requestedAt: excuse?.requestedAt || null,
        reason: excuse?.reason || null,
        submittedAt: excuse?.submittedAt || null,
        resolvedAt: excuse?.resolvedAt || null,
        demeritPoint: excuse?.demeritPoint || null,
      };
    }).filter(Boolean);

    return NextResponse.json({ success: true, date, rows });
  } catch (error: unknown) {
    console.error('saturday-excuse GET error:', error);
    return NextResponse.json({ success: false, message: getErrorMessage(error, '조회 실패') }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  let body: { action?: string; studentIds?: string[]; studentId?: string; date?: string; decision?: string; demeritPoint?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  const { action, date } = body;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ success: false, message: '올바른 날짜를 지정해 주세요.' }, { status: 400 });
  }

  const nowIso = new Date().toISOString();

  try {
    if (action === 'request') {
      const studentIds = body.studentIds || [];
      if (studentIds.length === 0) {
        return NextResponse.json({ success: false, message: '요청할 학생을 선택해 주세요.' }, { status: 400 });
      }

      const students = await getStudents();
      const updatedStudents = [];

      for (const id of studentIds) {
        const student = students.find(s => s.id === id);
        if (!student) continue;
        if (!canAccessStudent(session, student)) continue; // 타 캠퍼스 학생은 건너뜀

        const newExcuse: SaturdayLateExcuse = {
          id: `excuse_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          date,
          status: 'pending',
          requestedAt: nowIso,
        };

        const r = await updateStudentById(student.id, (fresh) => {
          const excuses = fresh.saturdayLateExcuses || [];
          const existingIdx = excuses.findIndex(e => e.date === date);

          if (existingIdx >= 0) {
            excuses[existingIdx] = newExcuse;
          } else {
            excuses.push(newExcuse);
          }

          fresh.saturdayLateExcuses = excuses;
        });
        if (r !== 'not_found' && typeof r !== 'string') updatedStudents.push(student.id);
      }

      return NextResponse.json({ success: true, message: `${updatedStudents.length}명에게 증빙 요청을 보냈습니다.` });
    } 
    
    if (action === 'resolve') {
      const { studentId, decision, demeritPoint = 1 } = body;
      if (!studentId || !decision || !['excused', 'unexcused_late'].includes(decision)) {
        return NextResponse.json({ success: false, message: '올바른 처리 정보가 아닙니다.' }, { status: 400 });
      }

      const snapshot = await getStudents();
      const snapStudent = snapshot.find(s => s.id === studentId);
      if (!snapStudent) {
        return NextResponse.json({ success: false, message: '학생을 찾을 수 없습니다.' }, { status: 404 });
      }
      if (!canAccessStudent(session, snapStudent)) {
        return NextResponse.json({ success: false, message: '해당 학생에 접근할 권한이 없습니다.' }, { status: 403 });
      }

      let resolveError: NextResponse | null = null;
      const result = await updateStudentById(studentId, (student) => {
        const excuses = student.saturdayLateExcuses || [];
        const excuse = excuses.find(e => e.date === date);
        if (!excuse) {
          resolveError = NextResponse.json({ success: false, message: '해당 날짜의 증빙 요청 내역이 없습니다.' }, { status: 404 });
          return false;
        }

        excuse.status = decision as 'excused' | 'unexcused_late';
        excuse.resolvedAt = nowIso;

        if (decision === 'unexcused_late') {
          excuse.demeritPoint = demeritPoint;

          const penalties = student.penalties || [];
          const todayStr = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
          const newPenalty: PenaltyRecord = {
            id: `penalty_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            date: todayStr,
            points: demeritPoint,
            reason: `[${date} 토요일] 지각/결석 사유 증빙 미제출 또는 단순지각`,
            type: 'penalty',
            awardedBy: '관리자(토요증빙시스템)',
            createdAt: nowIso
          };
          student.penalties = [...penalties, newPenalty];
        }

        student.saturdayLateExcuses = excuses;
      });

      if (resolveError) return resolveError;
      if (result === 'not_found') {
        return NextResponse.json({ success: false, message: '학생을 찾을 수 없습니다.' }, { status: 404 });
      }
      if (typeof result === 'string') {
        return NextResponse.json({ success: false, message: '저장이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' }, { status: 409 });
      }

      return NextResponse.json({
        success: true,
        message: decision === 'excused' ? '사유 참작 처리되었습니다.' : `지각 벌점 ${demeritPoint}점이 부여되었습니다.`
      });
    }

    return NextResponse.json({ success: false, message: '올바르지 않은 action입니다.' }, { status: 400 });
  } catch (error: unknown) {
    console.error('saturday-excuse POST error:', error);
    return NextResponse.json({ success: false, message: getErrorMessage(error, '처리 실패') }, { status: 500 });
  }
}
