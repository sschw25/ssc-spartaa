# 출결 이탈·결석 순위 대시보드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 출결판에 누적된 수기 결석 X(`seat_statuses`)를 집계해, 정당사유를 제외하고 이탈/결석을 구분한 **상습 이탈·결석자 순위**를 출결 상세 표 안의 탭으로 보여준다.

**Architecture:** 순수 집계 함수(`lib/absence-stats.ts`)를 핵심 테스트 단위로 두고, 데이터 페치(seat_statuses 범위·세션 등원일)는 얇은 store 래퍼로, 휴가 덮임 판정은 seat-board에서 추출한 공유 모듈(`lib/leave-blocks.ts`)로 분리. API는 집계 결과만 반환, UI는 기존 `/admin/attendance` 페이지에 탭 추가. 마이그레이션 없음(기존 테이블 재사용).

**Tech Stack:** Next.js App Router API routes, TypeScript 5.7, Supabase(`seat_statuses`·`study_sessions`)와 local-json 폴백, 표준 테스트러너 없음 → 순수함수는 `npx tsx scripts/verify-*.mts`.

## Global Constraints

- 수기 점검 원칙 유지: 읽기 전용. 출결 자동 채움·쓰기 없음.
- 마이그레이션 금지: 기존 `seat_statuses`(date, seat_key, status)·`study_sessions`(student_id, date)만 사용.
- 집계 대상: `seat_statuses` status `absent`, **교시 키 `{studentId}:{0~6}`만**(휴대폰 `phone_*`·idx 7 제외).
- 운영 교시 수 `OPERATING_PERIODS = 7`(seat-board `PERIODS` idx 0~6 = 1~7교시; 8교시 'A'는 수기 비대상).
- 분류: (학생,날짜) 단위. **결석일** = 등원세션 없음 OR 일괄 X(7교시 전부 마크). **이탈일** = 등원세션 있음 + 부분 X. 한 날은 둘 중 하나(결석 우선).
- 정당사유 제외: 수기 X라도 그 교시가 승인 휴가(반차/휴식/개인사정/병가)가 덮으면 카운트 제외. 제외 후 남은 X 없으면 그 날 카운트 안 함.
- 정렬: `absentDays desc → leftDays desc → totalMarks desc → name asc`.
- 권한: campus_admin=자기 센터, master(`'all'`)=전체(`?campus` 단일센터 필터).
- 날짜 KST `YYYY-MM-DD`. 기본 기간 = 이번 달 1일~오늘.
- 색: 보라/인디고 금지(결석=rose, 이탈=amber 의미색), iOS26 글래스.
- 이탈 필드명은 `leftDays`(휴가 `leaveDays`와 혼동 금지).
- import 별칭 `@/*` = 레포 루트.

---

### Task 1: 휴가 덮임 로직 공유 모듈 추출

**Files:**
- Create: `lib/leave-blocks.ts`
- Modify: `app/admin/seat-board/page.tsx` (라인 218-263의 함수 정의 제거 → import)
- Modify: `components/admin/student-detail-sheet.tsx` (동일 함수 중복 정의가 있으면 import로 교체)

**Interfaces:**
- Produces (later tasks/components depend on these):
  - `export type LeaveBlockKind = 'fullday' | 'morning' | 'afternoon' | 'night'`
  - `export function leaveBlockKind(leave: LeaveRequest): LeaveBlockKind | null`
  - `export function leaveKindCoversPeriod(kind: LeaveBlockKind | null, idx: number): boolean`
  - `export function approvedLeavesOn(student: Pick<Student,'leaveRequests'> | null, date: string): LeaveRequest[]`
  - `export function isPeriodCoveredByApprovedLeave(student: Pick<Student,'leaveRequests'> | null, date: string, idx: number): boolean`

- [ ] **Step 1: 공유 모듈 생성**

`lib/leave-blocks.ts` 생성 (함수 본문은 seat-board의 현재 정의와 동일 — 동작 보존):

