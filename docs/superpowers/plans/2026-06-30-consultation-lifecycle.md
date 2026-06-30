# 상담 라이프사이클 완성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 상담 예약의 앞뒤(휴무 차단·완료/노쇼·결과기록·리마인더)를 채워 예약→상담→기록→다음진도의 전체 흐름을 데이터로 완성한다.

**Architecture:** 마이그레이션 제로. 차단은 `app_settings` 신규 키, 노쇼/연결은 `ConsultationBooking` 필드 추가, 결과기록은 기존 `ConsultationLog`(consultation_logs JSONB) 재사용. 순수로직은 `lib/`에 두고 `scripts/verify-*.mts`로 검증, API/UI는 `tsc --noEmit` + `next build` + 수동확인.

**Tech Stack:** Next.js(App Router) API routes, TypeScript 5.7, app_settings 키-값 원장(`lib/store.ts`), GitHub Actions 크론(`scheduled-crons.yml` + `CRON_SECRET`). 테스트 러너 없음 → 순수함수는 `npx tsx scripts/verify-*.mts` 어서션 스크립트로 검증.

## Global Constraints

- 신규 Supabase 테이블/ALTER 금지 — `app_settings` 키-값 + 학생 `consultation_logs` JSONB만 사용.
- 노쇼는 **기록만** — 패널티(재예약 제한·벌점) 없음. 단 `resolvedBy` 등 확장 필드는 남긴다.
- 리마인더는 인앱(다음 접속 시 노출)만 — 카톡/문자 등 외부 푸시 금지.
- 모든 날짜 비교는 KST 기준 `YYYY-MM-DD`. (기존 `kstToday()` 패턴: `new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' })`)
- 슬롯 시각은 `HH:MM` 문자열, 시각 비교는 문자열 비교로 충분.
- 권한: campus_admin=자기 센터, master(`campus==='all'`)=전체.
- 기존 순수함수 시그니처 변경 시 blackout 인자는 **선택적·기본 빈배열**로 추가해 하위호환 유지.
- import 별칭 `@/*` = 레포 루트.
- 커밋 메시지는 한국어, 기존 컨벤션(`feat:`/`docs:` 등) 따름.

---

### Task 1: BlackoutEntry 타입 + 차단 원장 store 함수

**Files:**
- Modify: `lib/types/student.ts` (ConsultationBooking 근처에 타입 추가)
- Modify: `lib/store.ts:135-198` (상담 예약 원장 블록 끝에 차단 함수 추가)
- Test: `scripts/verify-consultation-blackout-store.mts` (create)

**Interfaces:**
- Produces:
  - `export interface BlackoutEntry { date: string; scope: 'fullday' | string[]; reason?: string }` (in `lib/types/student.ts`)
  - `getConsultationBlackouts(campus: string): Promise<BlackoutEntry[]>` (in `lib/store.ts`)
  - `setConsultationBlackouts(campus: string, entries: BlackoutEntry[]): Promise<void>` (in `lib/store.ts`)

- [ ] **Step 1: 타입 추가**

`lib/types/student.ts`의 `ConsultationBooking` 인터페이스 바로 위에 추가:

```typescript
// 상담 담당자 휴무/출장으로 특정 날짜(또는 일부 슬롯)를 예약 불가로 막는 차단 항목.
// 센터별 app_settings 키 consultation_blackouts:{campus} 에 JSON 배열로 보관(마이그레이션 불필요).
export interface BlackoutEntry {
  date: string;             // YYYY-MM-DD
  scope: 'fullday' | string[]; // 'fullday'=그날 전체, string[]=막을 슬롯 시각('HH:MM') 목록
  reason?: string;          // 사유(관리자 표시용)
}
```

- [ ] **Step 2: store 함수 추가**

`lib/store.ts`의 `patchConsultationBooking`(라인 198) 바로 아래에 추가. 파일 상단 import에 `BlackoutEntry` 추가:

```typescript
// (파일 상단 import 라인에 BlackoutEntry 추가)
// import { Student, ..., ConsultationBooking, BlackoutEntry } from './types/student';

// ── 상담 차단(휴무/출장) 원장 (센터별 app_settings 키-값 JSON 배열) ──
const CONSULTATION_BLACKOUTS_KEY_PREFIX = 'consultation_blackouts:';

export async function getConsultationBlackouts(campus: string): Promise<BlackoutEntry[]> {
  const value = await getAppSetting(`${CONSULTATION_BLACKOUTS_KEY_PREFIX}${campus}`);
  return Array.isArray(value) ? (value as BlackoutEntry[]) : [];
}

export async function setConsultationBlackouts(campus: string, entries: BlackoutEntry[]): Promise<void> {
  await setAppSetting(`${CONSULTATION_BLACKOUTS_KEY_PREFIX}${campus}`, entries);
}
```

- [ ] **Step 3: 검증 스크립트 작성**

`scripts/verify-consultation-blackout-store.mts` 생성 (local-json 모드로 라운드트립 확인):

```typescript
import assert from 'node:assert';
import { getConsultationBlackouts, setConsultationBlackouts } from '../lib/store';
import type { BlackoutEntry } from '../lib/types/student';

async function main() {
  const campus = '__verify_blackout__';
  const entries: BlackoutEntry[] = [
    { date: '2026-07-01', scope: 'fullday', reason: '부원장 출장' },
    { date: '2026-07-02', scope: ['16:00', '16:30'], reason: '오후 회의' },
  ];
  await setConsultationBlackouts(campus, entries);
  const read = await getConsultationBlackouts(campus);
  assert.deepStrictEqual(read, entries, '라운드트립 불일치');

  await setConsultationBlackouts(campus, []);
  const empty = await getConsultationBlackouts(campus);
  assert.deepStrictEqual(empty, [], '빈 배열 저장 실패');

  console.log('PASS: blackout store 라운드트립');
}
main().catch((e) => { console.error('FAIL', e); process.exit(1); });
```

- [ ] **Step 4: 검증 실행**

Run: `npx tsx scripts/verify-consultation-blackout-store.mts`
Expected: `PASS: blackout store 라운드트립` (Supabase env 없으면 local-json으로 동작)

