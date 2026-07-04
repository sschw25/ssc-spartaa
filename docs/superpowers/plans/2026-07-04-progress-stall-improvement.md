# 진도 정체 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 승인된 휴가일을 진도 정체 판정에서 제외하고, 그만큼의 보강량을 안내하며, 과목별 진도 입력 히트맵을 학생 화면에 추가한다.

**Architecture:** 순수 로직은 `lib/progress-plan.ts`를 확장(휴가일 제외 + 보강 헬퍼). 진도 입력 이력은 자료(`BookProgress`/`LectureProgress`)의 새 `inputLog` 필드에 학생 진도 API에서 append(지금부터 축적). UI는 `subject-progress-tab.tsx`(히트맵·보강배지)와 `home-overview-tab.tsx`(홈 한 줄).

**Tech Stack:** Next.js 16(App Router), TypeScript, Supabase(subjects JSONB), Tailwind.

## Global Constraints

- **마이그레이션 없음** — `inputLog`는 `subjects` JSONB 안에 저장. 새 컬럼/ALTER 금지.
- **날짜는 KST `YYYY-MM-DD`** — `new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' })`.
- **면제 휴가 = 승인된 결석성 전부** — `leaveRequests` 중 `status === 'approved'`인 모든 타입, 반차도 그날 전부.
- **status는 학생·관리자 공용** — `getManagedProgressItems`는 dashboard/consultation/학생 리포트에서 함께 쓰인다.
- **테스트 러너 없음** — 이 레포의 `npm run test` = `lint --quiet && typecheck`. 각 태스크 검증 = `npm run typecheck` + 미리보기(3000 포트, ssc-spartaa) 직접 확인.
- **하위호환** — 기존 함수 시그니처엔 optional 파라미터만 추가.
- **inputLog append 범위(v1)** — 학생 자가 입력 경로(`/api/student/progress`)만. 관리자 입력 로깅은 후속.

---

### Task 1: 휴가일 제외 (정체 판정 버그 수정)

**Files:**
- Modify: `lib/progress-plan.ts` (getLeaveDates 추가, countStudyDaysInRange·getExpectedWithinCurrentPlan·getExpectedFromPlans·buildItem·getManagedProgressItems 시그니처 확장)

**Interfaces:**
- Produces:
  - `getLeaveDates(student: Student): Set<string>`
  - `toDateKey(d: Date): string` (로컬 Y-M-D)
  - `countStudyDaysInRange(start, end, studyDays?, leaveDates?: Set<string>): number` (leaveDates 파라미터 추가)

- [ ] **Step 1: getLeaveDates + toDateKey 헬퍼 추가**

`lib/progress-plan.ts` 상단 `parseDate` 근처에 추가:

```ts
// 반복 iteration 은 로컬 자정 Date 로 도니 로컬 Y-M-D 로 키를 만든다(leaveRequests.date 와 동일 캘린더 기준).
export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 승인된 결석성 휴가 날짜 집합(YYYY-MM-DD). 반차/휴식/병가/개인휴가 모두, 반차도 그날 전부 면제.
export function getLeaveDates(student: Student): Set<string> {
  const dates = new Set<string>();
  for (const req of student.leaveRequests || []) {
    if (req.status !== 'approved') continue;
    if (typeof req.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.date)) dates.add(req.date);
  }
  return dates;
}
```

- [ ] **Step 2: countStudyDaysInRange 에 leaveDates 파라미터 추가**

기존 함수를 교체:

```ts
export function countStudyDaysInRange(start: Date, end: Date, studyDays?: string[], leaveDates?: Set<string>) {
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setHours(0, 0, 0, 0);

  let count = 0;
  while (cursor <= last) {
    if (isStudyDay(cursor, studyDays) && !(leaveDates && leaveDates.has(toDateKey(cursor)))) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}
```

- [ ] **Step 3: 기대치 계산 경로에 leaveDates 전달**

`getExpectedWithinCurrentPlan` 시그니처에 `leaveDates?: Set<string>` 추가하고, **경과 학습일(elapsedStudyDays) 계산에만** 전달(분모 totalStudyDays 는 그대로 — 보강은 별도 어드바이저리):

```ts
function getExpectedWithinCurrentPlan(plan: DetailedPlan, today: Date, studyDays?: string[], createdAt?: string, inclusiveToday = false, leaveDates?: Set<string>) {
  // ... (start/end/bounds 동일) ...
  const elapsedStudyDays = countStudyDaysInRange(effectiveStart, upperBound, studyDays, leaveDates);
  if (elapsedStudyDays <= 0) return beforePlanAmount;
  const totalStudyDays = Math.max(1, countStudyDaysInRange(start, end, studyDays)); // 분모는 leave 미반영
  // ... 나머지 동일 ...
}
```

