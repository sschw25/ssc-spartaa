import { NextResponse } from 'next/server';
import { getAdminSession, canAdminAccessStudent } from '@/lib/auth';
import {
  getConsultationBookingsForCampuses,
  addConsultationBooking,
  patchConsultationBooking,
  getStudentById,
  getConsultationBlackouts,
  setConsultationBlackouts,
  cancelBookingsConflictingWithBlackouts,
} from '@/lib/store';
import {
  buildDaySlotGrid,
  isConsultationCampus,
  getWeekdayKey,
  slotsForDay,
  availableSlotsForDate,
  isSlotFree,
  counselorFor,
  CAMPUS_CONSULTATION,
  type ConsultationCampus,
  type DaySlotGrid,
} from '@/lib/consultation-schedule';
import type { ConsultationBooking, BlackoutEntry } from '@/lib/types/student';

const ALL_CAMPUSES: ConsultationCampus[] = ['wonju', 'chuncheon', 'chungju'];

// KST 현재 시각(HH:MM, 24시간) — 과거 슬롯 제안 방지용.
function kstNowHHMM(): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date());
}

// KST 기준 오늘 날짜 (YYYY-MM-DD)
function kstToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

// 세션이 접근 가능한 센터 목록 결정. 마스터('all')는 ?campus= 필터를 그 안에서만 허용.
function resolveCampuses(sessionCampus: string, campusFilter: string | null): ConsultationCampus[] {
  if (sessionCampus === 'all') {
    if (campusFilter && isConsultationCampus(campusFilter)) return [campusFilter];
    return ALL_CAMPUSES;
  }
  if (isConsultationCampus(sessionCampus)) return [sessionCampus];
  return [];
}

// GET: 예약 원장 + 센터별 운영일 슬롯 그리드.
export async function GET(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  const url = new URL(request.url);
  const campusFilter = url.searchParams.get('campus');
  const campuses = resolveCampuses(session.campus, campusFilter);
  if (campuses.length === 0) {
    return NextResponse.json({ success: false, message: '접근 가능한 센터가 없습니다.' }, { status: 403 });
  }

  const today = kstToday();
  const bookings = await getConsultationBookingsForCampuses(campuses);

  const grids: Record<string, DaySlotGrid[]> = {};
  const blackouts: Record<string, BlackoutEntry[]> = {};
  for (const campus of campuses) {
    const campusBookings = bookings.filter((b) => b.campus === campus);
    const bo = await getConsultationBlackouts(campus);
    blackouts[campus] = bo;
    grids[campus] = buildDaySlotGrid(campus, today, campusBookings, bo);
  }

  return NextResponse.json({ success: true, bookings, grids, blackouts, today });
}