- [ ] **Step 5: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add lib/types/student.ts lib/store.ts scripts/verify-consultation-blackout-store.mts
git commit -m "feat: 상담 차단(휴무/출장) 원장 타입·store 함수 추가"
```

---

### Task 2: consultation-schedule 차단 반영 순수함수

**Files:**
- Modify: `lib/consultation-schedule.ts` (헬퍼 추가 + `getBookableCalendar`·`buildDaySlotGrid` 시그니처 확장)
- Test: `scripts/verify-consultation-blackout-logic.mts` (create)

**Interfaces:**
- Consumes: `BlackoutEntry` (Task 1), 기존 `slotsForDay`/`activeBookingsOn`/`slotIsFuture`.
- Produces:
  - `findBlackout(blackouts: BlackoutEntry[], date: string): BlackoutEntry | undefined`
  - `availableSlotsForDate(campus: ConsultationCampus, weekday: Weekday, date: string, blackouts: BlackoutEntry[]): string[]` — slotsForDay에서 차단 슬롯 제거(fullday면 빈배열)
  - `getBookableCalendar(campus, todayDate, nowHHMM, bookings, blackouts?: BlackoutEntry[])` — blackouts 선택적, 기본 `[]`
  - `buildDaySlotGrid(campus, fromDate, bookings, blackouts?: BlackoutEntry[])` — blackouts 선택적, 기본 `[]`

- [ ] **Step 1: 헬퍼 추가**

`lib/consultation-schedule.ts`에서 `slotsForDay`(라인 105-110) 바로 아래에 추가. 파일 상단 import에 `BlackoutEntry` 추가:

```typescript
import type { ConsultationBooking, BlackoutEntry } from './types/student';

// 해당 날짜의 차단 항목 조회(없으면 undefined).
export function findBlackout(blackouts: BlackoutEntry[], date: string): BlackoutEntry | undefined {
  return blackouts.find((b) => b.date === date);
}

// (센터, 요일, 날짜)의 실제 예약 가능 슬롯 — 운영 슬롯에서 차단분을 제거.
// fullday 차단이면 빈 배열, 슬롯 목록 차단이면 그 시각들만 제거.
export function availableSlotsForDate(
  campus: ConsultationCampus,
  weekday: Weekday,
  date: string,
  blackouts: BlackoutEntry[],
): string[] {
  const base = slotsForDay(campus, weekday);
  const bo = findBlackout(blackouts, date);
  if (!bo) return base;
  if (bo.scope === 'fullday') return [];
  const blocked = new Set(bo.scope);
  return base.filter((s) => !blocked.has(s));
}
```

- [ ] **Step 2: getBookableCalendar 시그니처·로직 확장**

`getBookableCalendar`(라인 216-245)를 수정 — `blackouts` 파라미터 추가, `slotsForDay` 호출을 `availableSlotsForDate`로 교체:

```typescript
export function getBookableCalendar(
  campus: ConsultationCampus,
  todayDate: string,
  nowHHMM: string,
  bookings: ConsultationBooking[],
  blackouts: BlackoutEntry[] = [],
): CalendarDay[] {
  const horizonEnd = addDaysStr(mondayOf(todayDate), 13); // 다음 주 일요일
  const out: CalendarDay[] = [];
  for (let date = todayDate; date <= horizonEnd; date = addDaysStr(date, 1)) {
    const weekday = getWeekdayKey(date);
    if (!weekday) continue;
    const counselor = counselorFor(campus, weekday);
    if (!counselor) continue;
    const daySlots = availableSlotsForDate(campus, weekday, date, blackouts);
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
```

- [ ] **Step 3: buildDaySlotGrid 시그니처·로직 확장**

`buildDaySlotGrid`(라인 264-284)를 수정 — `blackouts` 파라미터 추가, 슬롯 산출을 `availableSlotsForDate`로 교체:

```typescript
export function buildDaySlotGrid(
  campus: ConsultationCampus,
  fromDate: string,
  bookings: ConsultationBooking[],
  blackouts: BlackoutEntry[] = [],
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
      slots: availableSlotsForDate(campus, od.weekday, od.date, blackouts).map((slot) => ({
        slot,
        booking: dayBookings.find((b) => b.slot === slot) || null,
      })),
    };
  });
}
```

- [ ] **Step 4: 검증 스크립트 작성**

`scripts/verify-consultation-blackout-logic.mts` 생성:

```typescript
import assert from 'node:assert';
import { availableSlotsForDate, getBookableCalendar, findBlackout } from '../lib/consultation-schedule';
import type { BlackoutEntry } from '../lib/types/student';

// 충주는 월~금 운영, 목요일은 부원장 15:30 캡(slotsForDay가 6칸 반환).
// 충주 평일(목 제외) 전 슬롯 9칸: 14:00..16:30.
const FULL_DAY = 9;

