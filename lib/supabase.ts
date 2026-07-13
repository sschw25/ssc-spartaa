import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Student, SharedMaterial, BookProgress, LectureProgress, MockExam, OtEvent, MealPlan, AdminAccount, CampusEvent } from './types/student';
import { mergeOrphanMaterials } from './db';
import { normalizeArrival } from './attendance-time';

type SmsTarget = 'parent' | 'student';

function normalizeSmsTargets(value: unknown): SmsTarget[] {
  if (!Array.isArray(value)) return ['parent'];
  return value.filter((target): target is SmsTarget => target === 'parent' || target === 'student');
}

// ── 환경 변수 ────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

let cachedClient: SupabaseClient | null = null;
function getClient(): SupabaseClient {
  if (cachedClient) return cachedClient;
  cachedClient = createClient(SUPABASE_URL as string, SUPABASE_SERVICE_ROLE_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

// ── 매핑 헬퍼 ────────────────────────────────────────────────
// subjects 를 단일 진실 소스로 두고, 하위 호환을 위해 최상위 books/lectures 를 파생 생성한다.
function flattenSubjects(subjects: any[]): { books: BookProgress[]; lectures: LectureProgress[] } {
  const books: BookProgress[] = [];
  const lectures: LectureProgress[] = [];
  (subjects || []).forEach((s) => {
    (s.books || []).forEach((b: BookProgress) => books.push(b));
    (s.lectures || []).forEach((l: LectureProgress) => lectures.push(l));
  });
  return { books, lectures };
}

function readDdaysFromRow(r: any) {
  if (Array.isArray(r.ddays)) return r.ddays;
  if (Array.isArray(r.student_state?.ddays)) return r.student_state.ddays;
  return [];
}

function rowToStudent(r: any): Student {
  const subjects = (r.subjects || []) as any[];
  const { books, lectures } = flattenSubjects(subjects);
  return {
    id: r.id,
    name: r.name,
    loginId: r.login_id || undefined,
    campus: r.campus,
    manager: r.manager || '',
    contact: r.contact || '',
    lifeComment: r.life_comment || '',
    studentLifeComment: r.student_life_comment || '',
    specialNote: r.special_note || '',
    nextConsultationDate: r.next_consultation_date || undefined,
    parentPhone: r.parent_phone || undefined,
    studentPhone: r.student_phone || undefined,
    smsTargets: normalizeSmsTargets(r.sms_targets),
    expectedArrival: normalizeArrival(r.expected_arrival),
    enrollStartDate: r.student_state?.enrollStartDate || undefined,
    enrollmentEndDate: r.enrollment_end_date || undefined,
    weeklyGradeCheck: Boolean(r.weekly_grade_check),
    seatNumber: r.seat_number != null ? Number(r.seat_number) : undefined,
    shareToken: r.share_token || undefined,
    shareTokenExpiresAt: r.share_token_expires_at || undefined,
    sharePasswordHash: r.share_password || undefined,
    createdAt: r.created_at || '',
    updatedAt: r.updated_at || '',
    books,
    lectures,
    consultationLogs: r.consultation_logs || [],
    grades: r.grades || [],
    leaveRequests: r.leave_requests || [],
    leaveCoupons: Number(r.leave_coupons) || 0,
    rewardRedemptions: r.reward_redemptions || [],
    penalties: r.penalties || [],
    smsLogs: r.sms_logs || [],
    mockExams: r.mock_exams || [],
    otEvents: r.ot_events || [],
    eventParticipations: r.event_participations || [],
    studentState: r.student_state || {},
    // 보강 이월·외출 계획조정 통지는 별도 컬럼 없이 student_state(jsonb)에 보관 — 마이그레이션 불필요.
    makeupCarryovers: r.student_state?.makeupCarryovers || [],
    awayReplanNotices: r.student_state?.awayReplanNotices || [],
    makeupNotices: r.student_state?.makeupNotices || [],
    saturdayLateExcuses: r.saturday_late_excuses || [],
    phoneSubmissions: r.phone_submissions || [],
    awaySchedules: (r.away_schedules || []).map((item: unknown) => {
      if (typeof item === 'string') {
        // 레거시 문자열 형식 → 객체로 변환
        const [awayTime, returnTime] = item.includes('~')
          ? item.split('~').map((s: string) => s.trim())
          : [item.trim(), undefined];
        return { awayTime, returnTime, days: [], until: 'forever' };
      }
      return item;
    }),
    ddays: readDdaysFromRow(r),
    mealOrders: r.meal_orders || [],
    seatAlerts: r.seat_alerts || [],
    subjects,
  };
}

function studentToRow(student: Student, nowIso: string) {
  // 최상위 books/lectures 중 과목에 없는 고아 항목을 흡수하여 subjects 를 완전한 단일 소스로 만든다.
  const subjects = mergeOrphanMaterials(
    student.subjects || [],
    student.books || [],
    student.lectures || [],
    nowIso
  );
  const ddays = Array.isArray(student.ddays)
    ? student.ddays
    : Array.isArray(student.studentState?.ddays)
    ? student.studentState.ddays
    : [];
  return {
    id: student.id,
    name: student.name,
    login_id: student.loginId || null,
    campus: student.campus,
    manager: student.manager || '',
    contact: student.contact || '',
    next_consultation_date: student.nextConsultationDate || null,
    enrollment_end_date: student.enrollmentEndDate || null,
    weekly_grade_check: Boolean(student.weeklyGradeCheck),
    seat_number: student.seatNumber ?? null,
    parent_phone: student.parentPhone || null,
    student_phone: student.studentPhone || null,
    sms_targets: normalizeSmsTargets(student.smsTargets),
    speed_multiplier: 1.0,
    life_comment: student.lifeComment || '',
    special_note: student.specialNote || '',
    student_life_comment: student.studentLifeComment || '',
    subjects,
    consultation_logs: student.consultationLogs || [],
    grades: student.grades || [],
    leave_requests: student.leaveRequests || [],
    leave_coupons: student.leaveCoupons ?? 0,
    reward_redemptions: student.rewardRedemptions || [],
    penalties: student.penalties || [],
    sms_logs: student.smsLogs || [],
    mock_exams: student.mockExams || [],
    ot_events: student.otEvents || [],
    event_participations: student.eventParticipations || [],
    // enrollStartDate(이용 시작일)는 별도 컬럼 없이 student_state(jsonb)에 함께 보관 — 마이그레이션 불필요
    student_state: { ...(student.studentState || {}), enrollStartDate: student.enrollStartDate || null, ddays, makeupCarryovers: student.makeupCarryovers || [], awayReplanNotices: student.awayReplanNotices || [], makeupNotices: student.makeupNotices || [] },
    saturday_late_excuses: student.saturdayLateExcuses || [],
    away_schedules: student.awaySchedules || [],
    phone_submissions: student.phoneSubmissions || [],
    ddays,
    meal_orders: student.mealOrders || [],
    seat_alerts: student.seatAlerts || [],
    // share_token / share_token_expires_at / share_password 는 의도적으로 제외한다.
    // 일반 학생 저장(마스킹된 객체 포함)이 학부모 공유 비밀번호 해시를 null로 덮어쓰던 버그 방지.
    // 공유 컬럼은 share-token 라우트의 patchSupabaseToken 만 전담하며, upsert는 누락 컬럼을 보존한다.
    updated_at: nowIso,
    created_at: student.createdAt || nowIso,
  };
}

function rowToMaterial(r: any): SharedMaterial {
  return {
    id: r.id,
    type: r.type,
    name: r.name,
    subject: r.subject || '',
    publisher: r.publisher || '',
    author: r.author || '',
    totalPagesOrLectures: Number(r.total_pages_or_lectures) || 0,
    unit: r.unit || undefined,
    createdAt: r.created_at || '',
  };
}

// ── 학생 CRUD ────────────────────────────────────────────────
export async function getStudentsSupabase(): Promise<Student[]> {
  const { data, error } = await getClient()
    .from('students')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(rowToStudent);
}

// 무거운 JSONB(subjects, consultation_logs, grades, leave_requests) 제외한 스칼라만 조회.
// 출결·랭킹·인증 등 name/campus/phone만 필요한 라우트용.
const SUMMARY_COLS = [
  'id', 'name', 'login_id', 'campus', 'manager', 'contact',
  'next_consultation_date', 'enrollment_end_date', 'weekly_grade_check',
  'parent_phone', 'student_phone', 'sms_targets',
  'life_comment', 'special_note', 'student_life_comment',
  'leave_coupons', 'share_token', 'share_token_expires_at',
  'expected_arrival', 'seat_number', 'saturday_late_excuses', 'away_schedules', 'student_state', 'ddays', 'created_at', 'updated_at',
].join(', ');

export async function getStudentsSummarySupabase(): Promise<Student[]> {
  const { data, error } = await getClient()
    .from('students')
    .select(SUMMARY_COLS)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(rowToStudent);
}

export async function getStudentByIdSupabase(id: string): Promise<Student | null> {
  const { data, error } = await getClient()
    .from('students')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToStudent(data) : null;
}

export async function saveStudentSupabase(student: Student): Promise<Student> {
  const nowIso = new Date().toISOString();
  const row = studentToRow(student, nowIso);
  // upsert: row에 password_hash가 없으므로 INSERT/UPDATE 모두 해당 컬럼을 건드리지 않음.
  const { data, error } = await getClient()
    .from('students')
    .upsert(row, { onConflict: 'id' })
    .select()
    .single();
  if (error) {
    // Supabase 에러 객체는 Error 인스턴스가 아니라 로그에 `{}` 로만 찍힌다.
    // 누락 컬럼(미실행 마이그레이션) 등을 진단할 수 있도록 메시지를 풀어서 던진다.
    console.error('[saveStudentSupabase] students upsert 실패:', error.message, error.details || '', error.hint || '', error.code || '');
    throw new Error(`학생 저장 실패(students upsert): ${error.message}${error.details ? ` — ${error.details}` : ''}${error.hint ? ` [${error.hint}]` : ''}`);
  }
  return rowToStudent(data);
}

export async function createStudentWithPasswordHashSupabase(student: Student, passwordHash: string): Promise<Student> {
  const nowIso = new Date().toISOString();
  const row = { ...studentToRow(student, nowIso), password_hash: passwordHash };
  const { data, error } = await getClient()
    .from('students')
    .insert(row)
    .select()
    .single();
  if (error) {
    console.error('[createStudentWithPasswordHashSupabase] students insert 실패:', error.message, error.details || '', error.hint || '', error.code || '');
    throw new Error(`학생 생성 실패(students insert): ${error.message}${error.details ? ` — ${error.details}` : ''}${error.hint ? ` [${error.hint}]` : ''}`);
  }
  return rowToStudent(data);
}

export async function deleteStudentSupabase(id: string): Promise<boolean> {
  const { error } = await getClient().from('students').delete().eq('id', id);
  if (error) throw error;
  return true;
}

// 진도 PATCH 전용 optimistic locking 저장.
// updated_at 이 originalUpdatedAt 과 일치할 때만 업데이트하여 동시 쓰기 충돌을 감지한다.
// 반환값: 저장된 Student | 'conflict' (다른 요청이 먼저 썼을 때)
export async function patchStudentProgressSupabase(
  student: Student,
  originalUpdatedAt: string,
): Promise<Student | 'conflict'> {
  const nowIso = new Date().toISOString();
  const row = studentToRow(student, nowIso);
  const { data, error } = await getClient()
    .from('students')
    .update(row)
    .eq('id', student.id)
    .eq('updated_at', originalUpdatedAt)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) return 'conflict';
  return rowToStudent(data);
}

// 필드 단위 저장 — 진도(subjects) 컬럼만 타깃 업데이트.
// 전체 행 upsert 가 아니라 subjects 컬럼만 쓰므로 leave_coupons/penalties 등 다른 컬럼과
// 동시에 저장돼도 충돌하지 않는다(상담 자동저장 ↔ 쿠폰/벌점 적립이 서로를 덮어쓰지 않음).
export async function patchStudentSubjectsSupabase(student: Student): Promise<Student> {
  const nowIso = new Date().toISOString();
  // subjects 가 단일 진실 소스 — 최상위 고아 books/lectures 를 흡수해 일관성 유지.
  const subjects = mergeOrphanMaterials(
    student.subjects || [],
    student.books || [],
    student.lectures || [],
    nowIso,
  );
  const { data, error } = await getClient()
    .from('students')
    .update({ subjects, updated_at: nowIso })
    .eq('id', student.id)
    .select()
    .single();
  if (error) {
    console.error('[patchStudentSubjectsSupabase] 진도 저장 실패:', error.message, error.details || '', error.hint || '', error.code || '');
    throw new Error(`진도 저장 실패: ${error.message}${error.details ? ` — ${error.details}` : ''}`);
  }
  return rowToStudent(data);
}

// 필드 단위 저장 — 프로필(담당/연락처/좌석) 컬럼만 타깃 업데이트.
export async function patchStudentProfileSupabase(student: Student): Promise<Student> {
  const nowIso = new Date().toISOString();
  const { data, error } = await getClient()
    .from('students')
    .update({
      manager: student.manager || '',
      contact: student.contact || '',
      student_phone: student.studentPhone || null,
      parent_phone: student.parentPhone || null,
      seat_number: student.seatNumber ?? null,
      updated_at: nowIso,
    })
    .eq('id', student.id)
    .select()
    .single();
  if (error) {
    console.error('[patchStudentProfileSupabase] 프로필 저장 실패:', error.message, error.details || '', error.hint || '', error.code || '');
    throw new Error(`프로필 저장 실패: ${error.message}${error.details ? ` — ${error.details}` : ''}`);
  }
  return rowToStudent(data);
}

// ── 공유 교재/강의 ───────────────────────────────────────────
export async function readSharedMaterialsSupabase(): Promise<SharedMaterial[]> {
  const { data, error } = await getClient().from('shared_materials').select('*');
  if (error) throw error;
  return (data || []).map(rowToMaterial);
}

// ── 학생 인증 (비밀번호 해시 — 서버 전용, 클라이언트로 노출하지 않음) ──
export interface StudentAuthRecord {
  id: string;
  name: string;
  login_id: string | null;
  contact: string | null;
  password_hash: string | null;
}

export async function getStudentAuthRecordsSupabase(): Promise<StudentAuthRecord[]> {
  const { data, error } = await getClient()
    .from('students')
    .select('id, name, login_id, contact, password_hash');
  if (error) throw error;
  return (data || []) as StudentAuthRecord[];
}

export async function setStudentPasswordHashSupabase(studentId: string, hash: string): Promise<void> {
  const { error } = await getClient().from('students').update({ password_hash: hash }).eq('id', studentId);
  if (error) throw error;
}

export async function applyStudentPasswordChangeSupabase(
  studentId: string,
  hash: string,
  studentState: Record<string, unknown>,
  originalUpdatedAt: string,
): Promise<Student | 'conflict'> {
  const nowIso = new Date().toISOString();
  const { data, error } = await getClient()
    .from('students')
    .update({ password_hash: hash, student_state: studentState, updated_at: nowIso })
    .eq('id', studentId)
    .eq('updated_at', originalUpdatedAt)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) return 'conflict';
  return rowToStudent(data);
}

