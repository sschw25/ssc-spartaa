// 데이터 저장소 파사드 — 1차: Supabase.
// SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY 가 설정되어 있으면 Supabase 를 사용하고,
// (주로 로컬 개발에서) 미설정이면 로컬 JSON(lib/db) 으로 폴백한다.
// 구글 스프레드시트 경로는 제거됨.
import fs from 'fs';
import path from 'path';
import { Student, SharedMaterial, MockExam, OtEvent, MealPlan, AdminAccount, CampusEvent, StudentApplication, ConsultationBooking } from './types/student';
import { isSlotFree } from './consultation-schedule';
import {
  isSupabaseConfigured,
  getStudentsSupabase,
  getStudentsSummarySupabase,
  getStudentByIdSupabase,
  saveStudentSupabase,
  createStudentWithPasswordHashSupabase,
  patchStudentProgressSupabase,
  patchStudentSubjectsSupabase,
  patchStudentProfileSupabase,
  deleteStudentSupabase,
  readSharedMaterialsSupabase,
  saveSharedMaterialSupabase,
  getStudentAuthRecordsSupabase,
  setStudentPasswordHashSupabase,
  applyStudentPasswordChangeSupabase,
  setStudentNotifyInfoSupabase,
  setStudentExpectedArrivalSupabase,
  getMockExamsSupabase,
  saveMockExamSupabase,
  deleteMockExamSupabase,
  notifyMockExamSupabase,
  getOtEventsSupabase,
  saveOtEventSupabase,
  deleteOtEventSupabase,
  notifyOtEventSupabase,
  getCampusEventsSupabase,
  saveCampusEventSupabase,
  deleteCampusEventSupabase,
  notifyCampusEventSupabase,
  markCampusEventRewardedSupabase,
  getMealPlansSupabase,
  saveMealPlanSupabase,
  deleteMealPlanSupabase,
  notifyMealPlanSupabase,
  type NotifyInfo,
  getOpenSessionSupabase,
  getOpenSessionsSupabase,
  getSessionsByDateSupabase,
  getSessionsInRangeSupabase,
  deleteSessionsByStudentDateSupabase,
  insertManualSessionSupabase,
  checkInSupabase,
  checkOutSupabase,
  autoCloseSessionSupabase,
  getStudySessionsSupabase,
  getStudyMinutesByStudentSupabase,
  type StudentAuthRecord,
  type StudySession,
  getAdminAccountsSupabase,
  getAdminAccountByUsernameSupabase,
  saveAdminAccountSupabase,
  deleteAdminAccountSupabase,
  getAppSettingSupabase,
  setAppSettingSupabase,
  getSeatAbsenceMarksSupabase,
  getAttendedDaysSupabase,
} from './supabase';

export type { StudySession } from './supabase';
import {
  getStudentsLocal,
  getStudentLocal,
  saveStudentLocal,
  deleteStudentLocal,
  readSharedMaterials as readSharedMaterialsLocal,
  saveSharedMaterial as saveSharedMaterialLocal,
  readAdminAccountsLocal,
  getAdminAccountByUsernameLocal,
  saveAdminAccountLocal,
  deleteAdminAccountLocal,
  getAppSettingLocal,
  setAppSettingLocal,
} from './db';

export function activeBackend(): 'supabase' | 'local-json' {
  return isSupabaseConfigured() ? 'supabase' : 'local-json';
}

// ── 관리자 계정 통합 API ──
export async function getAdminAccounts(): Promise<AdminAccount[]> {
  return isSupabaseConfigured() ? getAdminAccountsSupabase() : readAdminAccountsLocal();
}

export async function getAdminAccountByUsername(username: string): Promise<AdminAccount | null> {
  return isSupabaseConfigured() ? getAdminAccountByUsernameSupabase(username) : getAdminAccountByUsernameLocal(username);
}

export async function saveAdminAccount(admin: AdminAccount): Promise<AdminAccount> {
  return isSupabaseConfigured() ? saveAdminAccountSupabase(admin) : saveAdminAccountLocal(admin);
}

export async function deleteAdminAccount(id: string): Promise<boolean> {
  return isSupabaseConfigured() ? deleteAdminAccountSupabase(id) : deleteAdminAccountLocal(id);
}