function nextWeekday(target: number): string {
  // 2026-07-06(월)부터 검색 — 미래 고정일로 충분.
  let d = new Date('2026-07-06T00:00:00Z');
  while (d.getUTCDay() !== target) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const monday = nextWeekday(1); // 충주 월요일(센터장, 전 슬롯)
  const blackouts: BlackoutEntry[] = [
    { date: monday, scope: ['16:00', '16:30'], reason: '회의' },
  ];

  // findBlackout
  assert.ok(findBlackout(blackouts, monday), 'findBlackout 매칭 실패');
  assert.strictEqual(findBlackout(blackouts, '2099-01-01'), undefined, 'findBlackout 오매칭');

  // 슬롯 일부 차단
  const partial = availableSlotsForDate('chungju', 'mon', monday, blackouts);
  assert.strictEqual(partial.length, FULL_DAY - 2, '부분 차단 개수 불일치');
  assert.ok(!partial.includes('16:00') && !partial.includes('16:30'), '차단 슬롯이 남음');

  // fullday 차단
  const fullBo: BlackoutEntry[] = [{ date: monday, scope: 'fullday' }];
  assert.strictEqual(availableSlotsForDate('chungju', 'mon', monday, fullBo).length, 0, 'fullday 차단 실패');

  // 차단 없으면 전 슬롯
  assert.strictEqual(availableSlotsForDate('chungju', 'mon', monday, []).length, FULL_DAY, '무차단 기본 불일치');

  // 캘린더 반영: fullday 차단일은 freeSlots 0 + full=true
  const cal = getBookableCalendar('chungju', monday, '00:00', [], fullBo);
  const day = cal.find((d) => d.date === monday);
  assert.ok(day && day.full && day.freeSlots.length === 0, '캘린더 fullday 차단 미반영');

  console.log('PASS: blackout 순수로직');
}
main().catch((e) => { console.error('FAIL', e); process.exit(1); });
```

- [ ] **Step 5: 검증 실행 — 먼저 실패 확인**

Run: `npx tsx scripts/verify-consultation-blackout-logic.mts` (Step 1~3 적용 전이라면)
Expected: FAIL — `availableSlotsForDate is not a function` (함수 미정의)

> 주: 본 레포는 테스트 러너가 없어 "실패 먼저 확인"은 함수 추가 전 스크립트를 한 번 돌려 import 에러를 확인하는 것으로 대신한다. 이미 Step 1~3을 적용했다면 이 단계는 생략하고 Step 6으로.

- [ ] **Step 6: 검증 실행 — 통과 확인**

Run: `npx tsx scripts/verify-consultation-blackout-logic.mts`
Expected: `PASS: blackout 순수로직`

- [ ] **Step 7: 타입 체크 + 커밋**

```bash
npx tsc --noEmit
git add lib/consultation-schedule.ts scripts/verify-consultation-blackout-logic.mts
git commit -m "feat: 상담 슬롯 차단 반영 순수함수(availableSlotsForDate) + 캘린더/그리드 연동"
```

---

### Task 3: 차단 API + 캘린더/관리자 차단 반영

**Files:**
- Modify: `app/api/admin/consultation-bookings/route.ts` (GET이 blackouts를 그리드에 반영 + 응답에 포함, PUT 추가, POST 차단 검증)
- Modify: `app/api/student/consultation-booking/route.ts` (GET 캘린더에 blackouts 전달)
- Modify: `app/admin/consultation-bookings/page.tsx` (날짜/슬롯 차단 토글 UI)

**Interfaces:**
- Consumes: `getConsultationBlackouts`/`setConsultationBlackouts` (Task 1), `availableSlotsForDate`/`buildDaySlotGrid`/`getBookableCalendar` blackouts 인자 (Task 2).
- Produces: `PUT /api/admin/consultation-bookings` body `{ campus, blackouts: BlackoutEntry[] }` → `{ success, blackouts }`. GET 응답에 `blackouts: Record<campus, BlackoutEntry[]>` 추가.

- [ ] **Step 1: 관리자 GET에 blackouts 반영**

`app/api/admin/consultation-bookings/route.ts` import에 추가:

```typescript
import { getConsultationBlackouts, setConsultationBlackouts } from '@/lib/store';
import type { BlackoutEntry } from '@/lib/types/student';
```

GET 함수의 그리드 생성부(라인 54-60)를 교체:

```typescript
  const grids: Record<string, DaySlotGrid[]> = {};
  const blackouts: Record<string, BlackoutEntry[]> = {};
  for (const campus of campuses) {
    const campusBookings = bookings.filter((b) => b.campus === campus);
    const bo = await getConsultationBlackouts(campus);
    blackouts[campus] = bo;
    grids[campus] = buildDaySlotGrid(campus, today, campusBookings, bo);
  }

  return NextResponse.json({ success: true, bookings, grids, blackouts, today });
```

- [ ] **Step 2: POST에 차단 검증 추가**

`app/api/admin/consultation-bookings/route.ts` POST에서 `slotsForDay(...).includes(slot)` 검증(라인 110-112) 직후에 차단 검증 추가:

```typescript
  // 차단(휴무/출장)된 날짜·슬롯은 관리자 직접 배정도 거부.
  const postBlackouts = await getConsultationBlackouts(student.campus);
  if (!availableSlotsForDate(student.campus, weekday, date, postBlackouts).includes(slot)) {
    return NextResponse.json({ success: false, message: '담당자 휴무/출장으로 막힌 시간대예요.' }, { status: 400 });
  }
```

import에 `availableSlotsForDate` 추가:

```typescript
import { ..., slotsForDay, availableSlotsForDate, CAMPUS_CONSULTATION, ... } from '@/lib/consultation-schedule';
```

- [ ] **Step 3: PUT(차단 저장) 추가**

`app/api/admin/consultation-bookings/route.ts` 끝(PATCH 함수 뒤)에 추가:

```typescript
// PUT: 센터 차단(휴무/출장) 목록 통째로 교체. 센터 접근권 확인.
export async function PUT(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  let body: { campus?: unknown; blackouts?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const campus = String(body?.campus ?? '').trim();
  if (!isConsultationCampus(campus)) {
    return NextResponse.json({ success: false, message: '상담 운영 센터가 아닙니다.' }, { status: 400 });
  }
  if (session.campus !== 'all' && session.campus !== campus) {
    return NextResponse.json({ success: false, message: '해당 센터에 접근할 권한이 없습니다.' }, { status: 403 });
  }

  const raw = Array.isArray(body?.blackouts) ? body.blackouts : null;
  if (!raw) {
    return NextResponse.json({ success: false, message: '차단 목록이 올바르지 않습니다.' }, { status: 400 });
  }

  // 정규화·검증: date 형식, scope 형식.
  const entries: BlackoutEntry[] = [];
  for (const item of raw) {
    const date = String((item as any)?.date ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ success: false, message: '날짜 형식이 올바르지 않습니다.' }, { status: 400 });
    }
    const scopeRaw = (item as any)?.scope;
    let scope: 'fullday' | string[];
    if (scopeRaw === 'fullday') {
      scope = 'fullday';
    } else if (Array.isArray(scopeRaw) && scopeRaw.every((s) => /^\d{2}:\d{2}$/.test(String(s)))) {
      scope = scopeRaw.map((s) => String(s));
    } else {
      return NextResponse.json({ success: false, message: '차단 범위가 올바르지 않습니다.' }, { status: 400 });
    }
    const reason = typeof (item as any)?.reason === 'string' ? (item as any).reason.trim().slice(0, 200) : undefined;
    entries.push({ date, scope, ...(reason ? { reason } : {}) });
  }

  await setConsultationBlackouts(campus, entries);
  return NextResponse.json({ success: true, blackouts: entries });
}
```

- [ ] **Step 4: 학생 캘린더 GET에 blackouts 전달**

`app/api/student/consultation-booking/route.ts`에서 `getBookableCalendar(...)` 호출 직전에 차단을 조회해 인자로 전달. (해당 파일 GET에서 campus 변수와 `getBookableCalendar` 호출부를 찾아 수정):

```typescript
import { getConsultationBlackouts } from '@/lib/store';
// ...
const blackouts = await getConsultationBlackouts(campus);
const calendar = getBookableCalendar(campus, today, nowHHMM, bookings, blackouts);
```

> 구현 시 해당 파일의 기존 변수명(`campus`, `today`, `nowHHMM`, `bookings`)을 그대로 사용. 다르면 맞춰 교체.

- [ ] **Step 5: 관리자 차단 토글 UI**

`app/admin/consultation-bookings/page.tsx`에 차단 관리 UI 추가. GET 응답의 `blackouts[campus]`를 상태로 받고, 그리드의 날짜 헤더에 "이 날 휴무" 토글, 슬롯 셀에 "막기/풀기"를 둔다. 저장은 `PUT`으로 목록 통째 전송:

```typescript
// 차단 저장 헬퍼 (컴포넌트 내부)
async function saveBlackouts(campus: string, next: BlackoutEntry[]) {
  const res = await fetch('/api/admin/consultation-bookings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ campus, blackouts: next }),
  });
  const json = await res.json();
  if (!json.success) { alert(json.message || '차단 저장 실패'); return; }
  // 로컬 상태 갱신 + 그리드 새로고침(기존 fetch 재호출)
}