export interface NotifyInfo {
  parentPhone?: string;
  studentPhone?: string;
  smsTargets?: Array<'parent' | 'student'>;
}
export async function setStudentNotifyInfoSupabase(studentId: string, info: NotifyInfo): Promise<void> {
  const { error } = await getClient()
    .from('students')
    .update({
      parent_phone: info.parentPhone || null,
      student_phone: info.studentPhone || null,
      sms_targets: normalizeSmsTargets(info.smsTargets),
      // 이 컬럼들은 studentToRow(전체 행 저장)에도 포함되므로, updated_at을 함께 올려
      // stale 스냅샷을 든 전체 저장이 낙관적 락 충돌로 감지되게 한다(옛값 롤백 방지).
      updated_at: new Date().toISOString(),
    })
    .eq('id', studentId);
  if (error) throw error;
}

// 지각 기준(등원 마감) 단일 컬럼 타깃 업데이트 — HH:MM 커스텀 시각 지원
export async function setStudentExpectedArrivalSupabase(studentId: string, value: string): Promise<void> {
  const { error } = await getClient()
    .from('students')
    .update({ expected_arrival: normalizeArrival(value) })
    .eq('id', studentId);
  if (error) throw error;
}

// ── 등하원/순공 세션 ──
export interface StudySession {
  id: string;
  student_id: string;
  date: string;
  check_in: string;
  check_out: string | null;
  minutes: number | null;
  source: string;
}