```typescript
import type { LeaveRequest, Student } from '@/lib/types/student';

// 휴가/반차 한 건이 가리는 시간대 종류.
// slot이 지정된 신청(개인사정 반차·병가)은 slot 우선, 없으면 type로 판단(휴식권/개인사정 휴가=하루 종일).
export type LeaveBlockKind = 'fullday' | 'morning' | 'afternoon' | 'night';

export function leaveBlockKind(leave: LeaveRequest): LeaveBlockKind | null {
  if (leave.slot === 'fullday' || leave.slot === 'morning' || leave.slot === 'afternoon' || leave.slot === 'night') {
    return leave.slot;
  }
  switch (leave.type) {
    case 'fullday':
    case 'sick':
    case 'personal_fullday':
      return 'fullday';
    case 'morning':
    case 'afternoon':
    case 'night':
      return leave.type;
    default:
      return null;
  }
}

// 교시 idx(0~6: 1~7교시)가 해당 시간대에 포함되는지
export function leaveKindCoversPeriod(kind: LeaveBlockKind | null, idx: number): boolean {
  switch (kind) {
    case 'fullday': return true;
    case 'morning': return idx < 2;
    case 'afternoon': return idx >= 2 && idx <= 4;
    case 'night': return idx >= 5 && idx <= 6;
    default: return false;
  }
}

export function approvedLeavesOn(student: Pick<Student, 'leaveRequests'> | null, date: string): LeaveRequest[] {
  return student
    ? (student.leaveRequests || []).filter((r) => r.date === date && r.status === 'approved')
    : [];
}

// 그 (학생, 날짜, 교시idx)가 승인 휴가가 덮는 교시인지.
export function isPeriodCoveredByApprovedLeave(
  student: Pick<Student, 'leaveRequests'> | null,
  date: string,
  idx: number,
): boolean {
  return approvedLeavesOn(student, date).some((l) => leaveKindCoversPeriod(leaveBlockKind(l), idx));
}
```

- [ ] **Step 2: seat-board에서 정의 제거 + import**

`app/admin/seat-board/page.tsx`에서 라인 218-263의 `LeaveBlockKind`/`leaveBlockKind`/`leaveKindCoversPeriod`/`approvedLeavesOn` **정의를 삭제**하고, 파일 상단 import 블록에 추가:

```typescript
import { leaveBlockKind, leaveKindCoversPeriod, approvedLeavesOn, type LeaveBlockKind } from '@/lib/leave-blocks';
```

⚠️ `leaveKindAllowsCheckout`(라인 249)·`isApprovedLeaveCheckout`(라인 265)는 **그대로 둔다**(체크아웃 전용, 이번 범위 밖). 이들은 이제 import된 `leaveBlockKind`를 그대로 사용하므로 동작 변함 없음. `LeaveBlockKind` 타입을 쓰는 다른 지역 참조도 import된 타입으로 해소됨.

- [ ] **Step 3: student-detail-sheet 중복 점검**

`components/admin/student-detail-sheet.tsx`를 열어 `leaveBlockKind`/`approvedLeavesOn`/`leaveKindCoversPeriod`를 **자체 정의**하고 있으면 그 정의를 삭제하고 동일하게 `@/lib/leave-blocks`에서 import. 함수가 없고 다른 이름이면 건드리지 말 것(범위 밖).

- [ ] **Step 4: 타입 체크 + 빌드 (동작 보존 확인)**

Run: `npx tsc --noEmit && npm run build`
Expected: 에러 없음, 빌드 성공. (함수 본문 무변경 = seat-board 동작 보존.) 빌드 로그 끝부분 report에 첨부.

- [ ] **Step 5: 커밋**

```bash
git add lib/leave-blocks.ts app/admin/seat-board/page.tsx components/admin/student-detail-sheet.tsx
git commit -m "refactor: 휴가 덮임 판정 로직 공유 모듈(lib/leave-blocks) 추출"
```

---

### Task 2: 순수 집계 모듈 buildAbsenceRanking

**Files:**
- Create: `lib/absence-stats.ts`
- Test: `scripts/verify-absence-stats.mts`

