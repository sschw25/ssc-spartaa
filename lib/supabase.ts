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
    ddays: r.ddays || [],
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
    student_state: { ...(student.studentState || {}), enrollStartDate: student.enrollStartDate || null },
    saturday_late_excuses: student.saturdayLateExcuses || [],
    away_schedules: student.awaySchedules || [],
    phone_submissions: student.phoneSubmissions || [],
    ddays: student.ddays || [],
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
  'expected_arrival', 'seat_number', 'saturday_late_excuses', 'away_schedules', 'created_at', 'updated_at',
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
  const { data, error } = await getClient()
    .from('study_sessions')
    .select('*')
    .eq('student_id', studentId)
    .is('check_out', null)
    .maybeSingle();
  if (error) throw error;
  return (data as StudySession) || null;
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
  if (error) throw error;
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

// 기간 내 전체 학생의 (학생별) 순공 합계 — 등수 계산용 (서버 전용 집계)
export async function getStudyMinutesByStudentSupabase(sinceDate: string): Promise<Record<string, number>> {
  const { data, error } = await getClient()
    .from('study_sessions')
    .select('student_id, minutes')
    .gte('date', sinceDate);
  if (error) throw error;
  const totals: Record<string, number> = {};
  (data || []).forEach((r: any) => {
    if (r.minutes) totals[r.student_id] = (totals[r.student_id] || 0) + r.minutes;
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

// 모의고사 학생 알림 발송 표시 (notified_at 설정)
export async function notifyMockExamSupabase(id: string, notifiedAt: string | null): Promise<MockExam> {
  const { data, error } = await getClient()
    .from('mock_exams')
    .update({ notified_at: notifiedAt })
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

export async function notifyOtEventSupabase(id: string, notifiedAt: string | null): Promise<OtEvent> {
  const { data, error } = await getClient()
    .from('ot_events')
    .update({ notified_at: notifiedAt })
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
    category: (r.category === 'mission' ? 'mission' : 'general'),
    memo: r.memo || undefined,
    color: r.color || undefined,
    isMission: Boolean(r.is_mission),
    couponReward: r.coupon_reward != null ? Number(r.coupon_reward) : undefined,
    targetMode: (r.target_mode === 'students' ? 'students' : (r.target_mode === 'campus' ? 'campus' : undefined)),
    targetStudentIds: Array.isArray(r.target_student_ids) ? r.target_student_ids : [],
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
    is_mission: Boolean(event.isMission),
    coupon_reward: event.couponReward ?? null,
    target_mode: event.targetMode || null,
    target_student_ids: event.targetStudentIds || [],
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

export async function notifyCampusEventSupabase(id: string, notifiedAt: string | null): Promise<CampusEvent> {
  const { data, error } = await getClient()
    .from('campus_events')
    .update({ notified_at: notifiedAt })
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
  // 기존 db.ts 동작 유지: id 또는 (name+type) 동일하면 갱신, 아니면 신규
  const { data: existing } = await client
    .from('shared_materials')
    .select('id')
    .or(`id.eq.${material.id},and(name.eq.${material.name},type.eq.${material.type})`)
    .limit(1);

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