function seoulDate(d: Date): string {
  // KST 기준 YYYY-MM-DD
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(d);
}

export async function getOpenSessionSupabase(studentId: string): Promise<StudySession | null> {
  // 이중 체크인 레이스로 open 세션이 2건 이상 남아도 최신 1건을 반환한다.
  // (.maybeSingle()은 다중 행이면 에러 → 그 학생의 등하원 전부 500이 되는 사고 방지.
  //  근본 차단은 migration-open-session-unique.sql 의 부분 유니크 인덱스.)
  const { data, error } = await getClient()
    .from('study_sessions')
    .select('*')
    .eq('student_id', studentId)
    .is('check_out', null)
    .order('check_in', { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data && data.length > 0 ? (data[0] as StudySession) : null);
}

export async function checkInSupabase(studentId: string, source = 'qr', now = new Date()): Promise<StudySession> {
  const row = {
    id: `att_${now.getTime()}_${Math.random().toString(36).slice(2, 7)}`,
    student_id: studentId,
    date: seoulDate(now),
    check_in: now.toISOString(),
    check_out: null,
    minutes: null,
    source,
  };
  const { data, error } = await getClient().from('study_sessions').insert(row).select().single();
  if (error) {
    // 부분 유니크 인덱스(open 세션 학생당 1건) 충돌 = 동시 이중 체크인의 패자 —
    // 이미 열린 세션을 반환해 멱등 체크인으로 처리한다.
    if ((error as { code?: string }).code === '23505') {
      const existing = await getOpenSessionSupabase(studentId);
      if (existing) return existing;
    }
    throw error;
  }
  return data as StudySession;
}

export async function checkOutSupabase(session: StudySession, now = new Date()): Promise<StudySession> {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(session.check_in).getTime()) / 60000));
  const { data, error } = await getClient()
    .from('study_sessions')
    .update({ check_out: now.toISOString(), minutes })
    .eq('id', session.id)
    .select()
    .single();
  if (error) throw error;
  return data as StudySession;
}

export async function autoCloseSessionSupabase(session: StudySession, now = new Date()): Promise<StudySession> {
  const { data, error } = await getClient()
    .from('study_sessions')
    .update({ check_out: now.toISOString(), minutes: null, source: 'auto-sweep' })
    .eq('id', session.id)
    .select()
    .single();
  if (error) throw error;
  return data as StudySession;
}

export async function getStudySessionsSupabase(studentId: string, sinceDate?: string): Promise<StudySession[]> {
  let q = getClient()
    .from('study_sessions')
    .select('*')
    .eq('student_id', studentId)
    .order('check_in', { ascending: false });
  if (sinceDate) q = q.gte('date', sinceDate);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as StudySession[];
}