**Interfaces:**
- Consumes: `isPeriodCoveredByApprovedLeave` (Task 1), `Student` 타입.
- Produces:
  - `export const OPERATING_PERIODS = 7`
  - `export function parseSeatPeriodKey(seatKey: string): { studentId: string; periodIdx: number } | null`
  - `export interface AbsenceRankRow { studentId: string; name: string; campus: string; absentDays: number; leftDays: number; totalMarks: number; lastDate: string }`
  - `export function buildAbsenceRanking(rawMarks: { date: string; seatKey: string }[], attendedDays: Set<string>, students: Pick<Student,'id'|'name'|'campus'|'leaveRequests'>[]): AbsenceRankRow[]`
  - `attendedDays` 원소 형식: `"${studentId}|${date}"`.

- [ ] **Step 1: 검증 스크립트 작성 (실패 먼저)**

`scripts/verify-absence-stats.mts` 생성:

```typescript
import assert from 'node:assert';
import { parseSeatPeriodKey, buildAbsenceRanking, OPERATING_PERIODS } from '../lib/absence-stats';

// parseSeatPeriodKey
assert.deepStrictEqual(parseSeatPeriodKey('stu_1:3'), { studentId: 'stu_1', periodIdx: 3 }, '교시키 파싱');
assert.strictEqual(parseSeatPeriodKey('stu_1:phone_D'), null, '휴대폰키 제외');
assert.strictEqual(parseSeatPeriodKey('stu_1'), null, '콜론없음 null');
assert.strictEqual(parseSeatPeriodKey('stu_1:x'), null, '숫자아님 null');

const students = [
  { id: 'a', name: '가', campus: 'wonju', leaveRequests: [] },
  { id: 'b', name: '나', campus: 'wonju', leaveRequests: [
    { id: 'l', type: 'morning', slot: 'morning', date: '2026-07-06', status: 'approved' } as any,
  ] },
  { id: 'c', name: '다', campus: 'chungju', leaveRequests: [] },
];

const attended = new Set<string>([
  'a|2026-07-06', // a는 그날 등원함 → 부분X면 이탈
  'b|2026-07-06',
]);

const marks = [
  // a: 2026-07-06 부분 X(2,3교시) + 등원 → 이탈일 1
  { date: '2026-07-06', seatKey: 'a:2' },
  { date: '2026-07-06', seatKey: 'a:3' },
  // a: 2026-07-07 등원기록 없음 + X → 결석일 1
  { date: '2026-07-07', seatKey: 'a:4' },
  // b: 2026-07-06 오전(0,1) X지만 오전반차 승인 → 정당사유 제외 → 카운트 0
  { date: '2026-07-06', seatKey: 'b:0' },
  { date: '2026-07-06', seatKey: 'b:1' },
  // c: 2026-07-06 일괄 X(0~6 전부) + 등원기록 없음 → 결석일 1 (일괄)
  ...Array.from({ length: OPERATING_PERIODS }, (_, i) => ({ date: '2026-07-06', seatKey: `c:${i}` })),
  // 휴대폰키·범위밖 → 무시
  { date: '2026-07-06', seatKey: 'a:phone_D' },
  { date: '2026-07-06', seatKey: 'a:7' },
];

const rows = buildAbsenceRanking(marks, attended, students);

const a = rows.find((r) => r.studentId === 'a')!;
assert.ok(a && a.absentDays === 1 && a.leftDays === 1, 'a 결석1·이탈1');
assert.strictEqual(a.totalMarks, 3, 'a 총마크 3(2+1, phone·idx7 제외)');
assert.strictEqual(a.lastDate, '2026-07-07', 'a 최근일');

assert.ok(!rows.find((r) => r.studentId === 'b'), 'b 정당사유로 제외(행 없음)');

const c = rows.find((r) => r.studentId === 'c')!;
assert.ok(c && c.absentDays === 1 && c.leftDays === 0, 'c 일괄→결석1');

// 정렬: 결석 desc 우선 → c(결석1) 가 a(결석1) 와 동률이면 leftDays desc → a(이탈1) 먼저
// a: absent1,left1 / c: absent1,left0 → a가 위 (left desc)
assert.strictEqual(rows[0].studentId, 'a', '정렬: 동률 결석시 이탈 많은 a 우선');

console.log('PASS: absence-stats');
```