// 날짜 전체 휴무 토글
function toggleFullday(campus: string, date: string, current: BlackoutEntry[]) {
  const existing = current.find((b) => b.date === date);
  const next = existing && existing.scope === 'fullday'
    ? current.filter((b) => b.date !== date)                       // 풀기
    : [...current.filter((b) => b.date !== date), { date, scope: 'fullday' as const, reason: '휴무' }]; // 막기
  return saveBlackouts(campus, next);
}
```

> UI 디테일(버튼 위치·iOS26 글래스 스타일)은 기존 페이지 컴포넌트 컨벤션을 따른다. 핵심은 PUT 호출 형태 일치.

- [ ] **Step 6: 타입 체크 + 빌드**

Run: `npx tsc --noEmit && npm run build`
Expected: 에러 없음, 빌드 성공

- [ ] **Step 7: 수동 검증 (dev)**

Run: `npm run dev` → 관리자 `/admin/consultation-bookings` 접속 → 날짜 "휴무" 토글 → 새로고침 시 그날 슬롯이 사라지는지 확인. 학생 리포트 상담 탭에서도 그날이 막혔는지 확인.
Expected: 차단일이 양쪽에서 예약 불가.

- [ ] **Step 8: 커밋**

```bash
git add app/api/admin/consultation-bookings/route.ts app/api/student/consultation-booking/route.ts app/admin/consultation-bookings/page.tsx
git commit -m "feat: 상담 차단 API(PUT)·관리자 토글·학생 캘린더 반영"
```

---

### Task 4: ConsultationBooking 노쇼 상태 + PATCH 전이

**Files:**
- Modify: `lib/types/student.ts:122-137` (status에 noshow, resolvedBy/logId 추가)
- Modify: `app/api/admin/consultation-bookings/route.ts` PATCH (noshow 전이 허용 + resolvedBy 기록)
- Test: `scripts/verify-consultation-noshow.mts` (create)

**Interfaces:**
- Consumes: 기존 `patchConsultationBooking`.
- Produces: `ConsultationBooking.status` 에 `'noshow'` 추가, `resolvedBy?: string`, `logId?: string` 필드. PATCH가 `status: 'noshow'` 수용.

- [ ] **Step 1: 타입 확장**

`lib/types/student.ts`의 `ConsultationBooking`에서 status 라인 수정 + 필드 추가:

```typescript
  status: 'booked' | 'cancelled' | 'done' | 'noshow'; // 예약중/취소/완료/노쇼
  reason?: string;
  source: 'student' | 'admin';
  createdAt: string;
  cancelledAt?: string;
  resolvedAt?: string;     // 완료/노쇼 처리 시각 (ISO)
  resolvedBy?: string;     // 완료/노쇼 처리한 관리자 라벨
  logId?: string;          // 완료 시 생성된 ConsultationLog id(결과 노트 하드 연결)
  adminReply?: string;
```

> 기존에 `reason`/`source`/`createdAt`/`cancelledAt`/`resolvedAt`/`adminReply`가 이미 있으면 중복 추가하지 말고 `status` 교체 + `resolvedBy`/`logId`만 신규 추가.

- [ ] **Step 2: PATCH에 noshow 전이 + resolvedBy 추가**

`app/api/admin/consultation-bookings/route.ts` PATCH의 status 파싱부(라인 173-182)를 교체:

```typescript
  const status =
    body?.status === 'booked' ? 'booked' :
    body?.status === 'cancelled' ? 'cancelled' :
    body?.status === 'done' ? 'done' :
    body?.status === 'noshow' ? 'noshow' : null;
  if (status) {
    patch.status = status;
    const nowIso = new Date().toISOString();
    if (status === 'done' || status === 'noshow') {
      patch.resolvedAt = nowIso;
      patch.resolvedBy = session.name || session.campus;
    }
    if (status === 'cancelled') patch.cancelledAt = nowIso;
  }
```

> `session.name`이 타입에 없으면 `getAdminSession()` 반환 타입을 확인해 적절한 라벨 필드 사용(예: `session.campus`). PATCH 본문에 `logId` 수용도 추가 — body 타입에 `logId?: unknown` 넣고: `if (typeof body?.logId === 'string') patch.logId = body.logId;`

- [ ] **Step 3: 검증 스크립트**

`scripts/verify-consultation-noshow.mts` 생성:

```typescript
import assert from 'node:assert';
import { addConsultationBooking, patchConsultationBooking, getConsultationBookings, removeConsultationBookingsForStudent } from '../lib/store';
import type { ConsultationBooking } from '../lib/types/student';