`getExpectedFromPlans` 에 `leaveDates?: Set<string>` 추가하고 `getExpectedWithinCurrentPlan(plan, today, studyDays, createdAt, inclusiveToday, leaveDates)` 로 전달.

- [ ] **Step 4: buildItem·getManagedProgressItems 에 leaveDates 연결**

`buildItem(student, subjectName, material, type, today, studyDays?, leaveDates?: Set<string>)` 로 파라미터 추가하고, 내부 `getExpectedFromPlans(material.detailedPlans, today, studyDays, progressBaselineDate)` →  `getExpectedFromPlans(material.detailedPlans, today, studyDays, progressBaselineDate, false, leaveDates)`.

`getManagedProgressItems` 에서 학생별 1회 계산해 전달:

```ts
return students.flatMap((student) => {
  const leaveDates = getLeaveDates(student);
  if (student.subjects && student.subjects.length > 0) {
    return student.subjects.flatMap((subject) => [
      ...(subject.books || []).map((book) => buildItem(student, subject.name, book, 'book', today, subject.studyDays, leaveDates)),
      ...(subject.lectures || []).map((lecture) => buildItem(student, subject.name, lecture, 'lecture', today, subject.studyDays, leaveDates)),
    ]);
  }
  return [
    ...(student.books || []).map((book) => buildItem(student, '기본', book, 'book', today, undefined, leaveDates)),
    ...(student.lectures || []).map((lecture) => buildItem(student, '기본', lecture, 'lecture', today, undefined, leaveDates)),
  ];
});
```

- [ ] **Step 5: 타입체크**

Run: `npm run typecheck`
Expected: PASS (기존 호출부는 optional 파라미터라 무영향).

- [ ] **Step 6: 미리보기 검증**

`preview_start "ssc-spartaa"`. 관리자 대시보드(`/admin/dashboard`) "진도 지연" 카운트를, 어제/최근 승인 휴가가 있는 학생 기준으로 확인 — 휴가일이 정체 산정에서 빠져 카운트가 줄거나 해당 학생이 목록에서 빠지는지. (운영 데이터라 읽기만.)

- [ ] **Step 7: 커밋**

```bash
git add lib/progress-plan.ts
git commit -m "fix(progress): 승인 휴가일을 진도 정체 판정에서 제외"
```

---

### Task 2: 보강량 헬퍼 getMakeupAmount

**Files:**
- Modify: `lib/progress-plan.ts`

**Interfaces:**
- Consumes: `countStudyDaysInRange`(Task 1), `getLeaveDates`(Task 1), `parseDate`, `isStudyDay`
- Produces: `getMakeupAmount(material: BookProgress | LectureProgress, today: Date, studyDays: string[] | undefined, leaveDates: Set<string>): { makeupTotal: number; perDay: number }`

- [ ] **Step 1: 헬퍼 구현**

`lib/progress-plan.ts` 에 추가:

```ts
// 이번 주(현재 활성 일일 plan 창) 안에서 오늘 이전 휴가 학습일 × 일일량을 남은 학습일(오늘~창끝)에 분배.
// 기간 목표(periodType) plan 은 제외. 남은 학습일 0 이면 makeup 0.
export function getMakeupAmount(
  material: BookProgress | LectureProgress,
  today: Date,
  studyDays: string[] | undefined,
  leaveDates: Set<string>,
): { makeupTotal: number; perDay: number } {
  const day = new Date(today); day.setHours(0, 0, 0, 0);
  const plans = (material.detailedPlans || []).filter((p) => !p.periodType);
  const active = plans.find((p) => {
    const s = parseDate(p.startDate);
    const e = parseDate(p.endDate);
    return s && e && s <= day && day <= e;
  });
  if (!active) return { makeupTotal: 0, perDay: 0 };

  const start = parseDate(active.startDate)!;
  const end = parseDate(active.endDate)!;
  const dailyAmount = Math.max(1, Math.round(active.dailyAmount ?? Math.ceil((active.targetAmount || 1) / 6)));

  const yesterday = new Date(day); yesterday.setDate(day.getDate() - 1);
  let leaveStudyDaysBefore = 0;
  const cur = new Date(start); cur.setHours(0, 0, 0, 0);
  while (cur <= yesterday && cur <= end) {
    if (isStudyDay(cur, studyDays) && leaveDates.has(toDateKey(cur))) leaveStudyDaysBefore++;
    cur.setDate(cur.getDate() + 1);
  }
  if (leaveStudyDaysBefore === 0) return { makeupTotal: 0, perDay: 0 };

  const makeupTotal = leaveStudyDaysBefore * dailyAmount;
  const remaining = countStudyDaysInRange(day, end, studyDays, leaveDates); // 오늘~창끝, 휴가일 제외
  const perDay = remaining > 0 ? Math.ceil(makeupTotal / remaining) : makeupTotal;
  return { makeupTotal, perDay };
}
```

