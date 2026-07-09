// 도시락 신청 — 단일 진실 소스 (요일/끼니 라벨, 주차 계산, 마감 판정, 집계).
// 관리자 페이지(/admin/meals)·인박스·학생 리포트 notice·API 가 모두 이 모듈을 사용.
import type { MealDay, MealKind, MealOrder, MealPlan } from './types/student';

export const MEAL_DAYS: MealDay[] = ['mon', 'tue', 'wed', 'thu', 'fri'];

export const MEAL_DAY_LABELS: Record<MealDay, string> = {
  mon: '월', tue: '화', wed: '수', thu: '목', fri: '금',
};

export const MEAL_KINDS: MealKind[] = ['lunch', 'dinner'];

export const MEAL_KIND_LABELS: Record<MealKind, string> = {
  lunch: '점심', dinner: '저녁',
};

// 센터 라벨 — 다른 관리자 화면과 동일 규칙
export const CAMPUSES = ['wonju', 'chuncheon', 'chungju'];
export function getCampusLabel(c?: string): string {
  return ({ wonju: '원주', chuncheon: '춘천', chungju: '충주' } as Record<string, string>)[c || ''] ?? '기타';
}

export function isMealKind(v: unknown): v is MealKind {
  return v === 'lunch' || v === 'dinner';
}
export function isMealDay(v: unknown): v is MealDay {
  return typeof v === 'string' && (MEAL_DAYS as string[]).includes(v);
}

// 임의 날짜가 속한 주의 월요일 (YYYY-MM-DD, KST 무관 — date-only 계산)
export function mondayOf(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay(); // 0=일 .. 6=토
  const diff = dow === 0 ? -6 : 1 - dow; // 월요일까지의 보정
  dt.setUTCDate(dt.getUTCDate() + diff);
  return dt.toISOString().slice(0, 10);
}

// date-only 일 더하기 (KST 무관)
export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// 라운드 기본 마감 = 주 시작(월) 3일 전 14:00 (datetime-local 값 형식)
export function deadlineForMealWeek(weekStart: string): string {
  return `${addDaysYmd(weekStart, -3)}T14:00`;
}

// datetime-local(로컬 표기) 값을 KST 기준 절대 ISO 로 변환
export function toKstIsoFromDateTimeLocal(value: string): string | undefined {
  if (!value) return undefined;
  return new Date(`${value}:00+09:00`).toISOString();
}

// "6/30~7/4" 형태의 주 범위 라벨 (월~금)
export function weekRangeLabel(weekStart: string): string {
  const [y, m, d] = weekStart.split('-').map(Number);
  if (!y || !m || !d) return weekStart;
  const mon = new Date(Date.UTC(y, m - 1, d));
  const fri = new Date(mon);
  fri.setUTCDate(fri.getUTCDate() + 4);
  return `${mon.getUTCMonth() + 1}/${mon.getUTCDate()}~${fri.getUTCMonth() + 1}/${fri.getUTCDate()}`;
}

// 마감 지났는지 (deadline 없으면 항상 false = 상시 신청 가능)
export function isPastDeadline(plan: Pick<MealPlan, 'deadline'>, now: Date = new Date()): boolean {
  if (!plan.deadline) return false;
  const t = Date.parse(plan.deadline);
  return Number.isFinite(t) && now.getTime() > t;
}

// 마감 일시 표시 라벨
export function formatDeadline(deadline?: string): string {
  if (!deadline) return '';
  const t = Date.parse(deadline);
  if (!Number.isFinite(t)) return '';
  return new Date(t).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// 휴무 요일인지
export function isClosedDay(plan: Pick<MealPlan, 'closedDays'> | undefined, day: MealDay): boolean {
  return Boolean(plan?.closedDays?.includes(day));
}

// 특정 날·끼니를 학생이 먹는지 (인쇄표 셀: true=공란, false=X)
export function eatsOn(order: MealOrder | undefined, day: MealDay, kind: MealKind): boolean {
  return Boolean(order?.selections?.[day]?.[kind]);
}

// 해당 끼니를 한 번이라도 신청했는지 (인쇄표 행 포함 여부). closedDays 는 제외.
export function orderHasMeal(order: MealOrder | undefined, kind: MealKind, closedDays?: MealDay[]): boolean {
  if (!order) return false;
  return MEAL_DAYS.some((d) => !(closedDays || []).includes(d) && eatsOn(order, d, kind));
}

// 끼니별 신청 수 집계 (정산). closedDays 는 제외.
export function mealCounts(order: MealOrder | undefined, closedDays?: MealDay[]): Record<MealKind, number> {
  const counts: Record<MealKind, number> = { lunch: 0, dinner: 0 };
  if (!order) return counts;
  for (const d of MEAL_DAYS) {
    if ((closedDays || []).includes(d)) continue;
    if (eatsOn(order, d, 'lunch')) counts.lunch += 1;
    if (eatsOn(order, d, 'dinner')) counts.dinner += 1;
  }
  return counts;
}

// 한 끼 추가/제거를 반영한 새 selections (불변)
export function withSelection(
  selections: MealOrder['selections'],
  day: MealDay,
  kind: MealKind,
  on: boolean,
): MealOrder['selections'] {
  const next = { ...(selections || {}) };
  const cell = { ...(next[day] || {}) };
  if (on) cell[kind] = true;
  else delete cell[kind];
  if (Object.keys(cell).length === 0) delete next[day];
  else next[day] = cell;
  return next;
}