// 기간 내 전체 학생의 (학생별·날짜별) 순공 합계 — 등수 계산용 (서버 전용 집계).
// 날짜별로 쪼개 반환하는 이유: 좌석판 수기 출석(present) 파생을 '세션분이 없는 날'에만
// 얹어야 해서(store.getStudyMinutesByStudent), 날짜 단위 판별이 필요하다.
export async function getStudyMinutesByStudentDateSupabase(
  sinceDate: string,
  untilDate?: string,
): Promise<Record<string, Record<string, number>>> {
  let query = getClient()
    .from('study_sessions')
    .select('student_id, date, minutes')
    .gte('date', sinceDate);
  if (untilDate) query = query.lte('date', untilDate);
  const { data, error } = await query;
  if (error) throw error;
  const totals: Record<string, Record<string, number>> = {};
  (data || []).forEach((r: any) => {
    if (!r.minutes) return;
    const byDate = (totals[r.student_id] ||= {});
    byDate[r.date] = (byDate[r.date] || 0) + r.minutes;
  });
  return totals;
}

// 현재 등원 중(미퇴실)인 전체 세션 — 관리자 실시간 출결 현황용
export async function getOpenSessionsSupabase(): Promise<StudySession[]> {
  const { data, error } = await getClient()
    .from('study_sessions')
    .select('*')
    .is('check_out', null)
    .order('check_in', { ascending: true });
  if (error) throw error;
  return (data || []) as StudySession[];
}

// 특정 날짜(KST, YYYY-MM-DD)의 전체 학생 세션 — '오늘 출결' 명단용
export async function getSessionsByDateSupabase(date: string): Promise<StudySession[]> {
  const { data, error } = await getClient()
    .from('study_sessions')
    .select('*')
    .eq('date', date)
    .order('check_in', { ascending: true });
  if (error) throw error;
  return (data || []) as StudySession[];
}

// 특정 학생의 특정 날짜 세션 전체 삭제 (수동 출결 입력 시 해당 일자 초기화/결석 처리)
export async function deleteSessionsByStudentDateSupabase(studentId: string, date: string): Promise<void> {
  const { error } = await getClient()
    .from('study_sessions')
    .delete()
    .eq('student_id', studentId)
    .eq('date', date);
  if (error) throw error;
}

// 수동 출결 세션 1건 생성 (관리자 직접 입력)
export async function insertManualSessionSupabase(
  studentId: string, date: string, checkInIso: string, checkOutIso: string | null
): Promise<StudySession> {
  const minutes = checkOutIso
    ? Math.max(0, Math.round((new Date(checkOutIso).getTime() - new Date(checkInIso).getTime()) / 60000))
    : null;
  const row = {
    id: `att_m_${new Date(checkInIso).getTime()}_${Math.random().toString(36).slice(2, 7)}`,
    student_id: studentId, date,
    check_in: checkInIso, check_out: checkOutIso, minutes, source: 'manual',
  };
  const { data, error } = await getClient().from('study_sessions').insert(row).select().single();
  if (error) throw error;
  return data as StudySession;
}

// 날짜 구간([start, end], KST)의 전체 학생 세션 — 주간 지각 누적 등 기간 집계용
export async function getSessionsInRangeSupabase(start: string, end: string): Promise<StudySession[]> {
  const { data, error } = await getClient()
    .from('study_sessions')
    .select('*')
    .gte('date', start)
    .lte('date', end)
    .order('check_in', { ascending: true });
  if (error) throw error;
  return (data || []) as StudySession[];
}

// ── 모의고사 일정 마스터 ──────────────────────────────────────
function rowToMockExam(r: any): MockExam {
  return {
    id: r.id,
    name: r.name,
    date: r.date,
    targetExamTypes: Array.isArray(r.target_exam_types) ? r.target_exam_types : [],
    recipientStudentIds: Array.isArray(r.recipient_student_ids) && r.recipient_student_ids.length ? r.recipient_student_ids : undefined,
    campus: r.campus || undefined,
    createdAt: r.created_at || '',
    notifiedAt: r.notified_at || undefined,
  };
}

export async function getMockExamsSupabase(): Promise<MockExam[]> {
  const { data, error } = await getClient()
    .from('mock_exams')
    .select('*')
    .order('date', { ascending: false });
  if (error) throw error;
  return (data || []).map(rowToMockExam);
}

export async function saveMockExamSupabase(exam: MockExam): Promise<MockExam> {
  const row = {
    id: exam.id,
    name: exam.name,
    date: exam.date,
    target_exam_types: exam.targetExamTypes || [],
    recipient_student_ids: exam.recipientStudentIds && exam.recipientStudentIds.length ? exam.recipientStudentIds : [],
    campus: exam.campus || null,
    created_at: exam.createdAt,
    notified_at: exam.notifiedAt || null,
  };
  const { data, error } = await getClient()
    .from('mock_exams')
    .upsert(row, { onConflict: 'id' })
    .select()
    .single();
  if (error) {
    console.error('[saveMockExamSupabase] mock_exams upsert 실패:', error.message, error.details || '', error.hint || '', error.code || '');
    throw new Error(`모의고사 저장 실패: ${error.message}`);
  }
  return rowToMockExam(data);
}

export async function deleteMockExamSupabase(id: string): Promise<void> {
  const { error } = await getClient().from('mock_exams').delete().eq('id', id);
  if (error) throw error;
}

// 모의고사 학생 알림 발송 표시 (notified_at 설정). recipientStudentIds 전달 시 명시 수신자도 갱신.
export async function notifyMockExamSupabase(
  id: string,
  notifiedAt: string | null,
  recipientStudentIds?: string[],
): Promise<MockExam> {
  const patch: Record<string, unknown> = { notified_at: notifiedAt };
  if (recipientStudentIds !== undefined) patch.recipient_student_ids = recipientStudentIds;
  const { data, error } = await getClient()
    .from('mock_exams')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return rowToMockExam(data);
}

// ── OT 일정 마스터 (ot_events 테이블) ─────────────────────────
function rowToOtEvent(r: any): OtEvent {
  return {
    id: r.id,
    name: r.name,
    date: r.date,
    message: r.message || undefined,
    targetExamTypes: r.target_exam_types || [],
    recipientStudentIds: Array.isArray(r.recipient_student_ids) && r.recipient_student_ids.length ? r.recipient_student_ids : undefined,
    campus: r.campus || undefined,
    createdAt: r.created_at || '',
    notifiedAt: r.notified_at || undefined,
  };
}

export async function getOtEventsSupabase(): Promise<OtEvent[]> {
  const { data, error } = await getClient()
    .from('ot_events')
    .select('*')
    .order('date', { ascending: false });
  if (error) throw error;
  return (data || []).map(rowToOtEvent);
}

