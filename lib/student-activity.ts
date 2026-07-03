import type { DetailedPlan } from '@/lib/types/student';

export type PhoneStatus = 'submitted' | 'locker' | 'off_hold'; // 제출완료 / 임시보관함 / 전원종료후소지
export type DailyChecklistEntry = {
  sleep_hours?: number;
  phone_submitted?: boolean;       // 하위호환: phone_status==='submitted' 와 동치
  phone_status?: PhoneStatus;      // 등원 시 휴대폰 처리 방식 (3택)
  submitted_at?: string;
};

export type PlanDailyCompletion = {
  isCompleted: boolean;
  actualAmount?: number;
  completedAt?: string;
};

export type SpecialNoteEnvelope = {
  noteText?: string;
  pomodoro_sessions?: Record<string, number>;
  pomodoro_minutes?: Record<string, number>;
  pomodoro_distractions?: Record<string, number>; // 날짜별 집중 이탈(알트탭/창전환) 횟수
  daily_checklist?: Record<string, DailyChecklistEntry>;
  mock_reviews?: Array<{
    id: string;
    testName: string;
    testDate: string;
    wrongNotes: string;
    actionPlan: string;
    submittedAt: string;
  }>;
  dismissed_notifications?: string[];
  rewards_log?: unknown[];
  [key: string]: unknown;
};

export function getSeoulDateKey(date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(date);
}

export function parseSpecialNoteEnvelope(specialNote?: string | null): SpecialNoteEnvelope {
  if (!specialNote) return {};
  try {
    const parsed = JSON.parse(specialNote);
    if (parsed && typeof parsed === 'object') return parsed as SpecialNoteEnvelope;
    return { noteText: specialNote };
  } catch {
    return { noteText: specialNote };
  }
}

function copyNumberRecord(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const output: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const num = Number(raw);
    if (Number.isFinite(num)) output[key] = num;
  }
  return Object.keys(output).length > 0 ? output : undefined;
}

function copyChecklistRecord(value: unknown): Record<string, DailyChecklistEntry> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const output: Record<string, DailyChecklistEntry> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const entry: DailyChecklistEntry = {};
    const sleepHours = Number(item.sleep_hours);
    if (Number.isFinite(sleepHours)) entry.sleep_hours = sleepHours;
    if (typeof item.phone_submitted === 'boolean') entry.phone_submitted = item.phone_submitted;
    if (item.phone_status === 'submitted' || item.phone_status === 'locker' || item.phone_status === 'off_hold') {
      entry.phone_status = item.phone_status;
    }
    if (typeof item.submitted_at === 'string') entry.submitted_at = item.submitted_at;
    if (Object.keys(entry).length > 0) output[key] = entry;
  }
  return Object.keys(output).length > 0 ? output : undefined;
}

function copyStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const output = Array.from(new Set(value.filter((item): item is string => typeof item === 'string' && item.trim() !== '')));
  return output.length > 0 ? output : undefined;
}

function copyMockReviews(value: unknown): SpecialNoteEnvelope['mock_reviews'] | undefined {
  if (!Array.isArray(value)) return undefined;
  const output = value.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const item = raw as Record<string, unknown>;
    const review = {
      id: typeof item.id === 'string' ? item.id : '',
      testName: typeof item.testName === 'string' ? item.testName : '',
      testDate: typeof item.testDate === 'string' ? item.testDate : '',
      wrongNotes: typeof item.wrongNotes === 'string' ? item.wrongNotes : '',
      actionPlan: typeof item.actionPlan === 'string' ? item.actionPlan : '',
      submittedAt: typeof item.submittedAt === 'string' ? item.submittedAt : '',
    };
    return review.id && review.testName && review.testDate && review.submittedAt ? [review] : [];
  });
  return output.length > 0 ? output : undefined;
}

function buildClientNote(note: SpecialNoteEnvelope): string | undefined {
  const clientNote: SpecialNoteEnvelope = {};
  const pomodoroSessions = copyNumberRecord(note.pomodoro_sessions);
  const pomodoroMinutes = copyNumberRecord(note.pomodoro_minutes);
  const pomodoroDistractions = copyNumberRecord(note.pomodoro_distractions);
  const dailyChecklist = copyChecklistRecord(note.daily_checklist);
  const mockReviews = copyMockReviews(note.mock_reviews);
  const dismissedNotifications = copyStringArray(note.dismissed_notifications);

  if (pomodoroSessions) clientNote.pomodoro_sessions = pomodoroSessions;
  if (pomodoroMinutes) clientNote.pomodoro_minutes = pomodoroMinutes;
  if (pomodoroDistractions) clientNote.pomodoro_distractions = pomodoroDistractions;
  if (dailyChecklist) clientNote.daily_checklist = dailyChecklist;
  if (mockReviews) clientNote.mock_reviews = mockReviews;
  if (dismissedNotifications) clientNote.dismissed_notifications = dismissedNotifications;

  return Object.keys(clientNote).length > 0 ? JSON.stringify(clientNote) : undefined;
}

