import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { getStudentById, saveStudent } from '@/lib/store';
import type { SeatAlert } from '@/lib/types/student';

// 관리자: 출결판에서 "자리에 없음"으로 확인된 학생들에게 미착석 알림을 발송한다.
// 학생 페이지 알림으로 누적되며, 학생이 확인(dismiss)하면 사라진다.
export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  let body: { studentIds?: unknown; period?: unknown; periodLabel?: unknown; date?: unknown; message?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const studentIds = Array.isArray(body?.studentIds)
    ? (body.studentIds as unknown[]).filter((v): v is string => typeof v === 'string')
    : [];
  if (studentIds.length === 0) {
    return NextResponse.json({ success: false, message: '대상 학생이 없습니다.' }, { status: 400 });
  }

  const period = Number(body?.period);
  const periodLabel = String(body?.periodLabel ?? '').trim().slice(0, 12) || String(Number.isFinite(period) ? period + 1 : '');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.date ?? '')) ? String(body.date) : '';
  if (!date) {
    return NextResponse.json({ success: false, message: '날짜 형식이 올바르지 않습니다.' }, { status: 400 });
  }
  const message = String(body?.message ?? '').trim().slice(0, 200)
    || `${periodLabel}교시 출석 확인 시 자리에 계시지 않았어요. 외출/자리 비움 사유가 있다면 담당 코멘터에게 알려 주세요.`;

  const nowIso = new Date().toISOString();
  const notified: string[] = [];
  const skipped: string[] = [];

  let lastError: string | null = null;
  for (const id of studentIds) {
    try {
      const student = await getStudentById(id);
      if (!student) { skipped.push(id); continue; }
      // 센터 범위 관리자는 자기 센터 학생에게만 발송 가능
      if (session.campus !== 'all' && student.campus !== session.campus) { skipped.push(id); continue; }

      const alert: SeatAlert = {
        id: `seat_${date}_${Number.isFinite(period) ? period : 'x'}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        date,
        period: Number.isFinite(period) ? period : -1,
        periodLabel,
        message,
        createdAt: nowIso,
        createdBy: session.campus === 'all' ? '관리자' : session.campus,
      };
      student.seatAlerts = [...(student.seatAlerts || []), alert];
      await saveStudent(student);
      notified.push(id);
    } catch (error) {
      lastError = error instanceof Error ? error.message : '저장 실패';
      skipped.push(id);
    }
  }

  if (notified.length === 0 && lastError) {
    return NextResponse.json({ success: false, message: lastError, notifiedCount: 0, skipped }, { status: 500 });
  }
  return NextResponse.json({ success: notified.length > 0, notifiedCount: notified.length, skipped });
}