async function main() {
  const campus = '__verify_noshow__';
  const booking: ConsultationBooking = {
    id: `cbk_test_${Math.random().toString(36).slice(2, 7)}`,
    studentId: 'stu_test', studentName: '검증', campus,
    date: '2026-07-06', weekday: 'mon', slot: '14:00', counselor: '센터장',
    kind: 'regular', status: 'booked', source: 'admin', createdAt: new Date().toISOString(),
  };
  await addConsultationBooking(booking);

  const noshow = await patchConsultationBooking(campus, booking.id, {
    status: 'noshow', resolvedAt: new Date().toISOString(), resolvedBy: '센터장',
  });
  assert.ok(noshow && noshow.status === 'noshow' && noshow.resolvedBy === '센터장', 'noshow 전이 실패');

  await removeConsultationBookingsForStudent(campus, 'stu_test'); // 정리
  const after = await getConsultationBookings(campus);
  assert.ok(!after.find((b) => b.id === booking.id), '정리 실패');

  console.log('PASS: noshow 전이');
}
main().catch((e) => { console.error('FAIL', e); process.exit(1); });
```

- [ ] **Step 4: 검증 실행 + tsc**

Run: `npx tsx scripts/verify-consultation-noshow.mts && npx tsc --noEmit`
Expected: `PASS: noshow 전이`, 타입 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add lib/types/student.ts app/api/admin/consultation-bookings/route.ts scripts/verify-consultation-noshow.mts
git commit -m "feat: 상담 예약 노쇼 상태·resolvedBy·logId 필드 + PATCH 전이"
```

---

### Task 5: 관리자 그리드 완료/노쇼 버튼

**Files:**
- Modify: `app/admin/consultation-bookings/page.tsx` (지난 슬롯의 booked 예약에 완료/노쇼 버튼)

**Interfaces:**
- Consumes: PATCH `status: 'done' | 'noshow'` (Task 4).
- Produces: UI만. 완료 버튼은 Task 7에서 완료 폼으로 확장되므로, 여기서는 노쇼/완료를 단순 PATCH로 먼저 연결.

- [ ] **Step 1: 슬롯 시각 경과 판정 + 버튼**

`page.tsx` 그리드 셀 렌더에서, `booking.status === 'booked'` 이고 `(booking.date < today) || (booking.date === today && booking.slot <= nowHHMM)` 인 경우 두 버튼 노출:

```typescript
async function resolveBooking(campus: string, id: string, status: 'done' | 'noshow') {
  const res = await fetch('/api/admin/consultation-bookings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ campus, id, status }),
  });
  const json = await res.json();
  if (!json.success) { alert(json.message || '처리 실패'); return; }
  // 그리드 새로고침(기존 로더 재호출)
}
```

```tsx
{isPast && booking.status === 'booked' && (
  <div className="flex gap-1">
    <button onClick={() => resolveBooking(campus, booking.id, 'done')}>완료</button>
    <button onClick={() => resolveBooking(campus, booking.id, 'noshow')}>노쇼</button>
  </div>
)}
{booking.status === 'done' && <span>완료</span>}
{booking.status === 'noshow' && <span>노쇼</span>}
```

> `today`/`nowHHMM`은 GET 응답의 `today`와 클라이언트 `new Date()` KST 시각으로 계산. 스타일은 기존 컨벤션.

- [ ] **Step 2: 타입 체크 + 빌드**

Run: `npx tsc --noEmit && npm run build`
Expected: 성공

- [ ] **Step 3: 수동 검증**

Run: `npm run dev` → `/admin/consultation-bookings` → 과거 날짜의 예약에 완료/노쇼 버튼 노출 확인 → 클릭 시 상태 변경 반영.

- [ ] **Step 4: 커밋**

```bash
git add app/admin/consultation-bookings/page.tsx
git commit -m "feat: 상담 그리드 지난 예약 완료/노쇼 처리 버튼"
```

---

### Task 6: consultation-digest 순수 모듈

**Files:**
- Create: `lib/consultation-digest.ts`
- Test: `scripts/verify-consultation-digest.mts` (create)

**Interfaces:**
- Consumes: `Student`, `ConsultationLog`, `LeaveRequest` 타입.
- Produces:
  - `export interface DigestItem { kind: 'request' | 'leave' | 'note'; label: string; detail?: string }`
  - `export function buildConsultationDigest(student: Pick<Student, 'consultationLogs' | 'leaveRequests'>, date: string): DigestItem[]` — 상담일 `date`(KST YYYY-MM-DD)에 처리된 이벤트 요약.

- [ ] **Step 1: 모듈 작성**

`lib/consultation-digest.ts` 생성:

```typescript
import type { Student, ConsultationLog, LeaveRequest } from '@/lib/types/student';
import { getRequestTypeLabel } from '@/lib/student-requests';
import { getLeaveTypeLabel } from '@/lib/leave';

export interface DigestItem {
  kind: 'request' | 'leave' | 'note';
  label: string;
  detail?: string;
}

// ISO 또는 YYYY-MM-DD 문자열을 KST 기준 날짜(YYYY-MM-DD)로 환산.
function toKstDate(value?: string): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value; // 이미 날짜
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(d);
}

// 상담일 date 에 "처리된/발생한" 변경 이벤트를 모아 다이제스트로 반환.
export function buildConsultationDigest(
  student: Pick<Student, 'consultationLogs' | 'leaveRequests'>,
  date: string,
): DigestItem[] {
  const items: DigestItem[] = [];

  // 1) 그날 처리된(resolved) 변경 신청
  for (const log of student.consultationLogs || []) {
    if (log.type !== 'request') continue;
    if (log.status !== 'resolved') continue;
    if (toKstDate(log.resolvedAt) !== date) continue;
    items.push({
      kind: 'request',
      label: `변경 처리: ${getRequestTypeLabel(log.requestType)}`,
      detail: (log.content || '').slice(0, 120) || undefined,
    });
  }

  // 2) 그날 처리(승인/반려)된 휴가·반차
  for (const lr of student.leaveRequests || []) {
    if (lr.status !== 'approved' && lr.status !== 'rejected') continue;
    const actedAt = toKstDate(lr.resolvedAt || lr.repliedAt);
    if (actedAt !== date) continue;
    items.push({
      kind: 'leave',
      label: `${getLeaveTypeLabel(lr.type)} ${lr.status === 'approved' ? '승인' : '반려'}`,
      detail: lr.date || undefined,
    });
  }

  // 3) 그날 작성된 학습 상담 노트(자기 자신 제외 위해 호출부에서 logId로 매핑하므로 여기선 생략 가능)
  for (const log of student.consultationLogs || []) {
    if (log.type !== 'learning') continue;
    if (toKstDate(log.createdAt || log.date) !== date) continue;
    items.push({ kind: 'note', label: '학습 상담 기록', detail: (log.content || '').slice(0, 120) || undefined });
  }

  return items;
}
```