export async function saveOtEventSupabase(event: OtEvent): Promise<OtEvent> {
  const row = {
    id: event.id,
    name: event.name,
    date: event.date,
    message: event.message || null,
    target_exam_types: event.targetExamTypes || [],
    recipient_student_ids: event.recipientStudentIds && event.recipientStudentIds.length ? event.recipientStudentIds : [],
    campus: event.campus || null,
    created_at: event.createdAt,
    notified_at: event.notifiedAt || null,
  };
  const { data, error } = await getClient()
    .from('ot_events')
    .upsert(row, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  return rowToOtEvent(data);
}

export async function deleteOtEventSupabase(id: string): Promise<void> {
  const { error } = await getClient().from('ot_events').delete().eq('id', id);
  if (error) throw error;
}

export async function notifyOtEventSupabase(
  id: string,
  notifiedAt: string | null,
  recipientStudentIds?: string[],
): Promise<OtEvent> {
  const patch: Record<string, unknown> = { notified_at: notifiedAt };
  if (recipientStudentIds !== undefined) patch.recipient_student_ids = recipientStudentIds;
  const { data, error } = await getClient()
    .from('ot_events')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return rowToOtEvent(data);
}

// ── 학원 캘린더 일정 & 참여 미션 마스터 (campus_events 테이블) ────
function rowToCampusEvent(r: any): CampusEvent {
  return {
    id: r.id,
    title: r.title,
    date: r.date,
    endDate: r.end_date || undefined,
    startTime: r.start_time || undefined,
    endTime: r.end_time || undefined,
    campus: r.campus || undefined,
    category: (r.category === 'mission' ? 'mission' : (r.category === 'notice' ? 'notice' : 'general')),
    memo: r.memo || undefined,
    color: r.color || undefined,
    imageUrl: r.image_url || undefined,
    imagePath: r.image_path || undefined,
    responseMode: (r.response_mode === 'attendance' ? 'attendance' : (r.response_mode === 'postTask' ? 'postTask' : 'none')),
    postTaskLabel: r.post_task_label || undefined,
    postTaskDueDate: r.post_task_due_date || undefined,
    postTaskHref: r.post_task_href || undefined,
    isMission: Boolean(r.is_mission),
    couponReward: r.coupon_reward != null ? Number(r.coupon_reward) : undefined,
    targetMode: (r.target_mode === 'students' ? 'students' : (r.target_mode === 'campus' ? 'campus' : undefined)),
    targetStudentIds: Array.isArray(r.target_student_ids) ? r.target_student_ids : [],
    recipientStudentIds: Array.isArray(r.recipient_student_ids) && r.recipient_student_ids.length ? r.recipient_student_ids : undefined,
    notifiedAt: r.notified_at || undefined,
    rewardedAt: r.rewarded_at || undefined,
    createdAt: r.created_at || '',
    createdBy: r.created_by || undefined,
  };
}

export async function getCampusEventsSupabase(): Promise<CampusEvent[]> {
  const { data, error } = await getClient()
    .from('campus_events')
    .select('*')
    .order('date', { ascending: false });
  if (error) throw error;
  return (data || []).map(rowToCampusEvent);
}

export async function saveCampusEventSupabase(event: CampusEvent): Promise<CampusEvent> {
  const row = {
    id: event.id,
    title: event.title,
    date: event.date,
    end_date: event.endDate || null,
    start_time: event.startTime || null,
    end_time: event.endTime || null,
    campus: event.campus || null,
    category: event.category || 'general',
    memo: event.memo || null,
    color: event.color || null,
    image_url: event.imageUrl || null,
    image_path: event.imagePath || null,
    response_mode: event.responseMode || 'none',
    post_task_label: event.postTaskLabel || null,
    post_task_due_date: event.postTaskDueDate || null,
    post_task_href: event.postTaskHref || null,
    is_mission: Boolean(event.isMission),
    coupon_reward: event.couponReward ?? null,
    target_mode: event.targetMode || null,
    target_student_ids: event.targetStudentIds || [],
    // recipient_student_ids 는 저장(생성)에서 제외 — 알림 선택 발송(notify) 경로에서만 기록.
    // 이렇게 하면 마이그레이션 미실행 상태에서도 일정/미션/공지 생성은 정상 동작하고,
    // '대상 골라 발송' 신규 기능만 컬럼(마이그레이션)에 의존한다.
    notified_at: event.notifiedAt || null,
    rewarded_at: event.rewardedAt || null,
    created_at: event.createdAt,
    created_by: event.createdBy || null,
  };
  const { data, error } = await getClient()
    .from('campus_events')
    .upsert(row, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  return rowToCampusEvent(data);
}

export async function deleteCampusEventSupabase(id: string): Promise<void> {
  const { error } = await getClient().from('campus_events').delete().eq('id', id);
  if (error) throw error;
}

// 참여 미션 학생 알림 발송 표시 (notified_at 설정). recipientStudentIds 전달 시 명시 수신자도 갱신.
export async function notifyCampusEventSupabase(
  id: string,
  notifiedAt: string | null,
  recipientStudentIds?: string[],
): Promise<CampusEvent> {
  const patch: Record<string, unknown> = { notified_at: notifiedAt };
  if (recipientStudentIds !== undefined) patch.recipient_student_ids = recipientStudentIds;
  const { data, error } = await getClient()
    .from('campus_events')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return rowToCampusEvent(data);
}

// 쿠폰 일괄 지급 완료 표시 (rewarded_at 설정)
export async function markCampusEventRewardedSupabase(id: string, rewardedAt: string): Promise<CampusEvent> {
  const { data, error } = await getClient()
    .from('campus_events')
    .update({ rewarded_at: rewardedAt })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return rowToCampusEvent(data);
}

// ── 학원 공지 이미지 (Supabase Storage) ────────────────────────
// 공지 사진은 DB가 아니라 객체 저장소에 둔다. 버킷은 공개(읽기)로, 업로드는 서버(서비스키)만.
const ANNOUNCEMENTS_BUCKET = 'announcements';

async function ensureAnnouncementsBucket(): Promise<void> {
  const client = getClient();
  // 이미 있으면 createBucket 이 에러를 주므로 무시(존재 확인 후 생성).
  const { data } = await client.storage.getBucket(ANNOUNCEMENTS_BUCKET);
  if (data) return;
  const { error } = await client.storage.createBucket(ANNOUNCEMENTS_BUCKET, {
    public: true,
    fileSizeLimit: 5 * 1024 * 1024, // 5MB — 압축본만 올라오므로 충분한 상한
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  });
  if (error) {
    // 동시 최초 업로드 경쟁으로 이미 만들어졌을 수 있음 — 재확인 후에도 없으면 실패로 처리.
    const { data: recheck } = await client.storage.getBucket(ANNOUNCEMENTS_BUCKET);
    if (!recheck) throw error;
  }
}

// 공지 이미지 업로드 → { url(공개), path(삭제용 key) }
export async function uploadAnnouncementImageSupabase(
  campus: string, dateKey: string, body: ArrayBuffer, contentType: string, ext: string,
): Promise<{ url: string; path: string }> {
  await ensureAnnouncementsBucket();
  const safeCampus = /^[a-z]+$/.test(campus) ? campus : 'all';
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `${safeCampus}/${dateKey}-${Date.now()}-${rand}.${ext}`;
  const client = getClient();
  const { error } = await client.storage.from(ANNOUNCEMENTS_BUCKET).upload(path, body, {
    contentType, upsert: false,
  });
  if (error) throw error;
  const { data } = client.storage.from(ANNOUNCEMENTS_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

export async function deleteAnnouncementImageSupabase(path: string): Promise<void> {
  if (!path) return;
  try {
    await getClient().storage.from(ANNOUNCEMENTS_BUCKET).remove([path]);
  } catch {
    /* 이미 없으면 무시 */
  }
}

// 저장된 경로(key)로 공개 URL 재구성 — 클라이언트가 준 URL을 신뢰하지 않기 위함.
export function getAnnouncementPublicUrlSupabase(path: string): string {
  const { data } = getClient().storage.from(ANNOUNCEMENTS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// 업로드 기준(created_at) N일 지난 공지(category='notice') 정리 — 이미지 삭제 후 행 삭제.
// campus 지정 시 그 센터만(범위 관리자), 미지정 시 전체(전체 관리자). 삭제 건수 반환.
export async function pruneOldNoticesSupabase(beforeCreatedIso: string, campus?: string): Promise<number> {
  const client = getClient();
  let query = client
    .from('campus_events')
    .select('id, image_path')
    .eq('category', 'notice')
    .lt('created_at', beforeCreatedIso);
  if (campus) query = query.eq('campus', campus);
  const { data, error } = await query;
  if (error) throw error;
  const rows = data || [];
  if (rows.length === 0) return 0;
  const paths = rows.map((r: any) => r.image_path).filter((p: unknown): p is string => typeof p === 'string' && p.length > 0);
  if (paths.length > 0) {
    try { await client.storage.from(ANNOUNCEMENTS_BUCKET).remove(paths); } catch { /* 부분 실패 무시 */ }
  }
  const ids = rows.map((r: any) => r.id);
  const { error: delErr } = await client.from('campus_events').delete().in('id', ids);
  if (delErr) throw delErr;
  return ids.length;
}

// ── 휴가 증빙 사진 (Supabase Storage · 비공개) ────────────────────
// 병가/개인사정 증빙(진료 영수증 등)은 민감정보라 비공개 버킷에 두고, 관리자는 짧은 수명의
// 서명 URL로만 열람한다. 관리자가 확인(승인/반려)하면 즉시 삭제한다.
const LEAVE_PROOFS_BUCKET = 'leave-proofs';

async function ensureLeaveProofsBucket(): Promise<void> {
  const client = getClient();
  const { data } = await client.storage.getBucket(LEAVE_PROOFS_BUCKET);
  if (data) {
    // 민감정보 버킷 — 과거에 public 으로 선생성됐더라도 비공개로 멱등 강제.
    if (data.public) {
      try { await client.storage.updateBucket(LEAVE_PROOFS_BUCKET, { public: false }); } catch { /* 권한 등 실패는 무시 */ }
    }
    return;
  }
  const { error } = await client.storage.createBucket(LEAVE_PROOFS_BUCKET, {
    public: false, // 비공개 — 서명 URL로만 접근
    fileSizeLimit: 6 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  });
  if (error) {
    // 동시 최초 업로드 경쟁으로 이미 만들어졌을 수 있음 — 재확인 후에도 없으면 실패로 처리.
    const { data: recheck } = await client.storage.getBucket(LEAVE_PROOFS_BUCKET);
    if (!recheck) throw error;
  }
}

// 증빙 업로드 → 경로(key)만 반환(공개 URL 없음). 학생별/신청별 경로.
export async function uploadLeaveProofSupabase(
  studentId: string, leaveId: string, body: ArrayBuffer, contentType: string, ext: string,
): Promise<{ path: string }> {
  await ensureLeaveProofsBucket();
  const safeStudent = studentId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'unknown';
  const safeLeave = leaveId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'leave';
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `${safeStudent}/${safeLeave}-${Date.now()}-${rand}.${ext}`;
  const { error } = await getClient().storage.from(LEAVE_PROOFS_BUCKET).upload(path, body, { contentType, upsert: false });
  if (error) throw error;
  return { path };
}

// 관리자 열람용 짧은 수명 서명 URL
export async function signedLeaveProofUrlSupabase(path: string, ttlSec = 120): Promise<string> {
  const { data, error } = await getClient().storage.from(LEAVE_PROOFS_BUCKET).createSignedUrl(path, ttlSec);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteLeaveProofSupabase(path: string): Promise<void> {
  if (!path) return;
  try {
    await getClient().storage.from(LEAVE_PROOFS_BUCKET).remove([path]);
  } catch {
    /* 이미 없으면 무시 */
  }
}

// ── 오답노트 문제 사진 (Supabase Storage · 비공개) ────────────────
// 학생이 오답노트에 첨부한 문제 사진은 학습 콘텐츠라 비공개 버킷에 두고, 학생 본인·관리자 모두
// 짧은 수명의 서명 URL로만 열람한다. 증빙과 달리 자동 삭제는 없고, 노트/사진 삭제 시에만 제거한다.
const WRONG_NOTES_BUCKET = 'wrong-notes';

async function ensureWrongNotesBucket(): Promise<void> {
  const client = getClient();
  const { data } = await client.storage.getBucket(WRONG_NOTES_BUCKET);
  if (data) {
    // 학습 콘텐츠 버킷 — 과거에 public 으로 선생성됐더라도 비공개로 멱등 강제.
    if (data.public) {
      try { await client.storage.updateBucket(WRONG_NOTES_BUCKET, { public: false }); } catch { /* 권한 등 실패는 무시 */ }
    }
    return;
  }
  const { error } = await client.storage.createBucket(WRONG_NOTES_BUCKET, {
    public: false, // 비공개 — 서명 URL로만 접근
    fileSizeLimit: 6 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  });
  if (error) {
    // 동시 최초 업로드 경쟁으로 이미 만들어졌을 수 있음 — 재확인 후에도 없으면 실패로 처리.
    const { data: recheck } = await client.storage.getBucket(WRONG_NOTES_BUCKET);
    if (!recheck) throw error;
  }
}

// 오답 문제 사진 업로드 → 경로(key)만 반환(공개 URL 없음). 학생별/자료별 경로.
export async function uploadWrongNoteImageSupabase(
  studentId: string, materialId: string, body: ArrayBuffer, contentType: string, ext: string,
): Promise<{ path: string }> {
  await ensureWrongNotesBucket();
  const safeStudent = studentId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'unknown';
  const safeMaterial = materialId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'material';
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `${safeStudent}/${safeMaterial}-${Date.now()}-${rand}.${ext}`;
  const { error } = await getClient().storage.from(WRONG_NOTES_BUCKET).upload(path, body, { contentType, upsert: false });
  if (error) throw error;
  return { path };
}

// 학생 본인·관리자 열람용 짧은 수명 서명 URL
export async function signedWrongNoteUrlSupabase(path: string, ttlSec = 300): Promise<string> {
  const { data, error } = await getClient().storage.from(WRONG_NOTES_BUCKET).createSignedUrl(path, ttlSec);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteWrongNoteImageSupabase(path: string): Promise<void> {
  if (!path) return;
  try {
    await getClient().storage.from(WRONG_NOTES_BUCKET).remove([path]);
  } catch {
    /* 이미 없으면 무시 */
  }
}

// ── 도시락 신청 라운드 마스터 (meal_plans 테이블) ─────────────
function rowToMealPlan(r: any): MealPlan {
  return {
    id: r.id,
    weekStart: r.week_start,
    meals: Array.isArray(r.meals) ? r.meals : ['lunch'],
    campus: r.campus || undefined,
    deadline: r.deadline || undefined,
    lunchPrice: r.lunch_price != null ? Number(r.lunch_price) : undefined,
    dinnerPrice: r.dinner_price != null ? Number(r.dinner_price) : undefined,
    closedDays: Array.isArray(r.closed_days) ? r.closed_days : [],
    createdAt: r.created_at || '',
    notifiedAt: r.notified_at || undefined,
  };
}

export async function getMealPlansSupabase(): Promise<MealPlan[]> {
  const { data, error } = await getClient()
    .from('meal_plans')
    .select('*')
    .order('week_start', { ascending: false });
  if (error) throw error;
  return (data || []).map(rowToMealPlan);
}

export async function saveMealPlanSupabase(plan: MealPlan): Promise<MealPlan> {
  const row = {
    id: plan.id,
    week_start: plan.weekStart,
    meals: plan.meals || ['lunch'],
    campus: plan.campus || null,
    deadline: plan.deadline || null,
    lunch_price: plan.lunchPrice ?? null,
    dinner_price: plan.dinnerPrice ?? null,
    closed_days: plan.closedDays || [],
    created_at: plan.createdAt,
    notified_at: plan.notifiedAt || null,
  };
  const { data, error } = await getClient()
    .from('meal_plans')
    .upsert(row, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  return rowToMealPlan(data);
}

export async function deleteMealPlanSupabase(id: string): Promise<void> {
  const { error } = await getClient().from('meal_plans').delete().eq('id', id);
  if (error) throw error;
}

export async function notifyMealPlanSupabase(id: string, notifiedAt: string | null): Promise<MealPlan> {
  const { data, error } = await getClient()
    .from('meal_plans')
    .update({ notified_at: notifiedAt })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return rowToMealPlan(data);
}

export async function saveSharedMaterialSupabase(material: SharedMaterial): Promise<SharedMaterial> {
  const client = getClient();
  // 기존 db.ts 동작 유지: id 또는 (name+type) 동일하면 갱신, 아니면 신규.
  // .or() 필터는 사용자 입력(교재명)의 쉼표/괄호가 PostgREST 문법을 깨뜨리므로
  // (예: "수학의 정석(상)") 쿼리를 2회로 분리해 값이 항상 안전하게 전달되게 한다.
  const { data: byId } = await client
    .from('shared_materials')
    .select('id')
    .eq('id', material.id)
    .limit(1);
  let existing = byId;
  if (!existing || existing.length === 0) {
    const { data: byNameType } = await client
      .from('shared_materials')
      .select('id')
      .eq('name', material.name)
      .eq('type', material.type)
      .limit(1);
    existing = byNameType;
  }

  const targetId = existing && existing.length > 0 ? existing[0].id : material.id;
  const row = {
    id: targetId,
    type: material.type,
    name: material.name,
    subject: material.subject || '',
    publisher: material.publisher || '',
    author: material.author || '',
    total_pages_or_lectures: Number(material.totalPagesOrLectures) || 0,
    unit: material.unit || '',
    created_at: material.createdAt || new Date().toISOString(),
  };
  const { data, error } = await client
    .from('shared_materials')
    .upsert(row, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  return rowToMaterial(data);
}

// ── 관리자 계정 CRUD ───────────────────────────────────────────
export async function getAdminAccountsSupabase(): Promise<AdminAccount[]> {
  const { data, error } = await getClient()
    .from('admin_accounts')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map((r: any) => ({
    id: r.id,
    username: r.username,
    passwordHash: r.password,
    campus: r.campus,
    role: r.role,
    createdAt: r.created_at || '',
    updatedAt: r.updated_at || '',
  }));
}

export async function getAdminAccountByUsernameSupabase(username: string): Promise<AdminAccount | null> {
  const { data, error } = await getClient()
    .from('admin_accounts')
    .select('*')
    .eq('username', username)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    username: data.username,
    passwordHash: data.password,
    campus: data.campus,
    role: data.role,
    createdAt: data.created_at || '',
    updatedAt: data.updated_at || '',
  };
}

export async function saveAdminAccountSupabase(admin: AdminAccount): Promise<AdminAccount> {
  const row = {
    id: admin.id,
    username: admin.username,
    password: admin.passwordHash,
    campus: admin.campus,
    role: admin.role,
    updated_at: admin.updatedAt,
    created_at: admin.createdAt,
  };
  const { data, error } = await getClient()
    .from('admin_accounts')
    .upsert(row, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  return {
    id: data.id,
    username: data.username,
    passwordHash: data.password,
    campus: data.campus,
    role: data.role,
    createdAt: data.created_at || '',
    updatedAt: data.updated_at || '',
  };
}

export async function deleteAdminAccountSupabase(id: string): Promise<boolean> {
  const { error } = await getClient()
    .from('admin_accounts')
    .delete()
    .eq('id', id);
  if (error) throw error;
  return true;
}

// ── 전역 설정(app_settings) — key/value JSONB ────────────────
// 미션 설정 등 소규모 전역 설정 저장용. 테이블 미생성(마이그레이션 미실행) 시
// 읽기는 null 로 graceful 폴백(호출부가 기본값 사용), 쓰기는 명확한 에러를 던진다.
export async function getAppSettingSupabase(key: string): Promise<any | null> {
  const { data, error } = await getClient()
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  if (error) {
    console.warn('[getAppSettingSupabase] 조회 실패(테이블 미생성 가능):', error.message);
    return null;
  }
  return data?.value ?? null;
}

// value + 현재 updated_at 을 함께 읽어 낙관적 잠금 비교에 쓴다.
// 행이 없으면 version=null(미존재)로 보고, 호출부가 insert 분기를 탄다.
export async function getAppSettingWithVersionSupabase(
  key: string,
): Promise<{ value: any | null; version: string | null }> {
  const { data, error } = await getClient()
    .from('app_settings')
    .select('value, updated_at')
    .eq('key', key)
    .maybeSingle();
  if (error) {
    console.warn('[getAppSettingWithVersionSupabase] 조회 실패(테이블 미생성 가능):', error.message);
    return { value: null, version: null };
  }
  return { value: data?.value ?? null, version: (data?.updated_at as string) ?? null };
}

export async function setAppSettingSupabase(key: string, value: any): Promise<void> {
  const { error } = await getClient()
    .from('app_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) {
    console.error('[setAppSettingSupabase] 저장 실패:', error.message, error.details || '', error.hint || '');
    throw new Error(`설정 저장 실패(app_settings): ${error.message}${error.hint ? ` [${error.hint}]` : ''}`);
  }
}

// 낙관적 잠금 저장: expectedVersion(읽은 시점 updated_at)이 현재 행과 같을 때만 덮어쓴다.
// patchStudentProgressSupabase 의 .eq('updated_at', original) 패턴과 동일.
// - expectedVersion === null  → 행 미존재로 보고 insert(키 충돌 시 'conflict').
// - expectedVersion === 문자열 → updated_at 일치 update(0행이면 'conflict').
// 상담 원장 등 read-modify-write JSON 동시쓰기 유실(TOCTOU)을 막는 데 사용한다.
export async function setAppSettingIfUnchangedSupabase(
  key: string,
  value: any,
  expectedVersion: string | null,
): Promise<'ok' | 'conflict'> {
  const nowIso = new Date().toISOString();
  if (expectedVersion === null) {
    // 처음 쓰는 키 — insert. 같은 키가 동시에 먼저 들어오면 unique 충돌 → 재시도 신호.
    const { error } = await getClient()
      .from('app_settings')
      .insert({ key, value, updated_at: nowIso });
    if (error) {
      // 23505 = unique_violation (다른 요청이 먼저 행 생성) → conflict 로 재시도 유도.
      if ((error as any).code === '23505') return 'conflict';
      console.error('[setAppSettingIfUnchangedSupabase] insert 실패:', error.message, error.details || '', error.hint || '');
      throw new Error(`설정 저장 실패(app_settings): ${error.message}${error.hint ? ` [${error.hint}]` : ''}`);
    }
    return 'ok';
  }
  const { data, error } = await getClient()
    .from('app_settings')
    .update({ value, updated_at: nowIso })
    .eq('key', key)
    .eq('updated_at', expectedVersion)
    .select('key')
    .maybeSingle();
  if (error) {
    console.error('[setAppSettingIfUnchangedSupabase] update 실패:', error.message, error.details || '', error.hint || '');
    throw new Error(`설정 저장 실패(app_settings): ${error.message}${error.hint ? ` [${error.hint}]` : ''}`);
  }
  if (!data) return 'conflict'; // updated_at 불일치(다른 요청이 먼저 저장) → 재시도.
  return 'ok';
}

// 기간 내 수기 결석 마크(status 'absent') — 이탈/결석 순위 집계용.
export async function getSeatAbsenceMarksSupabase(from: string, to: string): Promise<{ date: string; seatKey: string }[]> {
  const { data, error } = await getClient()
    .from('seat_statuses')
    .select('date, seat_key, status')
    .gte('date', from)
    .lte('date', to)
    .eq('status', 'absent');
  if (error) throw error;
  return (data || []).map((r: any) => ({ date: String(r.date), seatKey: String(r.seat_key) }));
}

// 특정 학생의 기간 내 수기 결석 마크(status 'absent') — 스트릭의 일괄결석일(7교시 전부 X) 판정용.
// seat_key 는 "{studentId}:{periodIdx}" 형태라 prefix like 필터로 학생 스코프를 건다.
export async function getStudentSeatAbsenceMarksSupabase(
  studentId: string,
  from: string,
  to: string,
): Promise<{ date: string; seatKey: string }[]> {
  const { data, error } = await getClient()
    .from('seat_statuses')
    .select('date, seat_key, status')
    .gte('date', from)
    .lte('date', to)
    .eq('status', 'absent')
    .like('seat_key', `${studentId}:%`);
  if (error) throw error;
  return (data || []).map((r: any) => ({ date: String(r.date), seatKey: String(r.seat_key) }));
}

// 기간 내 좌석판 수기 출석 마크(status 'present') — 순공(재석) 읽기 시점 파생용.
// QR 등하원 없이 관리자가 좌석판에서 출석 처리한 날의 재석분을 study_stats 쪽에서 파생한다.
export async function getSeatPresenceMarksSupabase(from: string, to?: string): Promise<{ date: string; seatKey: string }[]> {
  let query = getClient()
    .from('seat_statuses')
    .select('date, seat_key, status')
    .gte('date', from)
    .eq('status', 'present');
  if (to) query = query.lte('date', to);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((r: any) => ({ date: String(r.date), seatKey: String(r.seat_key) }));
}

// 특정 학생의 기간 내 수기 출석 마크(status 'present') — 본인 리포트 순공 통계 파생용.
// seat_key 는 "{studentId}:{periodIdx}" 형태라 prefix like 필터로 학생 스코프를 건다.
export async function getStudentSeatPresenceMarksSupabase(
  studentId: string,
  from: string,
  to: string,
): Promise<{ date: string; seatKey: string }[]> {
  const { data, error } = await getClient()
    .from('seat_statuses')
    .select('date, seat_key, status')
    .gte('date', from)
    .lte('date', to)
    .eq('status', 'present')
    .like('seat_key', `${studentId}:%`);
  if (error) throw error;
  return (data || []).map((r: any) => ({ date: String(r.date), seatKey: String(r.seat_key) }));
}

// 기간 내 등원일 집합 "studentId|date".
export async function getAttendedDaysSupabase(from: string, to: string): Promise<Set<string>> {
  const { data, error } = await getClient()
    .from('study_sessions')
    .select('student_id, date')
    .gte('date', from)
    .lte('date', to);
  if (error) throw error;
  const set = new Set<string>();
  for (const r of (data || []) as any[]) {
    if (r.student_id && r.date) set.add(`${r.student_id}|${r.date}`);
  }
  return set;
}

