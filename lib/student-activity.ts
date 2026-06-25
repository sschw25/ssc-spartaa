import type { DetailedPlan } from '@/lib/types/student';

export type DailyChecklistEntry = {
  sleep_hours?: number;
  phone_submitted?: boolean;
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
  daily_checklist?: Record<string, DailyChecklistEntry>;
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

export function serializeClientActivityNote(specialNote?: string | null): string | undefined {
  const note = parseSpecialNoteEnvelope(specialNote);
  const clientNote: SpecialNoteEnvelope = {};

  const pomodoroSessions = copyNumberRecord(note.pomodoro_sessions);
  const pomodoroMinutes = copyNumberRecord(note.pomodoro_minutes);
  const dailyChecklist = copyChecklistRecord(note.daily_checklist);
  const dismissedNotifications = copyStringArray(note.dismissed_notifications);

  if (pomodoroSessions) clientNote.pomodoro_sessions = pomodoroSessions;
  if (pomodoroMinutes) clientNote.pomodoro_minutes = pomodoroMinutes;
  if (dailyChecklist) clientNote.daily_checklist = dailyChecklist;
  if (dismissedNotifications) clientNote.dismissed_notifications = dismissedNotifications;

  return Object.keys(clientNote).length > 0 ? JSON.stringify(clientNote) : undefined;
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

export function getPlanDailyCompletion(plan: DetailedPlan, dateKey: string): PlanDailyCompletion {
  const completion = plan.dailyCompletions?.[dateKey];
  if (!completion?.isCompleted) return { isCompleted: false };
  return {
    isCompleted: true,
    ...(typeof completion.actualAmount === 'number' ? { actualAmount: completion.actualAmount } : {}),
    ...(completion.completedAt ? { completedAt: completion.completedAt } : {}),
  };
}