- [ ] **Step 2: 타입체크**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add lib/progress-plan.ts
git commit -m "feat(progress): 휴가 보강량(getMakeupAmount) 헬퍼"
```

---

### Task 3: inputLog 필드 + 진도 입력 시 append

**Files:**
- Modify: `lib/types/student.ts` (BookProgress·LectureProgress 에 inputLog 추가)
- Modify: `app/api/student/progress/route.ts` (appendInputLog 헬퍼 + 각 material 갱신 지점에서 호출)

**Interfaces:**
- Produces: `BookProgress.inputLog?: string[]`, `LectureProgress.inputLog?: string[]`

- [ ] **Step 1: 타입에 inputLog 추가**

`lib/types/student.ts` `BookProgress` 와 `LectureProgress` 각각에 `detailedPlans` 아래 추가:

```ts
  inputLog?: string[]; // 진도 입력한 날(KST YYYY-MM-DD), 중복제거·최근 120일 캡 — 히트맵용
```

- [ ] **Step 2: appendInputLog 헬퍼 추가**

`app/api/student/progress/route.ts` 상단(clampProgressValue 근처)에 추가:

```ts
const kstToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());

function appendInputLog(material: { inputLog?: string[] }) {
  const today = kstToday();
  const log = material.inputLog || [];
  const next = log.includes(today) ? log : [...log, today];
  material.inputLog = next.slice(-120); // 최근 120일만 유지
}
```

- [ ] **Step 3: 일반 진도 갱신 지점에서 호출**

`applyProgressMutation` 의 book 갱신 forEach(현재 `book.currentPage = nextValue; book.updatedAt = nowIso;`)에 `appendInputLog(book);` 추가. lecture 갱신 forEach(`lecture.completedLectures = nextValue; lecture.updatedAt = nowIso;`)에도 `appendInputLog(lecture);` 추가.

- [ ] **Step 4: 기간 목표 갱신 지점에서도 호출**

`applyDeadlineMutation` 의 `matchingBooks.forEach((book) => { book.currentPage = nextCurrent; book.updatedAt = nowIso; })` 에 `appendInputLog(book);`, lecture 쪽에도 `appendInputLog(lecture);` 추가.

- [ ] **Step 5: 타입체크**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 6: 미리보기 검증**

미리보기에서 학생 로그인 → 진도 탭에서 아무 자료나 진도 입력 → `/api/report/[id]` 응답 또는 DB에서 해당 자료 `inputLog` 에 오늘(KST) 날짜가 들어갔는지 확인.

- [ ] **Step 7: 커밋**

```bash
git add lib/types/student.ts app/api/student/progress/route.ts
git commit -m "feat(progress): 진도 입력일 로그(inputLog) 축적"
```

---

### Task 4: 과목별 입력 히트맵 스트립 (진도 탭)

**Files:**
- Modify: `components/report/subject-progress-tab.tsx` (자료 카드에 히트맵 추가)

**Interfaces:**
- Consumes: `material.inputLog`(Task 3), `getLeaveDates`·`toDateKey`·`isStudyDay`(from `@/lib/progress-plan`)

- [ ] **Step 1: 히트맵 서브컴포넌트 추가**

`subject-progress-tab.tsx` 안(파일 상단 helper 영역)에 추가. 최근 35일(5주)을 가로 셀로: 파랑=입력, 옅은칸=학습일·미입력, 점=비학습일/휴가일.

```tsx
import { isStudyDay, toDateKey } from '@/lib/progress-plan';