- [ ] **Step 2: 실패 확인**

Run: `npx tsx scripts/verify-absence-stats.mts`
Expected: FAIL — `parseSeatPeriodKey is not a function`(모듈 미작성)

- [ ] **Step 3: 모듈 구현**

`lib/absence-stats.ts` 생성:

```typescript
import type { Student } from '@/lib/types/student';
import { isPeriodCoveredByApprovedLeave } from '@/lib/leave-blocks';

// 운영 교시 수: seat-board PERIODS idx 0~6 = 1~7교시. 8교시 'A'(idx 7)는 수기 비대상.
export const OPERATING_PERIODS = 7;

export interface AbsenceRankRow {
  studentId: string;
  name: string;
  campus: string;
  absentDays: number; // 결석일(등원없음 OR 일괄X)
  leftDays: number;   // 이탈일(등원+부분X)
  totalMarks: number; // 정당사유 제외 후 남은 X 마크 수
  lastDate: string;
}

// seat_key "{studentId}:{idx}" 파싱. 콜론 첫 위치 기준(studentId엔 콜론 없음).
// phone_·숫자아님 → null.
export function parseSeatPeriodKey(seatKey: string): { studentId: string; periodIdx: number } | null {
  const i = seatKey.indexOf(':');
  if (i < 0) return null;
  const studentId = seatKey.slice(0, i);
  const tail = seatKey.slice(i + 1);
  if (!/^\d+$/.test(tail)) return null; // phone_D 등 제외
  return { studentId, periodIdx: Number(tail) };
}

export function buildAbsenceRanking(
  rawMarks: { date: string; seatKey: string }[],
  attendedDays: Set<string>,
  students: Pick<Student, 'id' | 'name' | 'campus' | 'leaveRequests'>[],
): AbsenceRankRow[] {
  const studentMap = new Map(students.map((s) => [s.id, s]));

  // studentId -> date -> Set<periodIdx>(0~6)
  const grouped = new Map<string, Map<string, Set<number>>>();
  for (const m of rawMarks) {
    const p = parseSeatPeriodKey(m.seatKey);
    if (!p) continue;
    if (p.periodIdx < 0 || p.periodIdx > OPERATING_PERIODS - 1) continue; // 0~6만
    if (!studentMap.has(p.studentId)) continue;
    let byDate = grouped.get(p.studentId);
    if (!byDate) { byDate = new Map(); grouped.set(p.studentId, byDate); }
    let idxs = byDate.get(m.date);
    if (!idxs) { idxs = new Set(); byDate.set(m.date, idxs); }
    idxs.add(p.periodIdx);
  }

  const rows: AbsenceRankRow[] = [];
  for (const [studentId, byDate] of grouped) {
    const student = studentMap.get(studentId)!;
    let absentDays = 0, leftDays = 0, totalMarks = 0, lastDate = '';
    for (const [date, idxs] of byDate) {
      // 정당사유(승인휴가) 덮인 교시 제외
      const effective = [...idxs].filter((idx) => !isPeriodCoveredByApprovedLeave(student, date, idx));
      if (effective.length === 0) continue; // 전부 정당사유 → 그 날 카운트 안 함
      totalMarks += effective.length;
      const isBulk = idxs.size === OPERATING_PERIODS; // 7교시 전부 마크 = 일괄(하루종일)
      const hasSession = attendedDays.has(`${studentId}|${date}`);
      if (isBulk || !hasSession) absentDays++; else leftDays++;
      if (date > lastDate) lastDate = date;
    }
    if (absentDays + leftDays > 0) {
      rows.push({ studentId, name: student.name, campus: student.campus, absentDays, leftDays, totalMarks, lastDate });
    }
  }

  rows.sort((a, b) =>
    b.absentDays - a.absentDays ||
    b.leftDays - a.leftDays ||
    b.totalMarks - a.totalMarks ||
    a.name.localeCompare(b.name, 'ko'),
  );
  return rows;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx tsx scripts/verify-absence-stats.mts`