export function serializeClientActivityNote(specialNote?: string | null): string | undefined {
  return buildClientNote(parseSpecialNoteEnvelope(specialNote));
}

// ─── 학생 활동 상태 분리 (specialNote ↔ student_state) ────────────────────────
// noteText(어드민 메모)는 specialNote에, 학생 활동 상태(뽀모도로/체크리스트/리워드/알림숨김)는
// student_state 컬럼에 둔다. 어드민 메모 저장이 학생 상태를 덮어쓰는 사고를 원천 차단.
// 마이그레이션 안전: 읽기 시 legacy specialNote 봉투 + student_state 를 머지(student_state 우선)하므로
// student_state 가 비어있던 기존 학생도 손실 없이 점진 이관된다.
type StudentLike = { specialNote?: string | null; studentState?: Record<string, unknown> | null };
const ACTIVITY_STATE_KEYS = [
  'pomodoro_sessions', 'pomodoro_minutes', 'pomodoro_distractions', 'daily_checklist', 'mock_reviews', 'dismissed_notifications', 'rewards_log',
];

export function readActivityEnvelope(student: StudentLike): SpecialNoteEnvelope {
  const legacy = parseSpecialNoteEnvelope(student.specialNote);
  const out: SpecialNoteEnvelope = {};
  // 1) legacy specialNote 의 상태 키 (noteText 제외)
  for (const k of ACTIVITY_STATE_KEYS) if (legacy[k] !== undefined) out[k] = legacy[k];
  // 2) student_state 우선 적용
  const st = student.studentState;
  if (st && typeof st === 'object') {
    for (const [k, v] of Object.entries(st)) if (k !== 'noteText') out[k] = v;
  }
  return out;
}

// 상태 봉투를 student_state 컬럼에 기록(noteText 제외). specialNote 는 건드리지 않아 어드민 메모 보존.
export function writeActivityEnvelope(student: StudentLike, env: SpecialNoteEnvelope): void {
  const stateOnly: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(env)) if (k !== 'noteText') stateOnly[k] = v;
  student.studentState = stateOnly;
}

export function serializeClientActivityNoteFromStudent(student: StudentLike): string | undefined {
  return buildClientNote(readActivityEnvelope(student));
}

export function getPomodoroStatsFromStudent(student: StudentLike, dateKey = getSeoulDateKey()) {
  const note = readActivityEnvelope(student);
  return {
    sessions: note.pomodoro_sessions?.[dateKey] || 0,
    minutes: note.pomodoro_minutes?.[dateKey] || 0,
    distractions: note.pomodoro_distractions?.[dateKey] || 0,
  };
}

export function getPomodoroStats(specialNote?: string | null, dateKey = getSeoulDateKey()) {
  const note = parseSpecialNoteEnvelope(specialNote);
  return {
    sessions: note.pomodoro_sessions?.[dateKey] || 0,
    minutes: note.pomodoro_minutes?.[dateKey] || 0,
  };
}

export function getDailyChecklist(specialNote?: string | null, dateKey = getSeoulDateKey()) {
  return parseSpecialNoteEnvelope(specialNote).daily_checklist?.[dateKey] || null;
}

// 관리자용: specialNote + student_state 머지 후 오늘 체크리스트 조회
export function getDailyChecklistFromStudent(student: StudentLike, dateKey = getSeoulDateKey()): DailyChecklistEntry | null {
  return readActivityEnvelope(student).daily_checklist?.[dateKey] || null;
}

export function getPlanDailyCompletion(plan: DetailedPlan, dateKey: string): PlanDailyCompletion {
  const completion = plan.dailyCompletions?.[dateKey];
  if (!completion?.isCompleted) return { isCompleted: false };
  return {
    isCompleted: true,
    ...(typeof completion.actualAmount === 'number' ? { actualAmount: completion.actualAmount } : {}),
    ...(completion.completedAt ? { completedAt: completion.completedAt } : {}),
  };
}