function InputHeatmap({ inputLog, studyDays, leaveDates }: { inputLog?: string[]; studyDays?: string[]; leaveDates: Set<string> }) {
  const done = new Set(inputLog || []);
  const cells: { key: string; state: 'done' | 'miss' | 'off' }[] = [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (let i = 34; i >= 0; i--) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    const key = toDateKey(d);
    const off = !isStudyDay(d, studyDays) || leaveDates.has(key);
    const state = done.has(key) ? 'done' : off ? 'off' : 'miss';
    cells.push({ key, state });
  }
  return (
    <div className="flex flex-wrap gap-[3px]" aria-label="진도 입력 히트맵">
      {cells.map((c) => (
        <span
          key={c.key}
          title={`${c.key} · ${c.state === 'done' ? '입력함' : c.state === 'miss' ? '미입력' : '비학습/휴가'}`}
          className={
            c.state === 'done'
              ? 'h-3 w-3 rounded-[3px] bg-[#0071E3]'
              : c.state === 'miss'
              ? 'h-3 w-3 rounded-[3px] bg-slate-100 dark:bg-white/5'
              : 'h-3 w-3 rounded-[3px] bg-transparent ring-1 ring-inset ring-slate-100 dark:ring-white/5'
          }
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: 각 자료 카드에 히트맵 렌더**

`subject-progress-tab.tsx` 에서 `student` 로 `const leaveDates = React.useMemo(() => getLeaveDates(student), [student])` 계산(상단 import: `import { getLeaveDates } from '@/lib/progress-plan'`). 각 교재/인강 카드 본문에 `<InputHeatmap inputLog={material.inputLog} studyDays={subject?.studyDays} leaveDates={leaveDates} />` 삽입(자료의 소속 subject.studyDays 전달; subjects 없으면 undefined).

- [ ] **Step 3: 미리보기 검증**

미리보기에서 진도 탭 진입 → 각 자료에 히트맵 스트립이 뜨고, Task 3 에서 입력한 날이 파랑으로 보이는지 확인.

- [ ] **Step 4: 커밋**

```bash
git add components/report/subject-progress-tab.tsx
git commit -m "feat(progress): 과목별 진도 입력 히트맵 스트립"
```

---

### Task 5: 보강 배지(진도 탭) + 홈 한 줄

**Files:**
- Modify: `components/report/subject-progress-tab.tsx` (자료별 보강 배지 + 오늘 권장 반영)
- Modify: `components/report/home-overview-tab.tsx` (makeup>0 한 줄 안내)

**Interfaces:**
- Consumes: `getMakeupAmount`·`getLeaveDates`(from `@/lib/progress-plan`)

- [ ] **Step 1: 진도 탭 자료 카드에 보강 배지**

`subject-progress-tab.tsx` 각 자료 카드에서:

```tsx
import { getMakeupAmount } from '@/lib/progress-plan';
// 카드 내부
const makeup = getMakeupAmount(material, new Date(), subject?.studyDays, leaveDates);
{makeup.makeupTotal > 0 && (
  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-700">
    보강 +{makeup.makeupTotal} (하루 +{makeup.perDay})
  </span>
)}
```

- [ ] **Step 2: 홈 한 줄 안내**

`home-overview-tab.tsx` 에서 학생 자료 전체에 대해 makeup 합을 계산(`getLeaveDates(student)` 1회 + 각 자료 `getMakeupAmount`), 합>0 이면 브리핑/오늘 할 일 영역에 한 줄:

```tsx
{totalMakeup > 0 && (
  <p className="rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[11px] font-semibold text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
    어제 휴가로 이번 주 보강이 있어요 — 진도 탭에서 자료별 보강량을 확인하세요.
  </p>
)}
```

`totalMakeup` = `student.subjects?.flatMap(s => [...(s.books||[]), ...(s.lectures||[])].map(m => getMakeupAmount(m, new Date(), s.studyDays, leaveDates).makeupTotal)).reduce((a,b)=>a+b,0)` (subjects 없으면 books/lectures 폴백, studyDays undefined).

- [ ] **Step 3: 타입체크 + 미리보기 검증**

Run: `npm run typecheck`
미리보기: 승인 휴가가 이번 주에 있는 학생에서 진도 탭 보강 배지·홈 한 줄이 뜨는지, 휴가 없는 주엔 안 뜨는지 확인.

- [ ] **Step 4: 커밋**

```bash
git add components/report/subject-progress-tab.tsx components/report/home-overview-tab.tsx
git commit -m "feat(progress): 휴가 보강 배지(진도탭) + 홈 안내"
```

---

## Self-Review

- **Spec coverage:** ① 휴가일 제외=Task 1 ✓ / ② 보강=Task 2(계산)+Task 5(표시) ✓ / ③ 히트맵=Task 3(로그)+Task 4(UI) ✓. 마이그레이션 없음 ✓(inputLog=JSONB). 학생·관리자 공용 status ✓(Task 1 getManagedProgressItems).
- **Placeholder scan:** 실제 코드/경로/커맨드 포함, TBD 없음.
- **Type consistency:** `getLeaveDates`/`toDateKey`/`countStudyDaysInRange(…, leaveDates)`/`getMakeupAmount({makeupTotal, perDay})`/`inputLog?: string[]` 태스크 간 시그니처 일치.
- **알려진 스코프:** 관리자 진도 입력 로깅은 v1 제외(학생 자가 입력만). 히트맵은 지금부터 축적(과거 공란).