Expected: `PASS: absence-stats`

- [ ] **Step 5: 타입 체크 + 커밋**

```bash
npx tsc --noEmit
git add lib/absence-stats.ts scripts/verify-absence-stats.mts
git commit -m "feat: 출결 이탈·결석 순위 순수 집계 모듈(buildAbsenceRanking)"
```

---

### Task 3: 데이터 조회 헬퍼 (seat_statuses 범위 · 등원일)

**Files:**
- Modify: `lib/supabase.ts` (supabase 조회 2종)
- Modify: `lib/store.ts` (store 래퍼 2종)

**Interfaces:**
- Produces:
  - `getSeatAbsenceMarks(from: string, to: string): Promise<{ date: string; seatKey: string }[]>` (store) — status `absent` 마크만, date BETWEEN from~to.
  - `getAttendedDays(from: string, to: string): Promise<Set<string>>` (store) — `"${studentId}|${date}"` 집합.

- [ ] **Step 1: supabase 조회 추가**

`lib/supabase.ts` 끝부분(다른 export 함수들 근처)에 추가:

```typescript
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

// 기간 내 등원일 집합 "studentId|date".
export async function getAttendedDaysSupabase(from: string, to: string): Promise<Set<string>> {
  const { data, error } = await getClient()
    .from('study_sessions')
    .select('student_id, date')
    .gte('date', from)
    .lte('date', to);
  if (error) throw error;
  const set = new Set<string>();
  for (const r of data || []) {
    if (r.student_id && r.date) set.add(`${r.student_id}|${r.date}`);
  }
  return set;
}
```

> `getClient`는 이 파일에서 이미 사용 중인 supabase 클라이언트 헬퍼. 동일하게 사용.

- [ ] **Step 2: store 래퍼 추가**

`lib/store.ts`에서 study-session 관련 함수들 근처(라인 397~404 부근)에 추가. seat_statuses는 로컬 폴백 파일(`data/seat_statuses.json`)도 지원하므로 dual 패턴:

```typescript
// (상단 import에 추가)
// import { ..., getSeatAbsenceMarksSupabase, getAttendedDaysSupabase } from './supabase';
import fs from 'fs';
import path from 'path';

// 기간 내 수기 결석 마크. Supabase 또는 로컬(data/seat_statuses.json) 폴백.
export async function getSeatAbsenceMarks(from: string, to: string): Promise<{ date: string; seatKey: string }[]> {
  if (isSupabaseConfigured()) return getSeatAbsenceMarksSupabase(from, to);
  // 로컬 폴백: seat-status 라우트와 동일 파일 구조
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
```

> `isSupabaseConfigured`는 이 파일에서 이미 사용 중. `fs`/`path`가 이미 import돼 있으면 재import하지 말 것.

- [ ] **Step 3: 타입 체크 + 빌드**

Run: `npx tsc --noEmit && npm run build`
Expected: 성공.

- [ ] **Step 4: 커밋**

```bash
git add lib/supabase.ts lib/store.ts
git commit -m "feat: 출결 순위용 조회 헬퍼(seat_statuses 범위·등원일 집합)"
```

---

### Task 4: 순위 API 엔드포인트

**Files:**
- Create: `app/api/admin/attendance/absence-ranking/route.ts`

**Interfaces:**
- Consumes: `buildAbsenceRanking`(Task 2), `getSeatAbsenceMarks`/`getAttendedDays`(Task 3), `getStudents`/`getAdminSession`.
- Produces: `GET /api/admin/attendance/absence-ranking?from=&to=&campus=` → `{ success, rows: AbsenceRankRow[], from, to }`.

- [ ] **Step 1: 라우트 작성**

`app/api/admin/attendance/absence-ranking/route.ts` 생성:

