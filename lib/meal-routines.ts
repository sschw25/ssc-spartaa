import { getAppSetting, getMealPlans, notifyMealPlan, saveMealPlan, setAppSetting } from './store';
import { CAMPUSES, MEAL_DAYS, MEAL_KINDS, mondayOf } from './meal';
import type { MealDay, MealKind, MealPlan } from './types/student';

export type MealRoutineNotifyMode = 'none' | 'on_create' | 'scheduled';
export type MealRoutineDeadlineBase = 'create' | 'target';

export interface MealPlanRoutineTemplate {
  id: string;
  name: string;
  active: boolean;
  campus?: string;
  meals: MealKind[];
  closedDays: MealDay[];
  lunchPrice?: number;
  dinnerPrice?: number;
  createDay: number;
  createTime: string;
  targetWeekOffset: number;
  deadlineBase: MealRoutineDeadlineBase;
  deadlineDay: number;
  deadlineTime: string;
  notifyMode: MealRoutineNotifyMode;
  notifyDay?: number;
  notifyTime?: string;
  lastCreateKey?: string;
  lastNotifyKey?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MealRoutineRunResult {
  templateId: string;
  templateName: string;
  campus?: string;
  targetWeekStart: string;
  created: boolean;
  notified: boolean;
  skippedReason?: string;
  plan?: MealPlan;
}

const SETTINGS_KEY = 'meal_plan_routines';
const HM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isMealKindArray(value: unknown): value is MealKind[] {
  return Array.isArray(value) && value.some((v) => MEAL_KINDS.includes(v as MealKind));
}

function sanitizeMealKinds(value: unknown): MealKind[] {
  const values = isMealKindArray(value) ? value : ['lunch'];
  const unique = MEAL_KINDS.filter((kind) => values.includes(kind));
  return unique.length ? unique : ['lunch'];
}

function sanitizeClosedDays(value: unknown): MealDay[] {
  if (!Array.isArray(value)) return [];
  return MEAL_DAYS.filter((day) => value.includes(day));
}

function sanitizeDay(value: unknown, fallback: number): number {
  const day = Number(value);
  return Number.isInteger(day) && day >= 0 && day <= 6 ? day : fallback;
}

function sanitizeTime(value: unknown, fallback: string): string {
  const text = String(value ?? '').trim();
  return HM_RE.test(text) ? text : fallback;
}

function sanitizePrice(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
}

function sanitizeCampus(value: unknown): string | undefined {
  const campus = String(value ?? '').trim();
  return CAMPUSES.includes(campus) ? campus : undefined;
}

function dayOffsetFromMonday(day: number): number {
  return day === 0 ? 6 : day - 1;
}

function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function ymdDayOfWeek(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return 1;
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function seoulYmd(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function seoulHm(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function seoulDateTimeToIso(ymd: string, hm: string): string {
  return new Date(`${ymd}T${hm}:00+09:00`).toISOString();
}

function isDue(todayYmd: string, nowHm: string, day: number, hm: string): boolean {
  return ymdDayOfWeek(todayYmd) === day && nowHm >= hm;
}

export function defaultMealRoutineTemplate(campus?: string): MealPlanRoutineTemplate {
  const now = new Date().toISOString();
  return {
    id: `meal_tpl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: campus ? `${campus} 다음 주 도시락` : '다음 주 도시락',
    active: true,
    campus: sanitizeCampus(campus),
    meals: ['lunch'],
    closedDays: [],
    createDay: 1,
    createTime: '14:00',
    targetWeekOffset: 1,
    deadlineBase: 'create',
    deadlineDay: 5,
    deadlineTime: '14:00',
    notifyMode: 'none',
    createdAt: now,
    updatedAt: now,
  };
}

export function sanitizeMealRoutineTemplate(raw: unknown): MealPlanRoutineTemplate {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const defaults = defaultMealRoutineTemplate(sanitizeCampus(source.campus));
  const notifyMode = source.notifyMode === 'on_create' || source.notifyMode === 'scheduled'
    ? source.notifyMode
    : 'none';
  const deadlineBase = source.deadlineBase === 'target' ? 'target' : 'create';
  return {
    ...defaults,
    id: String(source.id || defaults.id),
    name: String(source.name || defaults.name).trim().slice(0, 80) || defaults.name,
    active: source.active !== false,
    campus: sanitizeCampus(source.campus),
    meals: sanitizeMealKinds(source.meals),
    closedDays: sanitizeClosedDays(source.closedDays),
    lunchPrice: sanitizePrice(source.lunchPrice),
    dinnerPrice: sanitizePrice(source.dinnerPrice),
    createDay: sanitizeDay(source.createDay, 1),
    createTime: sanitizeTime(source.createTime, '14:00'),
    targetWeekOffset: Math.max(0, Math.min(8, Number(source.targetWeekOffset) || 1)),
    deadlineBase,
    deadlineDay: sanitizeDay(source.deadlineDay, 5),
    deadlineTime: sanitizeTime(source.deadlineTime, '14:00'),
    notifyMode,
    notifyDay: sanitizeDay(source.notifyDay, 1),
    notifyTime: sanitizeTime(source.notifyTime, '14:00'),
    lastCreateKey: typeof source.lastCreateKey === 'string' ? source.lastCreateKey : undefined,
    lastNotifyKey: typeof source.lastNotifyKey === 'string' ? source.lastNotifyKey : undefined,
    createdAt: typeof source.createdAt === 'string' ? source.createdAt : defaults.createdAt,
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : defaults.updatedAt,
  };
}

export async function getMealRoutineTemplates(): Promise<MealPlanRoutineTemplate[]> {
  const value = await getAppSetting(SETTINGS_KEY);
  const templates = Array.isArray(value?.templates) ? value.templates : [];
  return templates.map(sanitizeMealRoutineTemplate);
}

export async function saveMealRoutineTemplate(input: unknown): Promise<MealPlanRoutineTemplate> {
  const templates = await getMealRoutineTemplates();
  const now = new Date().toISOString();
  const incoming = sanitizeMealRoutineTemplate(input);
  const existing = templates.find((template) => template.id === incoming.id);
  const saved: MealPlanRoutineTemplate = {
    ...incoming,
    createdAt: existing?.createdAt || incoming.createdAt || now,
    lastCreateKey: existing?.lastCreateKey,
    lastNotifyKey: existing?.lastNotifyKey,
    updatedAt: now,
  };
  const next = existing
    ? templates.map((template) => (template.id === saved.id ? saved : template))
    : [...templates, saved];
  await setAppSetting(SETTINGS_KEY, { templates: next });
  return saved;
}

export async function deleteMealRoutineTemplate(id: string): Promise<void> {
  const templates = await getMealRoutineTemplates();
  await setAppSetting(SETTINGS_KEY, { templates: templates.filter((template) => template.id !== id) });
}

async function persistTemplates(templates: MealPlanRoutineTemplate[]): Promise<void> {
  await setAppSetting(SETTINGS_KEY, { templates });
}

function sameCampus(a?: string, b?: string): boolean {
  return (a || 'all') === (b || 'all');
}

function planDeadlineIso(template: MealPlanRoutineTemplate, createWeekStart: string, targetWeekStart: string): string {
  const baseWeekStart = template.deadlineBase === 'target' ? targetWeekStart : createWeekStart;
  const deadlineYmd = addDays(baseWeekStart, dayOffsetFromMonday(template.deadlineDay));
  return seoulDateTimeToIso(deadlineYmd, template.deadlineTime);
}

export async function runDueMealRoutineTemplates(now = new Date()): Promise<MealRoutineRunResult[]> {
  const templates = await getMealRoutineTemplates();
  const plans = await getMealPlans();
  const todayYmd = seoulYmd(now);
  const nowHm = seoulHm(now);
  const createWeekStart = mondayOf(todayYmd);
  const nowIso = now.toISOString();
  const results: MealRoutineRunResult[] = [];
  let changed = false;

  for (const template of templates) {
    if (!template.active) continue;
    const targetWeekStart = addDays(createWeekStart, template.targetWeekOffset * 7);
    const createKey = `${template.id}:${targetWeekStart}`;
    // 한 주·한 캠퍼스에는 라운드 1개만 존재해야 함(끼니는 한 플랜 안에서 표현).
    // meals까지 비교하면 끼니가 다른 기존(수동) 플랜을 못 찾아 같은 주에 중복 라운드를 생성하므로 제외.
    let plan = plans.find((candidate) =>
      candidate.weekStart === targetWeekStart &&
      sameCampus(candidate.campus, template.campus)
    );

    if (isDue(todayYmd, nowHm, template.createDay, template.createTime) && template.lastCreateKey !== createKey) {
      if (!plan) {
        plan = await saveMealPlan({
          id: `meal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          weekStart: targetWeekStart,
          meals: template.meals,
          campus: template.campus,
          deadline: planDeadlineIso(template, createWeekStart, targetWeekStart),
          lunchPrice: template.lunchPrice,
          dinnerPrice: template.dinnerPrice,
          closedDays: template.closedDays,
          createdAt: nowIso,
          notifiedAt: template.notifyMode === 'on_create' ? nowIso : undefined,
        });
        plans.push(plan);
        results.push({ templateId: template.id, templateName: template.name, campus: template.campus, targetWeekStart, created: true, notified: template.notifyMode === 'on_create', plan });
      } else if (template.notifyMode === 'on_create' && !plan.notifiedAt) {
        // 이미 라운드가 있지만 아직 미발송이면 on_create 알림은 발송(누락 방지)
        plan = await notifyMealPlan(plan.id, nowIso);
        results.push({ templateId: template.id, templateName: template.name, campus: template.campus, targetWeekStart, created: false, notified: true, skippedReason: 'already_exists', plan });
      } else {
        results.push({ templateId: template.id, templateName: template.name, campus: template.campus, targetWeekStart, created: false, notified: false, skippedReason: 'already_exists', plan });
      }
      template.lastCreateKey = createKey;
      template.updatedAt = nowIso;
      changed = true;
    }

    const notifyKey = `${template.id}:${targetWeekStart}`;
    if (
      template.notifyMode === 'scheduled' &&
      plan &&
      !plan.notifiedAt &&
      template.lastNotifyKey !== notifyKey &&
      isDue(todayYmd, nowHm, template.notifyDay ?? template.createDay, template.notifyTime || template.createTime)
    ) {
      const notifiedPlan = await notifyMealPlan(plan.id, nowIso);
      results.push({ templateId: template.id, templateName: template.name, campus: template.campus, targetWeekStart, created: false, notified: true, plan: notifiedPlan });
      template.lastNotifyKey = notifyKey;
      template.updatedAt = nowIso;
      changed = true;
    }
  }

  if (changed) await persistTemplates(templates);
  return results;
}