// ── 전역 설정(app_settings) ──
export async function getAppSetting(key: string): Promise<any | null> {
  return isSupabaseConfigured() ? getAppSettingSupabase(key) : getAppSettingLocal(key);
}

export async function setAppSetting(key: string, value: any): Promise<void> {
  if (isSupabaseConfigured()) return setAppSettingSupabase(key, value);
  return setAppSettingLocal(key, value);
}

// ── 학생 셀프 가입신청 대기열 (app_settings 키-값에 JSON 배열로 보관) ──
// 신규 테이블 없이 운영. 대기 건은 소량이므로 충분하며, 승인/반려 시 목록에서 제거된다.
const STUDENT_APPLICATIONS_KEY = 'student_applications';

export async function getStudentApplications(): Promise<StudentApplication[]> {
  const value = await getAppSetting(STUDENT_APPLICATIONS_KEY);
  return Array.isArray(value) ? (value as StudentApplication[]) : [];
}

export async function addStudentApplication(application: StudentApplication): Promise<void> {
  const list = await getStudentApplications();
  list.push(application);
  await setAppSetting(STUDENT_APPLICATIONS_KEY, list);
}

// 신청 제거 후 제거된 신청을 반환(없으면 null). 승인/반려 공통 사용.
export async function removeStudentApplication(id: string): Promise<StudentApplication | null> {
  const list = await getStudentApplications();
  const found = list.find((a) => a.id === id) || null;
  if (found) await setAppSetting(STUDENT_APPLICATIONS_KEY, list.filter((a) => a.id !== id));
  return found;
}


// ── 상담 예약 원장 (센터별 app_settings 키-값 JSON 배열) ──
// 슬롯 점유는 센터 전체가 공유하는 자원이라 학생 컬럼이 아닌 중앙 원장에 보관한다.
// 신규 테이블/마이그레이션 없이 운영. 예약은 소량이라 read-modify-write 로 충분하며,
// 생성 직전 슬롯 비어있음을 재검증해 동시 중복 예약을 방지한다.
const CONSULTATION_BOOKINGS_KEY_PREFIX = 'consultation_bookings:';

export async function getConsultationBookings(campus: string): Promise<ConsultationBooking[]> {
  const value = await getAppSetting(`${CONSULTATION_BOOKINGS_KEY_PREFIX}${campus}`);
  return Array.isArray(value) ? (value as ConsultationBooking[]) : [];
}

// 여러 센터의 예약을 한 번에 조회(마스터 계정 전체 보기용).
export async function getConsultationBookingsForCampuses(campuses: string[]): Promise<ConsultationBooking[]> {
  const lists = await Promise.all(campuses.map((c) => getConsultationBookings(c)));
  return lists.flat();
}

async function saveConsultationBookings(campus: string, list: ConsultationBooking[]): Promise<void> {
  await setAppSetting(`${CONSULTATION_BOOKINGS_KEY_PREFIX}${campus}`, list);
}

// 정규 예약 생성(자동 수락). 슬롯 점유 재검증 후 추가. 이미 점유 시 'taken' 반환.
// (관리자 직접 배정은 forceAssign=true 로 점유 검증을 건너뛸 수 있다.)
export async function addConsultationBooking(
  booking: ConsultationBooking,
  forceAssign = false,
): Promise<ConsultationBooking | 'taken'> {
  const list = await getConsultationBookings(booking.campus);
  if (booking.kind === 'regular' && booking.slot && !forceAssign) {
    if (!isSlotFree(booking.date, booking.slot, list)) return 'taken';
  }
  const next = [...list, booking];
  await saveConsultationBookings(booking.campus, next);
  return booking;
}

// 학생 삭제 시, 그 학생의 상담 예약을 센터 원장에서 제거(고아 레코드 방지).
// 제거 건수를 반환. 0이면 변경 없음.
export async function removeConsultationBookingsForStudent(
  campus: string,
  studentId: string,
): Promise<number> {
  const list = await getConsultationBookings(campus);
  const next = list.filter((b) => b.studentId !== studentId);
  const removed = list.length - next.length;
  if (removed > 0) await saveConsultationBookings(campus, next);
  return removed;
}