```typescript
import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { getStudents, getSeatAbsenceMarks, getAttendedDays } from '@/lib/store';
import { buildAbsenceRanking } from '@/lib/absence-stats';

function kstToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}
function monthStart(): string {
  return kstToday().slice(0, 8) + '01';
}
const YMD = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get('from') || monthStart();
  const to = url.searchParams.get('to') || kstToday();
  const campusFilter = url.searchParams.get('campus');
  if (!YMD.test(from) || !YMD.test(to) || from > to) {
    return NextResponse.json({ success: false, message: '기간이 올바르지 않습니다.' }, { status: 400 });
  }

  try {
    const [marks, attended, allStudents] = await Promise.all([
      getSeatAbsenceMarks(from, to),
      getAttendedDays(from, to),
      getStudents(),
    ]);

    // 센터 스코프: campus_admin은 자기 센터, master는 전체(?campus로 단일 필터).
    let students = allStudents;
    if (session.campus !== 'all') {
      students = students.filter((s) => s.campus === session.campus);
    } else if (campusFilter) {
      students = students.filter((s) => s.campus === campusFilter);
    }

    const rows = buildAbsenceRanking(marks, attended, students);
    return NextResponse.json({ success: true, rows, from, to });
  } catch (err) {
    console.error('[absence-ranking GET]', err);
    return NextResponse.json({ success: false, message: '집계에 실패했습니다.', rows: [] }, { status: 500 });
  }
}
```

> `buildAbsenceRanking`이 `studentMap`으로 학생을 필터하므로, 센터 스코프된 students만 넘기면 그 센터 학생 마크만 집계된다(타 센터 studentId 마크는 자동 제외).

- [ ] **Step 2: 타입 체크 + 빌드**

Run: `npx tsc --noEmit && npm run build`
Expected: 성공. 새 동적 라우트 컴파일 확인.

- [ ] **Step 3: 수동 검증 메모**

report에 "수동 확인 필요: 관리자 로그인 후 `/api/admin/attendance/absence-ranking` 호출 시 rows 반환, 센터 관리자는 자기 센터만" 남겨라.

- [ ] **Step 4: 커밋**

```bash
git add app/api/admin/attendance/absence-ranking/route.ts
git commit -m "feat: 이탈·결석 순위 API(/api/admin/attendance/absence-ranking)"
```

---

### Task 5: 출결 상세 표 내 순위 탭 UI

**Files:**
- Modify: `app/admin/attendance/page.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/attendance/absence-ranking?from=&to=` (Task 4), `AbsenceRankRow` 형태.
- Produces: UI만.

- [ ] **Step 1: 먼저 읽기**

`app/admin/attendance/page.tsx` 전체 구조 파악 — 기존 화면이 단일 표인지/탭이 있는지, 학생 상세 시트 여는 방법(`useAdminGlobalSheet`), 기간/필터 상태 패턴, 카드/표 스타일.

- [ ] **Step 2: 탭 + 순위 패널 추가**

기존 출결 상세 표 화면 상단에 탭 토글(`'상세' | '이탈·결석 순위'`)을 추가하고, 순위 탭 선택 시 아래 패널을 렌더. 기간 프리셋 + fetch + 표:

```tsx
// 상태
const [tab, setTab] = useState<'detail' | 'ranking'>('detail');
const [period, setPeriod] = useState<'week' | 'month' | 'last30'>('month');
const [ranking, setRanking] = useState<AbsenceRankRow[]>([]);
const [rankingLoading, setRankingLoading] = useState(false);

// 타입(파일 상단 또는 인접)
interface AbsenceRankRow {
  studentId: string; name: string; campus: string;
  absentDays: number; leftDays: number; totalMarks: number; lastDate: string;
}

// 기간 → from/to (KST)
function rangeFor(p: 'week' | 'month' | 'last30'): { from: string; to: string } {
  const fmt = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(d);
  const to = fmt(new Date());
  if (p === 'month') return { from: to.slice(0, 8) + '01', to };
  const days = p === 'week' ? 6 : 29;
  const fromD = new Date(Date.now() - days * 86400000);
  return { from: fmt(fromD), to };
}

const loadRanking = useCallback(async () => {
  setRankingLoading(true);
  try {
    const { from, to } = rangeFor(period);
    const res = await fetch(`/api/admin/attendance/absence-ranking?from=${from}&to=${to}`);
    const json = await res.json();
    if (json.success) setRanking(json.rows as AbsenceRankRow[]);
    else { setRanking([]); toast.error(json.message || '집계 실패'); }
  } finally {
    setRankingLoading(false);
  }
}, [period]);

useEffect(() => { if (tab === 'ranking') loadRanking(); }, [tab, loadRanking]);
```