> `LeaveRequest`의 처리 시각 필드명(`resolvedAt`/`repliedAt`/`actedAt`)을 `lib/types/student.ts`에서 확인해 정확히 맞춘다. 없으면 `status` 변경 시각 필드로 교체.

- [ ] **Step 2: 검증 스크립트**

`scripts/verify-consultation-digest.mts` 생성:

```typescript
import assert from 'node:assert';
import { buildConsultationDigest } from '../lib/consultation-digest';

const date = '2026-07-06';
const student: any = {
  consultationLogs: [
    { id: 'r1', type: 'request', requestType: 'progress', status: 'resolved', resolvedAt: `${date}T05:00:00.000Z`, content: '진도 1주 당김' },
    { id: 'r2', type: 'request', requestType: 'subject', status: 'pending', content: '아직 처리 안됨' },
    { id: 'n1', type: 'learning', date, content: '집중도 점검' },
  ],
  leaveRequests: [
    { id: 'l1', type: 'halfDay', status: 'approved', resolvedAt: `${date}T06:00:00.000Z`, date },
    { id: 'l2', type: 'fullDay', status: 'pending' },
  ],
};

const digest = buildConsultationDigest(student, date);
assert.ok(digest.some((d) => d.kind === 'request' && d.label.includes('진도')), '처리된 변경신청 누락');
assert.ok(!digest.some((d) => d.detail === '아직 처리 안됨'), 'pending 신청이 잘못 포함됨');
assert.ok(digest.some((d) => d.kind === 'leave' && d.label.includes('승인')), '승인 휴가 누락');
assert.ok(!digest.some((d) => d.label.includes('fullDay') && d.label.includes('반려')), 'pending 휴가 포함됨');
assert.ok(digest.some((d) => d.kind === 'note'), '학습노트 누락');

// 다른 날짜는 비어야 함
assert.strictEqual(buildConsultationDigest(student, '2099-01-01').length, 0, '엉뚱한 날짜에 항목 발생');

console.log('PASS: consultation digest');
```

- [ ] **Step 3: 검증 실행 + tsc**

Run: `npx tsx scripts/verify-consultation-digest.mts && npx tsc --noEmit`
Expected: `PASS: consultation digest`, 타입 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add lib/consultation-digest.ts scripts/verify-consultation-digest.mts
git commit -m "feat: 상담일 변경사항 자동 다이제스트 순수모듈"
```

---

### Task 7: 완료 폼 → ConsultationLog 생성 + logId 연결

**Files:**
- Modify: `app/admin/consultation-bookings/page.tsx` (완료 버튼 → 다이제스트 미리채움 노트 폼 모달)
- Modify: `app/api/admin/consultation-bookings/route.ts` GET (각 booking에 digest를 함께 내려주거나, 별도 조회). 권장: GET 응답 booking에는 손대지 않고, 완료 모달 오픈 시 학생 데이터로 클라이언트 계산. 다만 digest는 순수함수라 클라이언트에서 직접 호출 가능.

**Interfaces:**
- Consumes: `buildConsultationDigest` (Task 6), `POST /api/admin/students/[id]/consultation`(기존), PATCH `logId`(Task 4).
- Produces: 완료 처리 = (1) `POST /consultation` 로 학습노트 생성 → 반환 학생/로그에서 logId 확보, (2) PATCH `status:'done', logId` 로 예약에 연결.

- [ ] **Step 1: 완료 모달 — 다이제스트 미리채움**

`page.tsx`에서 "완료" 클릭 시(Task 5의 done 직접 PATCH 대신) 모달을 연다. 모달은 해당 학생 데이터로 다이제스트를 계산해 노트 textarea 초기값으로 채운다:

```typescript
import { buildConsultationDigest } from '@/lib/consultation-digest';