// POST: 관리자가 학생 대신 정규 슬롯 예약. 순차오픈은 무시하되 슬롯 중복은 금지.
export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  let body: { studentId?: unknown; date?: unknown; slot?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const studentId = typeof body?.studentId === 'string' ? body.studentId : '';
  const date = String(body?.date ?? '').trim();
  const slot = String(body?.slot ?? '').trim();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '학생을 선택해 주세요.' }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ success: false, message: '날짜 형식이 올바르지 않습니다.' }, { status: 400 });
  }
  if (!/^\d{2}:\d{2}$/.test(slot)) {
    return NextResponse.json({ success: false, message: '슬롯 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  if (!(await canAdminAccessStudent(studentId))) {
    return NextResponse.json({ success: false, message: '해당 학생에 접근할 권한이 없습니다.' }, { status: 403 });
  }

  const student = await getStudentById(studentId);
  if (!student) {
    return NextResponse.json({ success: false, message: '학생을 찾을 수 없습니다.' }, { status: 404 });
  }
  if (!isConsultationCampus(student.campus)) {
    return NextResponse.json({ success: false, message: '상담 운영 센터가 아닙니다.' }, { status: 400 });
  }

  const weekday = getWeekdayKey(date);
  if (!weekday) {
    return NextResponse.json({ success: false, message: '운영 요일이 아닙니다.' }, { status: 400 });
  }
  const counselor =
    CAMPUS_CONSULTATION[student.campus].days.find((d) => d.weekday === weekday)?.counselor ?? '';

  // 그날 실제 운영 슬롯(부원장 출장일 마감캡 포함)을 벗어난 시각은 거부 — 유령 예약 방지.
  if (!slotsForDay(student.campus, weekday).includes(slot)) {
    return NextResponse.json({ success: false, message: '해당 날짜에는 운영하지 않는 시간대예요. (담당자 출장일은 일찍 마감)' }, { status: 400 });
  }

  // 차단(휴무/출장)된 날짜·슬롯은 관리자 직접 배정도 거부.
  const postBlackouts = await getConsultationBlackouts(student.campus);
  if (!availableSlotsForDate(student.campus, weekday, date, postBlackouts).includes(slot)) {
    return NextResponse.json({ success: false, message: '담당자 휴무/출장으로 막힌 시간대예요.' }, { status: 400 });
  }

  const booking: ConsultationBooking = {
    id: `cbk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    studentId,
    studentName: student.name,
    campus: student.campus,
    date,
    weekday,
    slot,
    counselor,
    kind: 'regular',
    status: 'booked',
    source: 'admin',
    createdAt: new Date().toISOString(),
  };

  // forceAssign 없이 호출 → 슬롯 점유는 여전히 막힌다(이미 차 있으면 'taken').
  const result = await addConsultationBooking(booking);
  if (result === 'taken') {
    return NextResponse.json({ success: false, message: '이미 예약된 슬롯입니다.' }, { status: 409 });
  }

  return NextResponse.json({ success: true, booking: result });
}

// PATCH: 예약 수정(완료/취소/회신/슬롯·날짜 배정). 센터 접근권 확인.
export async function PATCH(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  let body: {
    campus?: unknown;
    id?: unknown;
    status?: unknown;
    adminReply?: unknown;
    slot?: unknown;
    date?: unknown;
    counselor?: unknown;
    logId?: unknown;
    action?: unknown;
    reason?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const campus = String(body?.campus ?? '').trim();
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!campus || !id) {
    return NextResponse.json({ success: false, message: '처리 대상이 올바르지 않습니다.' }, { status: 400 });
  }

  // 센터 관리자는 자기 센터만, 마스터는 전부.
  if (session.campus !== 'all' && session.campus !== campus) {
    return NextResponse.json({ success: false, message: '해당 센터에 접근할 권한이 없습니다.' }, { status: 403 });
  }

  // ── 시간 변경 흐름(reschedule). action 이 있으면 일반 필드 패치 대신 이 경로로 처리.
  //  - request : 관리자가 새 시간 제안 → 학생 승인 대기 (reschedule.by='admin')
  //  - cancel  : 관리자가 본인 제안 철회
  //  - approve : 학생 제안(reschedule.by='student')을 관리자가 수락 → 예약 시간 적용
  //  - reject  : 학생 제안을 관리자가 거절 → 제안 폐기
  const action = typeof body?.action === 'string' ? body.action : '';
  if (action) {
    if (!isConsultationCampus(campus)) {
      return NextResponse.json({ success: false, message: '상담 운영 센터가 아닙니다.' }, { status: 400 });
    }
    const list = await getConsultationBookingsForCampuses([campus]);
    const target = list.find((b) => b.id === id);
    if (!target) {
      return NextResponse.json({ success: false, message: '예약을 찾을 수 없습니다.' }, { status: 404 });
    }
    if (target.status !== 'booked' || target.kind !== 'regular') {
      return NextResponse.json({ success: false, message: '진행 중인 정규 예약만 변경할 수 있습니다.' }, { status: 409 });
    }

    if (action === 'request') {
      const date = String(body?.date ?? '').trim();
      const slot = String(body?.slot ?? '').trim();
      const reason = String(body?.reason ?? '').trim().slice(0, 300);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(slot)) {
        return NextResponse.json({ success: false, message: '변경할 날짜·시간을 올바르게 선택해 주세요.' }, { status: 400 });
      }
      if (date === target.date && slot === target.slot) {
        return NextResponse.json({ success: false, message: '현재 예약과 같은 시간이에요.' }, { status: 400 });
      }
      // 과거 날짜·시각 제안 금지 — 학생이 승인할 수 없는 데드 제안 방지.
      const today = kstToday();
      if (date < today || (date === today && slot <= kstNowHHMM())) {
        return NextResponse.json({ success: false, message: '이미 지난 시간은 제안할 수 없어요.' }, { status: 400 });
      }
      const weekday = getWeekdayKey(date);
      const bo = await getConsultationBlackouts(campus);
      if (!weekday || !availableSlotsForDate(campus, weekday, date, bo).includes(slot)) {
        return NextResponse.json({ success: false, message: '해당 날짜에는 운영하지 않거나 담당자 휴무로 막힌 시간대예요.' }, { status: 400 });
      }
      if (!isSlotFree(date, slot, list.filter((b) => b.id !== id))) {
        return NextResponse.json({ success: false, message: '이미 예약된 슬롯입니다.' }, { status: 409 });
      }
      const updated = await patchConsultationBooking(campus, id, {
        reschedule: {
          by: 'admin',
          date,
          slot,
          weekday,
          counselor: counselorFor(campus, weekday) ?? '',
          ...(reason ? { reason } : {}),
          requestedAt: new Date().toISOString(),
          requestedBy: session.username,
        },
      });
      if (!updated || updated === 'taken') {
        return NextResponse.json({ success: false, message: '변경 제안에 실패했습니다.' }, { status: 409 });
      }
      return NextResponse.json({ success: true, booking: updated });
    }

    if (action === 'cancel') {
      if (target.reschedule?.by !== 'admin') {
        return NextResponse.json({ success: false, message: '철회할 변경 제안이 없습니다.' }, { status: 409 });
      }
      const updated = await patchConsultationBooking(campus, id, { reschedule: undefined });
      if (!updated || updated === 'taken') {
        return NextResponse.json({ success: false, message: '처리에 실패했습니다.' }, { status: 409 });
      }
      return NextResponse.json({ success: true, booking: updated });
    }

    if (action === 'reject') {
      if (target.reschedule?.by !== 'student') {
        return NextResponse.json({ success: false, message: '응답할 변경 요청이 없습니다.' }, { status: 409 });
      }
      const updated = await patchConsultationBooking(campus, id, { reschedule: undefined });
      if (!updated || updated === 'taken') {
        return NextResponse.json({ success: false, message: '처리에 실패했습니다.' }, { status: 409 });
      }
      return NextResponse.json({ success: true, booking: updated });
    }

    if (action === 'approve') {
      const rs = target.reschedule;
      if (rs?.by !== 'student') {
        return NextResponse.json({ success: false, message: '응답할 변경 요청이 없습니다.' }, { status: 409 });
      }
      // 승인 시점 재검증: 운영 슬롯·차단·점유를 다시 확인.
      const weekday = getWeekdayKey(rs.date);
      const bo = await getConsultationBlackouts(campus);
      if (!weekday || !availableSlotsForDate(campus, weekday, rs.date, bo).includes(rs.slot)) {
        return NextResponse.json({ success: false, message: '요청된 시간이 운영/휴무 변경으로 불가합니다. 거절 후 다시 협의해 주세요.' }, { status: 409 });
      }
      const updated = await patchConsultationBooking(campus, id, {
        date: rs.date,
        slot: rs.slot,
        weekday,
        counselor: counselorFor(campus, weekday) ?? rs.counselor ?? '',
        reschedule: undefined,
      });
      if (updated === 'taken') {
        return NextResponse.json({ success: false, message: '이미 예약된 슬롯입니다. 거절 후 다시 협의해 주세요.' }, { status: 409 });
      }
      if (!updated) {
        return NextResponse.json({ success: false, message: '예약을 찾을 수 없습니다.' }, { status: 404 });
      }
      return NextResponse.json({ success: true, booking: updated });
    }

    return NextResponse.json({ success: false, message: '알 수 없는 요청입니다.' }, { status: 400 });
  }

  const patch: Partial<ConsultationBooking> = {};

  const status =
    body?.status === 'booked' ? 'booked' :
    body?.status === 'cancelled' ? 'cancelled' :
    body?.status === 'done' ? 'done' :
    body?.status === 'noshow' ? 'noshow' : null;
  if (status) {
    patch.status = status;
    const nowIso = new Date().toISOString();
    if (status === 'done' || status === 'noshow') {
      patch.resolvedAt = nowIso;
      patch.resolvedBy = session.username;
    }
    if (status === 'cancelled') patch.cancelledAt = nowIso;
  }

  if (typeof body?.adminReply === 'string') {
    patch.adminReply = body.adminReply.trim().slice(0, 500) || undefined;
  }
  if (typeof body?.slot === 'string') {
    const slot = body.slot.trim();
    if (slot && !/^\d{2}:\d{2}$/.test(slot)) {
      return NextResponse.json({ success: false, message: '슬롯 형식이 올바르지 않습니다.' }, { status: 400 });
    }
    patch.slot = slot;
  }
  if (typeof body?.date === 'string') {
    const date = body.date.trim();
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ success: false, message: '날짜 형식이 올바르지 않습니다.' }, { status: 400 });
    }
    patch.date = date;
    const weekday = getWeekdayKey(date);
    if (weekday) patch.weekday = weekday;
  }
  if (typeof body?.counselor === 'string') {
    patch.counselor = body.counselor.trim();
  }

  if (typeof body?.logId === 'string' && status === 'done') {
    patch.logId = body.logId.slice(0, 64);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ success: false, message: '변경할 내용이 없습니다.' }, { status: 400 });
  }

  // 날짜·슬롯을 바꾸는 경우, 바뀐 (날짜→요일)의 실제 운영 슬롯을 벗어나지 않는지 검증.
  // (부원장 출장일은 15:30 마감 → 그 뒤 시각은 거부. 관리자 그리드에 안 보이는 유령 예약 방지.)
  if ((patch.slot !== undefined || patch.date !== undefined) && isConsultationCampus(campus)) {
    const existing = (await getConsultationBookingsForCampuses([campus])).find((b) => b.id === id);
    const finalDate = patch.date !== undefined ? patch.date : existing?.date;
    const finalSlot = patch.slot !== undefined ? patch.slot : existing?.slot;
    if (finalSlot && finalDate) {
      const wd = getWeekdayKey(finalDate);
      const bo = await getConsultationBlackouts(campus);
      if (!wd || !availableSlotsForDate(campus, wd, finalDate, bo).includes(finalSlot)) {
        return NextResponse.json({ success: false, message: '해당 날짜에는 운영하지 않거나 담당자 휴무로 막힌 시간대예요.' }, { status: 400 });
      }
    }
  }

  const updated = await patchConsultationBooking(campus, id, patch);
  if (updated === 'taken') {
    // 같은 날짜·슬롯에 이미 다른 활성 예약이 점유 중(자기 자신 제외) — 더블부킹 거부.
    return NextResponse.json({ success: false, message: '이미 예약된 슬롯입니다.' }, { status: 409 });
  }
  if (!updated) {
    return NextResponse.json({ success: false, message: '예약을 찾을 수 없습니다.' }, { status: 404 });
  }

  return NextResponse.json({ success: true, booking: updated });
}

// PUT: 센터 차단(휴무/출장) 목록 통째로 교체. 센터 접근권 확인.
export async function PUT(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  let body: { campus?: unknown; blackouts?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const campus = String(body?.campus ?? '').trim();
  if (!isConsultationCampus(campus)) {
    return NextResponse.json({ success: false, message: '상담 운영 센터가 아닙니다.' }, { status: 400 });
  }
  if (session.campus !== 'all' && session.campus !== campus) {
    return NextResponse.json({ success: false, message: '해당 센터에 접근할 권한이 없습니다.' }, { status: 403 });
  }

  const raw = Array.isArray(body?.blackouts) ? body.blackouts : null;
  if (!raw) {
    return NextResponse.json({ success: false, message: '차단 목록이 올바르지 않습니다.' }, { status: 400 });
  }

  // 정규화·검증: date 형식, scope 형식.
  const entries: BlackoutEntry[] = [];
  for (const item of raw) {
    const date = String((item as any)?.date ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ success: false, message: '날짜 형식이 올바르지 않습니다.' }, { status: 400 });
    }
    const scopeRaw = (item as any)?.scope;
    let scope: 'fullday' | string[];
    if (scopeRaw === 'fullday') {
      scope = 'fullday';
    } else if (Array.isArray(scopeRaw) && scopeRaw.every((s) => /^\d{2}:\d{2}$/.test(String(s)))) {
      scope = scopeRaw.map((s) => String(s));
    } else {
      return NextResponse.json({ success: false, message: '차단 범위가 올바르지 않습니다.' }, { status: 400 });
    }
    const reason = typeof (item as any)?.reason === 'string' ? (item as any).reason.trim().slice(0, 200) : undefined;
    entries.push({ date, scope, ...(reason ? { reason } : {}) });
  }

  // 차단되는 날짜·슬롯에 매달린 기존 booked 예약을 먼저 자동 취소(cancelled 전이)한다.
  // 조용히 무시하면 그리드에 안 보이는 유령 예약이 남아 완료/노쇼 처리가 누락된다.
  // 취소 → 차단 저장 순서: 차단 저장 후 실패해도 유령 예약은 남지 않는다.
  const cancelled = await cancelBookingsConflictingWithBlackouts(campus, entries);
  await setConsultationBlackouts(campus, entries);
  return NextResponse.json({
    success: true,
    blackouts: entries,
    cancelled: cancelled.map((b) => ({
      id: b.id,
      studentName: b.studentName,
      date: b.date,
      slot: b.slot,
    })),
    cancelledCount: cancelled.length,
  });
}