표 렌더(결석 1순위 정렬은 서버가 보장):

```tsx
{tab === 'ranking' && (
  <div className="...">
    {/* 기간 프리셋 */}
    <div className="flex gap-2">
      {(['week','month','last30'] as const).map((p) => (
        <button key={p} onClick={() => setPeriod(p)}
          className={period === p ? '...활성...' : '...'}>
          {p === 'week' ? '이번주' : p === 'month' ? '이번달' : '지난 30일'}
        </button>
      ))}
    </div>
    {/* 요약 */}
    <div className="text-sm text-[#86868B]">
      대상 {ranking.length}명 · 총 결석 {ranking.reduce((s, r) => s + r.absentDays, 0)}일 · 총 이탈 {ranking.reduce((s, r) => s + r.leftDays, 0)}일
    </div>
    {/* 표 */}
    <table>
      <thead><tr><th>#</th><th>학생</th><th>결석일</th><th>이탈일</th><th>총X</th><th>최근</th></tr></thead>
      <tbody>
        {ranking.map((r, i) => (
          <tr key={r.studentId} onClick={() => openSheet(r.studentId)} className="cursor-pointer">
            <td>{i + 1}</td>
            <td>{r.name} <span className="text-xs text-[#86868B]">{r.campus}</span></td>
            <td className="text-rose-600 font-semibold">{r.absentDays}</td>
            <td className="text-amber-600 font-semibold">{r.leftDays}</td>
            <td>{r.totalMarks}</td>
            <td className="text-xs">{r.lastDate}</td>
          </tr>
        ))}
        {!rankingLoading && ranking.length === 0 && (
          <tr><td colSpan={6} className="text-center text-[#86868B] py-6">해당 기간 기록 없음</td></tr>
        )}
      </tbody>
    </table>
  </div>
)}
```

> `openSheet(studentId)`는 이 페이지가 이미 쓰는 학생 상세 시트 열기 함수(`useAdminGlobalSheet`)에 맞춰 호출. 실제 함수명/시그니처는 Step 1에서 확인해 사용. 표/버튼 스타일·다크모드는 페이지 기존 컨벤션. 보라/인디고 금지.

- [ ] **Step 3: 타입 체크 + 빌드**

Run: `npx tsc --noEmit && npm run build`
Expected: 성공.

- [ ] **Step 4: 수동 검증 메모**

report에 "수동 확인 필요: /admin/attendance → '이탈·결석 순위' 탭 → 기간 전환 시 순위 갱신, 행 클릭 시 학생 상세" 남겨라.

- [ ] **Step 5: 커밋**

```bash
git add app/admin/attendance/page.tsx
git commit -m "feat: 출결 상세 표에 이탈·결석 순위 탭"
```

---

## 최종 검증

- [ ] 순수로직: `npx tsx scripts/verify-absence-stats.mts` → PASS
- [ ] `npx tsc --noEmit` 무에러
- [ ] `npm run build` 성공
- [ ] (운영 반영 전) 시각·동작 최종확인은 사용자 본인. **자동 PASS 선언 금지.**

## 자기 검토 메모(작성자)
- 스펙 커버리지: leave-blocks 추출(Task1)·집계 정의/일괄/정당사유 제외/정렬(Task2)·조회(Task3)·권한·기본기간(Task4)·탭/프리셋/표(Task5) 모두 매핑.
- 타입 일관: `AbsenceRankRow`(absentDays/leftDays/totalMarks/lastDate)·`buildAbsenceRanking`·`parseSeatPeriodKey`·`isPeriodCoveredByApprovedLeave` 명칭 Task 간 일치.
- 마이그레이션 없음, 신규 env 없음.