function openCompleteModal(booking: ConsultationBooking, student: Student) {
  const digest = buildConsultationDigest(student, booking.date);
  const prefilled = digest.length
    ? `[그날 변경사항]\n${digest.map((d) => `- ${d.label}${d.detail ? ` (${d.detail})` : ''}`).join('\n')}\n\n[상담 메모]\n`
    : '[상담 메모]\n';
  setNoteDraft(prefilled);
  setCompleteTarget(booking);
}
```

> 그리드 셀은 booking만 알고 student 전체는 없을 수 있다. GET 응답 `bookings`에 `studentId`가 있으므로, 페이지에서 학생 목록을 함께 로드하거나(`/api/admin/students`), 또는 다이제스트 계산용 최소 데이터(consultationLogs/leaveRequests)를 booking 조회 시 함께 받도록 GET을 확장한다. **권장: 완료 모달 오픈 시 `GET /api/admin/students/{studentId}` 단건 조회 후 다이제스트 계산** — 그리드 GET을 무겁게 만들지 않음.

- [ ] **Step 2: 완료 저장 — 노트 생성 + 연결**

```typescript
async function submitComplete() {
  if (!completeTarget) return;
  const b = completeTarget;
  // 1) 학습 상담 노트 생성
  const noteRes = await fetch(`/api/admin/students/${b.studentId}/consultation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: b.date, content: noteDraft, type: 'learning' }),
  });
  const noteJson = await noteRes.json();
  if (!noteJson.success) { alert(noteJson.message || '상담 기록 저장 실패'); return; }
  // 생성된 로그 id 추출(POST가 student 전체 반환 → 맨 앞 로그가 방금 생성분)
  const newLogId: string | undefined = noteJson.data?.consultationLogs?.[0]?.id;
  // 2) 예약 완료 + logId 연결
  const patchRes = await fetch('/api/admin/consultation-bookings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ campus: b.campus, id: b.id, status: 'done', ...(newLogId ? { logId: newLogId } : {}) }),
  });
  const patchJson = await patchRes.json();
  if (!patchJson.success) { alert(patchJson.message || '완료 처리 실패'); return; }
  setCompleteTarget(null);
  // 그리드 새로고침
}
```

> 노쇼는 Task 5의 단순 PATCH 유지(노트 폼 없음).

- [ ] **Step 3: 타입 체크 + 빌드**

Run: `npx tsc --noEmit && npm run build`
Expected: 성공

- [ ] **Step 4: 수동 검증**

Run: `npm run dev` → 과거 예약 "완료" → 모달에 그날 변경사항이 미리 채워짐 확인 → 저장 → 예약 done + logId 연결, 학생 상담 로그에 노트 생성 확인.

- [ ] **Step 5: 커밋**

```bash
git add app/admin/consultation-bookings/page.tsx app/api/admin/consultation-bookings/route.ts
git commit -m "feat: 상담 완료 폼(변경사항 자동 미리채움)→학습노트 생성·예약 연결"
```

---

### Task 8: 학생 리포트 상담 결과/변경 타임라인

**Files:**
- Modify: `app/api/report/[id]/route.ts` (학생 본인 예약 + 연결된 로그를 함께 전달 — 이미 consultationBookings 전달 중. logId 매핑 노출)
- Modify: `components/report/consultation-booking-panel.tsx` (done 예약에 결과 노트 + 다이제스트 표시)

**Interfaces:**
- Consumes: `ConsultationBooking.logId`(Task 4), `buildConsultationDigest`(Task 6), 학생 `consultationLogs`.
- Produces: 학생 화면에서 done 예약 클릭/펼침 시 결과 노트(logId로 매칭) + 그날 변경 표시.

- [ ] **Step 1: 리포트 API — 필요한 데이터 노출 확인**

`app/api/report/[id]/route.ts`에서 `data.consultationBookings`(본인 예약)와 `data.consultationLogs`(이미 전달 중인지 확인)가 함께 내려가는지 점검. 결과 노트 매칭은 클라이언트가 `booking.logId === log.id`로 수행하므로, 두 배열이 모두 응답에 있으면 추가 변경 불필요. 없으면 `consultationLogs`(학습 type만 필요시 필터)를 응답에 추가.

> status 필터 주의: 기존 검증에서 `consultationBookings`는 `status === 'booked'`만 노출하도록 패치됨. 결과 타임라인을 보여주려면 done/noshow도 내려야 한다 → 필터를 `status !== 'cancelled'`로 완화하거나, 별도 `pastConsultations` 배열로 done/noshow를 분리 전달. **권장: `data.consultationBookings`는 active(booked)만 유지하고, `data.consultationHistory`에 done/noshow를 별도 전달**(학생 화면 의미 분리).

- [ ] **Step 2: 패널 — 결과/변경 표시**

`components/report/consultation-booking-panel.tsx`에 지난 상담(history) 섹션 추가. 각 done 항목에 연결 노트와 다이제스트 표시:

```tsx
import { buildConsultationDigest } from '@/lib/consultation-digest';
// history: ConsultationBooking[] (done/noshow), logs: ConsultationLog[], student-side data
{history.map((b) => {
  const note = b.logId ? logs.find((l) => l.id === b.logId) : undefined;
  const digest = buildConsultationDigest({ consultationLogs: logs, leaveRequests }, b.date);
  return (
    <div key={b.id}>
      <div>{b.date} {b.slot} · {b.status === 'noshow' ? '미참석' : '완료'}</div>
      {note?.content && <p>{note.content}</p>}
      {digest.length > 0 && (
        <ul>{digest.map((d, i) => <li key={i}>{d.label}{d.detail ? ` (${d.detail})` : ''}</li>)}</ul>
      )}
    </div>
  );
})}
```

> `leaveRequests`/`logs`는 패널 props로 이미 들어오는 학생 데이터 경로를 따른다. 없으면 `use-report-state.ts`에서 전달 추가.

- [ ] **Step 3: 타입 체크 + 빌드**

Run: `npx tsc --noEmit && npm run build`
Expected: 성공

- [ ] **Step 4: 수동 검증**

Run: `npm run dev` → 학생 리포트 상담 탭 → 완료된 상담에 결과 노트와 "그날 변경사항"이 보이는지, 노쇼는 "미참석"으로 표시되는지 확인.

- [ ] **Step 5: 커밋**

```bash
git add app/api/report/[id]/route.ts components/report/consultation-booking-panel.tsx hooks/use-report-state.ts
git commit -m "feat: 학생 리포트에 상담 결과/그날 변경 타임라인"
```

---

### Task 9: 리마인더 엔드포인트 + 크론

**Files:**
- Create: `app/api/admin/consultation/remind/route.ts`
- Modify: `.github/workflows/scheduled-crons.yml` (스케줄 1줄 + case 매핑)
- Modify: 학생 알림 저장 경로 — 기존 `SeatAlert` 채널 재사용. `lib/store.ts`에 학생 알림 추가 헬퍼가 있으면 사용, 없으면 학생 `seatAlerts` 배열에 append하는 기존 경로 활용.

**Interfaces:**
- Consumes: `getConsultationBookingsForCampuses`, 학생 알림 append 경로, `CRON_SECRET`.
- Produces: `GET /api/admin/consultation/remind` — D-1 booked 예약자에게 알림 레코드 생성(멱등). 응답 `{ success, created }`.

- [ ] **Step 1: 엔드포인트 작성**

`app/api/admin/consultation/remind/route.ts` 생성. 인증은 기존 sweep 엔드포인트(`app/api/admin/attendance/sweep`)의 `CRON_SECRET` 검증 패턴을 그대로 따른다(헤더 또는 ?secret=). 먼저 sweep 라우트를 열어 인증 방식을 복사:

```typescript
import { NextResponse } from 'next/server';
import { getConsultationBookingsForCampuses } from '@/lib/store';
// + 학생 알림 append 헬퍼(기존 SeatAlert 생성 경로)

function tomorrowKst(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  kst.setUTCDate(kst.getUTCDate() + 1);
  return kst.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  // 1) CRON_SECRET 검증 (sweep 라우트와 동일 방식 복사)
  const secret = process.env.CRON_SECRET;
  const provided = new URL(request.url).searchParams.get('secret')
    || request.headers.get('authorization')?.replace('Bearer ', '');
  if (!secret || provided !== secret) {
    return NextResponse.json({ success: false, message: 'unauthorized' }, { status: 401 });
  }

  const target = tomorrowKst();
  const all = await getConsultationBookingsForCampuses(['wonju', 'chuncheon', 'chungju']);
  const due = all.filter((b) => b.status === 'booked' && b.kind === 'regular' && b.date === target);

  let created = 0;
  for (const b of due) {
    // 멱등 키: reminder:{bookingId}. 이미 보낸 알림이 있으면 skip.
    const ok = await createConsultationReminderAlert(b); // 아래 Step 2에서 정의
    if (ok) created++;
  }
  return NextResponse.json({ success: true, created, target });
}
```

- [ ] **Step 2: 알림 생성 헬퍼 (멱등)**

기존 `SeatAlert` 생성 경로를 확인해 재사용. 학생별 `seatAlerts`에 append하되 멱등 키로 중복 방지. `lib/store.ts`에 추가:

```typescript
// 상담 D-1 리마인더 알림 생성. 같은 예약에 이미 보냈으면 false.
export async function createConsultationReminderAlert(booking: ConsultationBooking): Promise<boolean> {
  const dedupeId = `creminder_${booking.id}`;
  const result = await updateStudentById(booking.studentId, (student) => {
    student.seatAlerts = student.seatAlerts || [];
    if (student.seatAlerts.some((a) => a.id === dedupeId)) return; // 멱등
    student.seatAlerts.unshift({
      id: dedupeId,
      date: booking.date,
      period: 0,
      periodLabel: '상담',
      message: `내일 ${booking.slot} 상담 예약이 있어요. (${booking.counselor})`,
      createdAt: new Date().toISOString(),
      createdBy: 'system',
    });
  });
  return result !== 'not_found' && typeof result !== 'string';
}
```

> `SeatAlert` 구조(`lib/types/student.ts:479`)와 `updateStudentById` 반환 규약을 확인해 맞춘다. 멱등 체크가 없으면 크론이 매일 돌아도 D-1 하루치만 생성되므로 사실상 1회지만, 안전하게 dedupe 유지.

- [ ] **Step 3: 크론 등록**

`.github/workflows/scheduled-crons.yml` 수정 — schedule에 1줄 추가:

```yaml
    - cron: '0 10 * * *'    # 상담 D-1 리마인더 (매일 19:00 KST = 10:00 UTC)
```

case 매핑(`run` 스텝의 `case "$KEY"`)에 추가:

```bash
            '0 10 * * *'|manual:remind)    Q='/api/admin/consultation/remind' ;;
```

`workflow_dispatch` inputs options 배열에 `remind` 추가: `options: [sweep, meal, weekly, monthly, remind]`.

- [ ] **Step 4: 검증 (수동, 로컬)**

Run: dev 서버에서 `curl "http://localhost:3000/api/admin/consultation/remind?secret=$CRON_SECRET"` (로컬 .env의 CRON_SECRET) — 내일자 booked 예약이 있으면 `created>0`, 두 번 호출해도 멱등으로 created가 늘지 않음 확인.
Expected: 1회차 created=N, 2회차 created=0.

- [ ] **Step 5: 타입 체크 + 커밋**

```bash
npx tsc --noEmit
git add app/api/admin/consultation/remind/route.ts lib/store.ts .github/workflows/scheduled-crons.yml
git commit -m "feat: 상담 D-1 리마인더 엔드포인트 + 크론(인앱 알림, 멱등)"
```

---

### Task 10: 리마인더 배너 + 상담 통계

**Files:**
- Modify: `components/report/consultation-booking-panel.tsx` (D-1 배너)
- Modify: `app/admin/consultation-bookings/page.tsx` (센터별 신청/완료/노쇼 통계)

**Interfaces:**
- Consumes: 학생 본인 예약(`data.consultationBookings`), 관리자 `bookings`(GET).
- Produces: UI만(집계는 클라이언트 메모리 계산).

- [ ] **Step 1: 학생 D-1 배너**

`consultation-booking-panel.tsx`에서 본인 booked 예약 중 날짜가 "내일(KST)"인 것을 찾아 상단 배너:

```tsx
const tomorrow = (() => { const d = new Date(Date.now() + 9*3600*1000); d.setUTCDate(d.getUTCDate()+1); return d.toISOString().slice(0,10); })();
const soon = bookings.find((b) => b.status === 'booked' && b.date === tomorrow);
{soon && <div className="...">내일 {soon.slot} 상담이 있어요 ({soon.counselor})</div>}
```

- [ ] **Step 2: 관리자 통계**

`page.tsx`에서 현재 로드된 `bookings`로 센터별 집계:

```typescript
function stats(bookings: ConsultationBooking[]) {
  const total = bookings.length;
  const done = bookings.filter((b) => b.status === 'done').length;
  const noshow = bookings.filter((b) => b.status === 'noshow').length;
  const resolved = done + noshow;
  return {
    total, done, noshow,
    noshowRate: resolved ? Math.round((noshow / resolved) * 100) : 0,
  };
}
```

표시: 센터별 "신청 N · 완료 D · 노쇼 X (노쇼율 Y%)".

- [ ] **Step 3: 타입 체크 + 빌드**

Run: `npx tsc --noEmit && npm run build`
Expected: 성공

- [ ] **Step 4: 수동 검증**

Run: `npm run dev` → 학생: 내일 예약 시 배너 노출. 관리자: 통계 수치가 그리드 데이터와 일치.

- [ ] **Step 5: 커밋**

```bash
git add components/report/consultation-booking-panel.tsx app/admin/consultation-bookings/page.tsx
git commit -m "feat: 상담 D-1 배너 + 관리자 신청/완료/노쇼 통계"
```

---

## 최종 검증

- [ ] 전체 순수로직 스크립트 재실행: `npx tsx scripts/verify-consultation-blackout-store.mts && npx tsx scripts/verify-consultation-blackout-logic.mts && npx tsx scripts/verify-consultation-noshow.mts && npx tsx scripts/verify-consultation-digest.mts`
- [ ] `npx tsc --noEmit` 무에러
- [ ] `npm run build` 성공
- [ ] (운영 반영 전) 시각 최종확인 — 사용자 본인이 iOS26 글래스 화면 점검. **자동 PASS 선언 금지.**

## 운영 메모

- 신규 env 없음(`CRON_SECRET`은 기존). GitHub Actions secrets에 이미 등록됨.
- 신규 Supabase 마이그레이션 없음 — `app_settings` 키 `consultation_blackouts:{campus}`는 첫 PUT 시 자동 생성.
- 크론 1줄 추가는 GitHub Actions 한도 내(기존 4개 → 5개).
