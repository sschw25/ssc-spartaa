// 상담 예약 스케줄 설정 & 순수 가용성 로직.
// - 센터별 운영 요일 + 요일별 담당자(라벨)
// - 15분 슬롯(휴식 2회 제외)
// - "앞 요일부터 채우고, 다 차면 다음 요일 개방"(순차 오픈) 가용성 계산
// 별도 테이블/마이그레이션 없이 app_settings 예약 원장(lib/store)과 함께 동작한다.

import type { ConsultationBooking } from './types/student';

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri';

export const WEEKDAY_LABEL: Record<Weekday, string> = {
  mon: '월',
  tue: '화',
  wed: '수',
  thu: '목',
  fri: '금',
};

// 상담 슬롯 시작 시각 (월~금 공통). 15분 상담 기준.
export const CONSULTATION_SLOT_TIMES: string[] = [
  '14:00', '14:15', '14:30', '14:45',
  '15:15', '15:30', '15:45',
  '16:00', '16:30',
];

export type ConsultationCampus = 'wonju' | 'chuncheon' | 'chungju';

interface CampusDayConfig {
  weekday: Weekday;
  counselor: string;
  // 해당 요일 마지막 슬롯(포함). 부원장이 원거리 센터를 오가는 날은 일찍 마감한다.
  // 예: 춘천(수)·충주(목) 부원장 상담은 15:30 시작까지만(15:45 종료).
  lastSlot?: string;
}

interface CampusConsultationConfig {
  // 운영 요일 — 정의된 순서대로 "앞 요일부터" 채워진다.
  days: CampusDayConfig[];
}

// 센터별 운영 요일 + 담당자 라벨.
// 부원장은 3센터를 오가며 지정 요일에 진행. 그 외 요일은 센터 자체 담당(센터장/매니저).
export const CAMPUS_CONSULTATION: Record<ConsultationCampus, CampusConsultationConfig> = {
  wonju: {
    days: [
      { weekday: 'mon', counselor: '부원장' }, // 원주는 부원장 베이스 — 특례 없음(전 슬롯)
      { weekday: 'tue', counselor: '원주센터장' },
    ],
  },
  chungju: {
    days: [
      { weekday: 'mon', counselor: '충주센터장' },
      { weekday: 'tue', counselor: '충주센터장' },
      { weekday: 'wed', counselor: '충주센터장' },
      { weekday: 'thu', counselor: '부원장', lastSlot: '15:30' }, // 부원장 출장일 — 15:30까지만
      { weekday: 'fri', counselor: '충주센터장' },
    ],
  },
  chuncheon: {
    days: [
      { weekday: 'mon', counselor: '춘천센터장' },
      { weekday: 'tue', counselor: '춘천센터장' },
      { weekday: 'wed', counselor: '부원장', lastSlot: '15:30' }, // 부원장 출장일 — 15:30까지만
      { weekday: 'thu', counselor: '춘천센터장' },
      { weekday: 'fri', counselor: '춘천센터장' },
    ],
  },
};

// 예약 가용성을 따질 최대 일수(앞으로 N일). 운영 요일이 드물어도 충분히 커버.
const HORIZON_DAYS = 35;

export function isConsultationCampus(campus: string): campus is ConsultationCampus {
  return campus === 'wonju' || campus === 'chuncheon' || campus === 'chungju';
}

// YYYY-MM-DD → 요일 키(월~금만, 주말은 null). 캘린더 날짜의 요일은 TZ 무관 → UTC 자정 기준 계산.
export function getWeekdayKey(dateStr: string): Weekday | null {
  const day = new Date(`${dateStr}T00:00:00Z`).getUTCDay(); // 0=일 .. 6=토
  switch (day) {
    case 1: return 'mon';
    case 2: return 'tue';
    case 3: return 'wed';
    case 4: return 'thu';
    case 5: return 'fri';
    default: return null;
  }
}