// 예약 부분 수정(취소/완료/담당자 회신/슬롯 배정 등). 없으면 null.
export async function patchConsultationBooking(
  campus: string,
  id: string,
  patch: Partial<ConsultationBooking>,
): Promise<ConsultationBooking | null> {
  const list = await getConsultationBookings(campus);
  const idx = list.findIndex((b) => b.id === id);
  if (idx < 0) return null;
  const updated = { ...list[idx], ...patch };
  const next = list.slice();
  next[idx] = updated;
  await saveConsultationBookings(campus, next);
  return updated;
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

export async function createStudentWithPasswordHash(student: Student, passwordHash: string): Promise<Student> {
  if (!isSupabaseConfigured()) {
    return saveStudentLocal({ ...student, passwordHash });
  }
  return createStudentWithPasswordHashSupabase(student, passwordHash);
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

/**
 * 단일 학생을 낙관적 잠금으로 안전하게 수정한다.
 * fresh 재조회 → mutate 적용 → updated_at 조건부 저장. 버전 충돌 시 최대 attempts회 재시도하여
 * 전체 row upsert 가 동시 저장(쿠폰/휴가/알림/관리자 처리 등)을 덮어쓰는 유실을 방지한다.
 * - mutate 가 명시적으로 false 를 반환하면 검증 실패로 보고 즉시 'abort' 반환(저장하지 않음).
 *   mutate 클로저에서 바깥 변수에 에러 응답/결과를 담아 호출부에서 사용할 수 있다.
 * - 반환: 저장된 Student | 'not_found'(학생 없음) | 'conflict'(재시도 소진) | 'abort'(mutate가 false 반환)
 */
export async function updateStudentById(
  id: string,
  mutate: (student: Student) => boolean | void | Promise<boolean | void>,
  attempts = 3,
): Promise<Student | 'not_found' | 'conflict' | 'abort'> {
  for (let i = 0; i < attempts; i++) {
    const student = await getStudentById(id);
    if (!student) return 'not_found';
    const originalUpdatedAt = student.updatedAt ?? '';
    const ok = await mutate(student);
    if (ok === false) return 'abort';
    const saved = await patchStudentProgress(student, originalUpdatedAt);
    if (saved !== 'conflict') return saved;
  }
  return 'conflict';
}

// 필드 단위 저장: 진도(subjects) 컬럼만. 다른 컬럼(쿠폰/벌점 등)과 동시 저장돼도 충돌 안 함.
// 로컬(dev)에서는 전체 저장으로 폴백.
export async function patchStudentSubjects(student: Student): Promise<Student> {
  if (!isSupabaseConfigured()) return saveStudentLocal(student);
  return patchStudentSubjectsSupabase(student);
}

// 필드 단위 저장: 프로필(담당/연락처/좌석) 컬럼만. 로컬(dev)에서는 전체 저장으로 폴백.
export async function patchStudentProfile(student: Student): Promise<Student> {
  if (!isSupabaseConfigured()) return saveStudentLocal(student);
  return patchStudentProfileSupabase(student);
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

type PendingPasswordChange = { hash?: string; requestedAt?: string };

export async function approvePendingStudentPasswordChange(
  studentId: string,
  attempts = 3,
): Promise<Student | 'not_found' | 'no_pending' | 'conflict'> {
  for (let i = 0; i < attempts; i++) {
    const student = await getStudentById(studentId);
    if (!student) return 'not_found';

    const pending = student.studentState?.passwordChange as PendingPasswordChange | undefined;
    if (!pending?.hash) return 'no_pending';

    const nextState = { ...(student.studentState || {}) };
    delete nextState.passwordChange;

    if (!isSupabaseConfigured()) {
      return saveStudentLocal({
        ...student,
        passwordHash: pending.hash,
        studentState: nextState,
      });
    }

    const saved = await applyStudentPasswordChangeSupabase(
      studentId,
      pending.hash,
      nextState,
      student.updatedAt ?? '',
    );
    if (saved !== 'conflict') return saved;
  }
  return 'conflict';
}

export async function setStudentNotifyInfo(studentId: string, info: NotifyInfo): Promise<void> {
  if (!isSupabaseConfigured()) throw new Error('Supabase가 설정되어야 알림 연락처를 저장할 수 있습니다.');
  return setStudentNotifyInfoSupabase(studentId, info);
}

export async function setStudentExpectedArrival(studentId: string, value: string): Promise<void> {
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
export async function autoCloseSession(session: StudySession, at: Date): Promise<StudySession> {
  requireSupabase();
  return autoCloseSessionSupabase(session, at);
}
export async function getStudySessions(studentId: string, sinceDate?: string): Promise<StudySession[]> {
  requireSupabase();
  return getStudySessionsSupabase(studentId, sinceDate);
}
export async function getStudyMinutesByStudent(sinceDate: string): Promise<Record<string, number>> {
  requireSupabase();
  return getStudyMinutesByStudentSupabase(sinceDate);
}

// ── 모의고사 일정 ──
export async function getMockExams(): Promise<MockExam[]> {
  requireSupabase();
  return getMockExamsSupabase();
}

export async function saveMockExam(exam: MockExam): Promise<MockExam> {
  requireSupabase();
  return saveMockExamSupabase(exam);
}

export async function deleteMockExam(id: string): Promise<void> {
  requireSupabase();
  return deleteMockExamSupabase(id);
}

export async function notifyMockExam(id: string, notifiedAt: string | null): Promise<MockExam> {
  requireSupabase();
  return notifyMockExamSupabase(id, notifiedAt);
}

// ── OT 일정 ──
export async function getOtEvents(): Promise<OtEvent[]> {
  requireSupabase();
  return getOtEventsSupabase();
}

export async function saveOtEvent(event: OtEvent): Promise<OtEvent> {
  requireSupabase();
  return saveOtEventSupabase(event);
}

export async function deleteOtEvent(id: string): Promise<void> {
  requireSupabase();
  return deleteOtEventSupabase(id);
}

export async function notifyOtEvent(id: string, notifiedAt: string | null): Promise<OtEvent> {
  requireSupabase();
  return notifyOtEventSupabase(id, notifiedAt);
}

// ── 학원 캘린더 일정 & 참여 미션 ──
export async function getCampusEvents(): Promise<CampusEvent[]> {
  requireSupabase();
  return getCampusEventsSupabase();
}

export async function saveCampusEvent(event: CampusEvent): Promise<CampusEvent> {
  requireSupabase();
  return saveCampusEventSupabase(event);
}

export async function deleteCampusEvent(id: string): Promise<void> {
  requireSupabase();
  return deleteCampusEventSupabase(id);
}

export async function notifyCampusEvent(id: string, notifiedAt: string | null): Promise<CampusEvent> {
  requireSupabase();
  return notifyCampusEventSupabase(id, notifiedAt);
}

export async function markCampusEventRewarded(id: string, rewardedAt: string): Promise<CampusEvent> {
  requireSupabase();
  return markCampusEventRewardedSupabase(id, rewardedAt);
}

// ── 도시락 신청 라운드 ──
export async function getMealPlans(): Promise<MealPlan[]> {
  requireSupabase();
  return getMealPlansSupabase();
}

export async function saveMealPlan(plan: MealPlan): Promise<MealPlan> {
  requireSupabase();
  return saveMealPlanSupabase(plan);
}

export async function deleteMealPlan(id: string): Promise<void> {
  requireSupabase();
  return deleteMealPlanSupabase(id);
}

export async function notifyMealPlan(id: string, notifiedAt: string | null): Promise<MealPlan> {
  requireSupabase();
  return notifyMealPlanSupabase(id, notifiedAt);
}

// 기간 내 수기 결석 마크. Supabase 또는 로컬(data/seat_statuses.json) 폴백.
export async function getSeatAbsenceMarks(from: string, to: string): Promise<{ date: string; seatKey: string }[]> {
  if (isSupabaseConfigured()) return getSeatAbsenceMarksSupabase(from, to);
  const p = path.join(process.cwd(), 'data', 'seat_statuses.json');
  if (!fs.existsSync(p)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r: any) => r && r.status === 'absent' && typeof r.date === 'string' && r.date >= from && r.date <= to && typeof r.seat_key === 'string')
      .map((r: any) => ({ date: String(r.date), seatKey: String(r.seat_key) }));
  } catch {
    return [];
  }
}

// 기간 내 등원일 집합. 세션은 Supabase 전용 → 미설정 시 빈 집합(전부 결석 분류됨).
export async function getAttendedDays(from: string, to: string): Promise<Set<string>> {
  if (!isSupabaseConfigured()) return new Set();
  return getAttendedDaysSupabase(from, to);
}

export type { MockExam, OtEvent, MealPlan, CampusEvent };
