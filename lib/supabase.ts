import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Student, SharedMaterial, BookProgress, LectureProgress, MockExam, OtEvent, AdminAccount } from './types/student';
import { mergeOrphanMaterials } from './db';

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
    smsTargets: Array.isArray(r.sms_targets) ? r.sms_targets : ['parent'],
    expectedArrival: r.expected_arrival === '09:00' ? '09:00' : '08:20',
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
    penalties: r.penalties || [],
    smsLogs: r.sms_logs || [],
    mockExams: r.mock_exams || [],
    otEvents: r.ot_events || [],
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
    sms_targets: student.smsTargets && student.smsTargets.length ? student.smsTargets : ['parent'],
    speed_multiplier: 1.0,
    life_comment: student.lifeComment || '',
    special_note: student.specialNote || '',
    student_life_comment: student.studentLifeComment || '',
    subjects,
    consultation_logs: student.consultationLogs || [],
    grades: student.grades || [],
    leave_requests: student.leaveRequests || [],
    leave_coupons: student.leaveCoupons ?? 0,
    penalties: student.penalties || [],
    sms_logs: student.smsLogs || [],
    mock_exams: student.mockExams || [],
    ot_events: student.otEvents || [],
    saturday_late_excuses: student.saturdayLateExcuses || [],
    away_schedules: student.awaySchedules || [],
    phone_submissions: student.phoneSubmissions || [],
    ddays: student.ddays || [],
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
      sms_targets: info.smsTargets && info.smsTargets.length ? info.smsTargets : ['parent'],
    })
    .eq('id', studentId);
  if (error) throw error;
}

// 지각 기준(등원 마감) 단일 컬럼 타깃 업데이트
export async function setStudentExpectedArrivalSupabase(studentId: string, value: '08:20' | '09:00'): Promise<void> {
  const { error } = await getClient()
    .from('students')
    .update({ expected_arrival: value === '09:00' ? '09:00' : '08:20' })
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
    created_at: exam.createdAt,
    notified_at: exam.notifiedAt || null,
  };
  const { data, error } = await getClient()
    .from('mock_exams')
    .upsert(row, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  return rowToMockExam(data);
}

export async function deleteMockExamSupabase(id: string): Promise<void> {
  const { error } = await getClient().from('mock_exams').delete().eq('id', id);
  if (error) throw error;
}

// 모의고사 학생 알림 발송 표시 (notified_at 설정)
export async function notifyMockExamSupabase(id: string, notifiedAt: string): Promise<MockExam> {
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
    targetExamTypes: r.target_exam_types || [],
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
    target_exam_types: event.targetExamTypes || [],
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

export async function notifyOtEventSupabase(id: string, notifiedAt: string): Promise<OtEvent> {
  const { data, error } = await getClient()
    .from('ot_events')
    .update({ notified_at: notifiedAt })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return rowToOtEvent(data);
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

export async function setAppSettingSupabase(key: string, value: any): Promise<void> {
  const { error } = await getClient()
    .from('app_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) {
    console.error('[setAppSettingSupabase] 저장 실패:', error.message, error.details || '', error.hint || '');
    throw new Error(`설정 저장 실패(app_settings): ${error.message}${error.hint ? ` [${error.hint}]` : ''}`);
  }
}