function addDaysStr(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dayConfigFor(campus: ConsultationCampus, weekday: Weekday): CampusDayConfig | null {
  return CAMPUS_CONSULTATION[campus].days.find((d) => d.weekday === weekday) || null;
}

function counselorFor(campus: ConsultationCampus, weekday: Weekday): string | null {
  return dayConfigFor(campus, weekday)?.counselor ?? null;
}

// 해당 (센터, 요일)에 실제 운영하는 슬롯 시각 목록. lastSlot 특례가 있으면 그 시각(포함)까지만.
export function slotsForDay(campus: ConsultationCampus, weekday: Weekday): string[] {
  const cfg = dayConfigFor(campus, weekday);
  if (!cfg) return [];
  if (!cfg.lastSlot) return CONSULTATION_SLOT_TIMES;
  return CONSULTATION_SLOT_TIMES.filter((s) => s <= cfg.lastSlot!);
}

export interface OperatingDate {
  date: string;       // YYYY-MM-DD
  weekday: Weekday;
  counselor: string;
}

// fromDate(포함)부터 앞으로 운영 요일을 순서대로 나열한다.
export function listUpcomingOperatingDates(
  campus: ConsultationCampus,
  fromDate: string,
): OperatingDate[] {
  const out: OperatingDate[] = [];
  for (let i = 0; i < HORIZON_DAYS; i++) {
    const date = addDaysStr(fromDate, i);
    const weekday = getWeekdayKey(date);
    if (!weekday) continue;
    const counselor = counselorFor(campus, weekday);
    if (!counselor) continue;
    out.push({ date, weekday, counselor });
  }
  return out;
}

// 활성 예약(취소 제외)만 슬롯 점유로 간주.
function activeBookingsOn(bookings: ConsultationBooking[], date: string): Set<string> {
  const taken = new Set<string>();
  for (const b of bookings) {
    if (b.status !== 'booked') continue;
    if (b.kind !== 'regular') continue; // 추가/긴급(extra)은 슬롯 점유 아님
    if (b.date === date && b.slot) taken.add(b.slot);
  }
  return taken;
}

// 오늘(todayDate)에 한해 이미 지난 시각 슬롯은 제외하기 위한 비교 (HH:MM 문자열 비교로 충분).
function slotIsFuture(date: string, slot: string, todayDate: string, nowHHMM: string): boolean {
  if (date > todayDate) return true;
  if (date < todayDate) return false;
  return slot > nowHHMM;
}

export interface OpenDateAvailability {
  date: string;
  weekday: Weekday;
  counselor: string;
  freeSlots: string[];
  takenSlots: string[];
  isToday: boolean;
}

/**
 * 순차 오픈 규칙: 앞 운영 요일부터 채우고, 그 날이 다 차면 다음 운영 요일이 개방된다.
 * → 빈 슬롯이 남은 "가장 이른 운영일" 하나만 학생에게 개방한다.
 * 반환: 개방된 날짜+빈 슬롯, 가용일이 없으면 null.
 */
export function computeOpenDate(
  campus: ConsultationCampus,
  todayDate: string,
  nowHHMM: string,
  bookings: ConsultationBooking[],
): OpenDateAvailability | null {
  const dates = listUpcomingOperatingDates(campus, todayDate);
  for (const od of dates) {
    const daySlots = slotsForDay(campus, od.weekday);
    const taken = activeBookingsOn(bookings, od.date);
    const freeSlots = daySlots.filter(
      (s) => !taken.has(s) && slotIsFuture(od.date, s, todayDate, nowHHMM),
    );
    if (freeSlots.length > 0) {
      return {
        date: od.date,
        weekday: od.weekday,
        counselor: od.counselor,
        freeSlots,
        takenSlots: daySlots.filter((s) => taken.has(s)),
        isToday: od.date === todayDate,
      };
    }
  }
  return null;
}

// 해당 날짜가 속한 주의 월요일(YYYY-MM-DD).
function mondayOf(dateStr: string): string {
  const dow = new Date(`${dateStr}T00:00:00Z`).getUTCDay(); // 0=일 .. 6=토
  const diff = dow === 0 ? -6 : 1 - dow;
  return addDaysStr(dateStr, diff);
}

export interface CalendarDay {
  date: string;
  weekday: Weekday;
  counselor: string;
  freeSlots: string[];   // 예약 가능한 빈 시각
  takenSlots: string[];  // 이미 찬 시각
  isToday: boolean;
  full: boolean;         // 빈 슬롯이 0이면 true(마감)
}

/**
 * 이번 주 ~ 다음 주(다음 주 일요일까지)의 운영일 캘린더.
 * 과거 날짜와 오늘의 지난 시각은 제외하고, 각 운영일의 빈/찬 슬롯을 함께 반환한다.
 * 학생이 원하는 날짜·시간을 직접 골라 신청할 수 있도록 단일 개방일 제한 없이 모두 노출한다.
 */
export function getBookableCalendar(
  campus: ConsultationCampus,
  todayDate: string,
  nowHHMM: string,
  bookings: ConsultationBooking[],
): CalendarDay[] {
  const horizonEnd = addDaysStr(mondayOf(todayDate), 13); // 다음 주 일요일
  const out: CalendarDay[] = [];
  for (let date = todayDate; date <= horizonEnd; date = addDaysStr(date, 1)) {
    const weekday = getWeekdayKey(date);
    if (!weekday) continue;
    const counselor = counselorFor(campus, weekday);
    if (!counselor) continue;
    const daySlots = slotsForDay(campus, weekday);
    const taken = activeBookingsOn(bookings, date);
    const freeSlots = daySlots.filter(
      (s) => !taken.has(s) && slotIsFuture(date, s, todayDate, nowHHMM),
    );
    out.push({
      date,
      weekday,
      counselor,
      freeSlots,
      takenSlots: daySlots.filter((s) => taken.has(s)),
      isToday: date === todayDate,
      full: freeSlots.length === 0,
    });
  }
  return out;
}

// 특정 (날짜, 슬롯)이 비어있는지 — 예약 생성 직전 재검증용.
export function isSlotFree(
  date: string,
  slot: string,
  bookings: ConsultationBooking[],
): boolean {
  return !activeBookingsOn(bookings, date).has(slot);
}

// 관리자 화면용: 운영일별 슬롯 점유 현황(예약자 매핑).
export interface DaySlotGrid {
  date: string;
  weekday: Weekday;
  counselor: string;
  slots: Array<{ slot: string; booking: ConsultationBooking | null }>;
}

export function buildDaySlotGrid(
  campus: ConsultationCampus,
  fromDate: string,
  bookings: ConsultationBooking[],
): DaySlotGrid[] {
  const dates = listUpcomingOperatingDates(campus, fromDate);
  return dates.map((od) => {
    const dayBookings = bookings.filter(
      (b) => b.status === 'booked' && b.kind === 'regular' && b.date === od.date,
    );
    return {
      date: od.date,
      weekday: od.weekday,
      counselor: od.counselor,
      slots: slotsForDay(campus, od.weekday).map((slot) => ({
        slot,
        booking: dayBookings.find((b) => b.slot === slot) || null,
      })),
    };
  });
}
