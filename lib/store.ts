// 데이터 저장소 파사드 — 1차: Supabase.
// SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY 가 설정되어 있으면 Supabase 를 사용하고,
// (주로 로컬 개발에서) 미설정이면 로컬 JSON(lib/db) 으로 폴백한다.
// 구글 스프레드시트 경로는 제거됨.
import { Student, SharedMaterial } from './types/student';
import {
  isSupabaseConfigured,
  getStudentsSupabase,
  getStudentsSummarySupabase,
  getStudentByIdSupabase,
  saveStudentSupabase,
  patchStudentProgressSupabase,
  deleteStudentSupabase,
  readSharedMaterialsSupabase,
  saveSharedMaterialSupabase,
  getStudentAuthRecordsSupabase,
  setStudentPasswordHashSupabase,
  setStudentNotifyInfoSupabase,
  setStudentExpectedArrivalSupabase,
  type NotifyInfo,
  getOpenSessionSupabase,
  getOpenSessionsSupabase,
  getSessionsByDateSupabase,
  getSessionsInRangeSupabase,
  deleteSessionsByStudentDateSupabase,
  insertManualSessionSupabase,
  checkInSupabase,
  checkOutSupabase,
  getStudySessionsSupabase,
  getStudyMinutesByStudentSupabase,
  type StudentAuthRecord,
  type StudySession,
} from './supabase';

export type { StudySession } from './supabase';
import {
  getStudentsLocal,
  getStudentLocal,
  saveStudentLocal,
  deleteStudentLocal,
  readSharedMaterials as readSharedMaterialsLocal,
  saveSharedMaterial as saveSharedMaterialLocal,
} from './db';

export function activeBackend(): 'supabase' | 'local-json' {
  return isSupabaseConfigured() ? 'supabase' : 'local-json';
}

export async function getStudents(): Promise<Student[]> {
  return isSupabaseConfigured() ? getStudentsSupabase() : getStudentsLocal();
}

export async function getStudentsSummary(): Promise<Student[]> {
  return isSupabaseConfigured() ? getStudentsSummarySupabase() : getStudentsLocal();
}

export async function getStudentById(id: string): Promise<Student | null> {
  return isSupabaseConfigured() ? getStudentByIdSupabase(id) : (getStudentLocal(id) ?? null);
}

export async function saveStudent(student: Student): Promise<Student> {
  return isSupabaseConfigured() ? saveStudentSupabase(student) : saveStudentLocal(student);
}

// 진도 PATCH 전용: Supabase 에서 optimistic locking, 로컬에서는 일반 저장.
export async function patchStudentProgress(
  student: Student,
  originalUpdatedAt: string,
): Promise<Student | 'conflict'> {
  if (!isSupabaseConfigured()) {
    return saveStudentLocal(student);
  }
  return patchStudentProgressSupabase(student, originalUpdatedAt);
}

export async function deleteStudent(id: string): Promise<boolean> {
  return isSupabaseConfigured() ? deleteStudentSupabase(id) : deleteStudentLocal(id);
}

export async function readSharedMaterials(): Promise<SharedMaterial[]> {
  return isSupabaseConfigured() ? readSharedMaterialsSupabase() : readSharedMaterialsLocal();
}

export async function saveSharedMaterial(material: SharedMaterial): Promise<SharedMaterial> {
  return isSupabaseConfigured() ? saveSharedMaterialSupabase(material) : saveSharedMaterialLocal(material);
}

// ── 학생 인증 ──
export async function getStudentAuthRecords(): Promise<StudentAuthRecord[]> {
  if (isSupabaseConfigured()) return getStudentAuthRecordsSupabase();
  // 로컬 폴백: 비밀번호 지원
  return getStudentsLocal().map((s) => ({
    id: s.id,
    name: s.name,
    login_id: s.loginId || null,
    contact: s.contact || null,
    password_hash: s.passwordHash || null
  }));
}

export async function setStudentPasswordHash(studentId: string, hash: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    const student = getStudentLocal(studentId);
    if (!student) throw new Error('원생 정보를 찾을 수 없습니다.');
    student.passwordHash = hash;
    saveStudentLocal(student);
    return;
  }
  return setStudentPasswordHashSupabase(studentId, hash);
}

export async function setStudentNotifyInfo(studentId: string, info: NotifyInfo): Promise<void> {
  if (!isSupabaseConfigured()) throw new Error('Supabase가 설정되어야 알림 연락처를 저장할 수 있습니다.');
  return setStudentNotifyInfoSupabase(studentId, info);
}

export async function setStudentExpectedArrival(studentId: string, value: '08:20' | '09:00'): Promise<void> {
  if (!isSupabaseConfigured()) throw new Error('Supabase가 설정되어야 지각 기준을 저장할 수 있습니다.');
  return setStudentExpectedArrivalSupabase(studentId, value);
}

// ── 출결/순공 (Supabase 필요) ──
function requireSupabase() {
  if (!isSupabaseConfigured()) throw new Error('Supabase가 설정되어야 출결 기능을 사용할 수 있습니다.');
}
export async function getOpenSession(studentId: string): Promise<StudySession | null> {
  requireSupabase();
  return getOpenSessionSupabase(studentId);
}
export async function getOpenSessions(): Promise<StudySession[]> {
  requireSupabase();
  return getOpenSessionsSupabase();
}
export async function getSessionsByDate(date: string): Promise<StudySession[]> {
  requireSupabase();
  return getSessionsByDateSupabase(date);
}
export async function getSessionsInRange(start: string, end: string): Promise<StudySession[]> {
  requireSupabase();
  return getSessionsInRangeSupabase(start, end);
}
export async function deleteSessionsByStudentDate(studentId: string, date: string): Promise<void> {
  requireSupabase();
  return deleteSessionsByStudentDateSupabase(studentId, date);
}
export async function setManualAttendance(
  studentId: string, date: string, checkInIso: string, checkOutIso: string | null
): Promise<StudySession> {
  requireSupabase();
  await deleteSessionsByStudentDateSupabase(studentId, date); // 해당 일자 1건으로 정규화
  return insertManualSessionSupabase(studentId, date, checkInIso, checkOutIso);
}
export async function checkIn(studentId: string, source = 'qr'): Promise<StudySession> {
  requireSupabase();
  return checkInSupabase(studentId, source);
}
export async function checkOut(session: StudySession, at?: Date): Promise<StudySession> {
  requireSupabase();
  return at ? checkOutSupabase(session, at) : checkOutSupabase(session);
}
export async function getStudySessions(studentId: string, sinceDate?: string): Promise<StudySession[]> {
  requireSupabase();
  return getStudySessionsSupabase(studentId, sinceDate);
}
export async function getStudyMinutesByStudent(sinceDate: string): Promise<Record<string, number>> {
  requireSupabase();
  return getStudyMinutesByStudentSupabase(sinceDate);
}
