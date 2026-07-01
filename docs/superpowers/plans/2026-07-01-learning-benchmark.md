# 학습 벤치마크 (교재·강의 데이터 비교) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 같은 교재·강의를 공부한 다른 학생들의 데이터를 익명 집계 평균으로 관리자·학생에게 보여주고, 늦게 시작한 학생도 "시작 후 경과 기준" 상대 위치로 효능감을 갖게 한다.

**Architecture:** 순수 집계 엔진(`lib/learning-benchmark.ts`)이 전체 학생 배열을 받아 교재/강의 단위로 표본을 모으고(성실 진행자 필터), 집계 지표와 개인 비교를 계산한다. API 라우트가 인증·전체학원 로드·짧은 TTL 캐시를 담당하고, 공유 UI 컴포넌트가 관리자 진도 카드와 학생 리포트 양쪽에 동일하게 붙는다.

**Tech Stack:** Next.js(App Router) API route, TypeScript 순수 모듈, React(기존 컴포넌트 패턴), 검증은 `npx tsx` 스크립트 + `tsc --noEmit`.

## Global Constraints

- 최소 표본 게이트: `learnerCount >= 4` 아니면 카드 전체 미표시. 완료자 지표는 `completerCount >= 4` 아니면 해당 지표만 숨김.
- 캠퍼스 범위: **전체 학원 통합**(campus로 필터하지 않고 모든 학생 풀링).
- 방치 기준(성실 진행자 필터): 미완료 항목은 마지막 활동일이 최근 **21일** 이내여야 포함. 상수 `DEFAULT_ABANDON_DAYS = 21`, API에서 `app_settings` 키 `benchmark_abandon_days`로 오버라이드 가능.
- 진도 데이터 단일 소스: `students.subjects`(JSONB). `subjects`가 없으면 최상위 `books`/`lectures`(`기본` 과목)로 폴백 — `getManagedProgressItems`와 동일 규칙.
- UI 톤: 학생 화면도 **존댓말/격식체**("너" 등 반말 금지). 비교는 **표**로 제시.
- 디자인: iOS26 Liquid Glass — 기존 `.glass` 유틸/토큰 재사용, 보라/인디고 색 금지(메모리 [[color-system]]).
- 프라이버시: 개인 이름·개별 식별정보 미노출, 평균/분포/백분위만.
- 이 레포엔 단위테스트 프레임워크가 없다. 순수 로직 검증은 `scripts/*.mts`를 `npx tsx`로 실행하는 방식(기존 `scripts/verify-*.mts` 관례). 각 로직 태스크는 `tsc --noEmit`도 통과해야 한다.
- 커밋 메시지 말미: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## File Structure

| 파일 | 책임 | 신규/수정 |
|---|---|---|
| `lib/learning-benchmark.ts` | 순수: 동일성 키·표본 수집·필터·집계·개인비교 | 신규 |
| `scripts/test-learning-benchmark.mts` | 엔진 검증 스크립트(tsx) | 신규 |
| `app/api/learning-benchmark/route.ts` | 인증·전체학원 로드·TTL 캐시·엔진 호출 | 신규 |
| `components/learning/benchmark-section.tsx` | 공유 UI(집계 카드 + 개인비교 표 + n<4 폴백) | 신규 |
| `components/admin/detail-tabs/progress-tab.tsx` | 관리자 교재/강의 진도 카드에 섹션 삽입 | 수정 |
| `components/report/subject-progress-tab.tsx` | 학생 리포트 교재/강의별 섹션 삽입 | 수정 |

의존 방향: `benchmark-section` → API → `learning-benchmark`(엔진) → `progress-plan`/types. UI 두 곳은 `benchmark-section`만 소비.

---

### Task 1: 엔진 — 동일성 키 · 표본 수집 · 성실 진행자 필터

**Files:**
- Create: `lib/learning-benchmark.ts`
- Test: `scripts/test-learning-benchmark.mts`

**Interfaces:**
- Consumes: `Student`, `BookProgress`, `LectureProgress`, `DetailedPlan` (`@/lib/types/student`); `getExpectedFromPlans` (`@/lib/progress-plan`).
- Produces:
  - `type MaterialType = 'book' | 'lecture'`
  - `normalizeMaterialName(s: string): string`
  - `materialKey(type: MaterialType, subject: string, name: string): string`
  - `interface BenchmarkEntry { studentId; type: MaterialType; subject; name; total; current; percent; completed; startDate: string|null; finishDate: string|null; lastActivity: string|null; speedMultiplier?: number; targetDate?: string; status: 'ahead'|'on-track'|'behind'|'no-plan'; studyDays?: string[]; createdAt: string; dailyProgress: Array<{ date: string; cumAmount: number }> }`
  - `collectEntries(students: Student[], type: MaterialType, subject: string, name: string, today?: Date): BenchmarkEntry[]`
  - `filterSeriousCohort(entries: BenchmarkEntry[], today?: Date, abandonDays?: number): BenchmarkEntry[]`
  - `DEFAULT_ABANDON_DAYS = 21`

- [ ] **Step 1: Write the failing test**

Create `scripts/test-learning-benchmark.mts`:

```ts
// 실행: npx tsx scripts/test-learning-benchmark.mts
import assert from 'node:assert';
import {
  normalizeMaterialName, materialKey, collectEntries, filterSeriousCohort,
} from '../lib/learning-benchmark';
import type { Student } from '../lib/types/student';

const TODAY = new Date('2026-09-22'); // 화요일 기준일 고정

function lectureStudent(id: string, opts: {
  name?: string; total?: number; done?: number; speed?: number;
  completions?: Array<[string, number]>; updatedAt?: string; createdAt?: string;
  planStart?: string; planEnd?: string;
} = {}): Student {
  const name = opts.name ?? '행정법 기본강의';
  const total = opts.total ?? 30;
  const dailyCompletions: Record<string, { isCompleted: boolean; actualAmount?: number; completedAt?: string }> = {};
  for (const [date, amt] of opts.completions ?? []) {
    dailyCompletions[date] = { isCompleted: true, actualAmount: amt, completedAt: `${date}T09:00:00.000Z` };
  }
  return {
    id, name: `S${id}`, campus: 'wonju', manager: 'm',
    createdAt: opts.createdAt ?? '2026-07-01', updatedAt: opts.updatedAt ?? '2026-09-20',
    books: [], lectures: [], consultationLogs: [], grades: [],
    subjects: [{
      id: 'sub1', name: '행정법', studyDays: ['mon','tue','wed','thu','fri'],
      books: [], updatedAt: '2026-07-01',
      lectures: [{
        id: `lec_${id}`, name, totalLectures: total, completedLectures: opts.done ?? 0,
        updatedAt: opts.updatedAt ?? '2026-09-20', speedMultiplier: opts.speed,
        detailedPlans: (opts.planStart && opts.planEnd) ? [{
          id: 'p1', materialId: `lec_${id}`, weekNumber: 1,
          startDate: opts.planStart, endDate: opts.planEnd, targetAmount: total,
          rangeText: `1강 ~ ${total}강`, isCompleted: false, dailyCompletions,
        }] : (Object.keys(dailyCompletions).length ? [{
          id: 'p1', materialId: `lec_${id}`, weekNumber: 1,
          startDate: '2026-07-01', endDate: '2026-09-30', targetAmount: total,
          rangeText: `1강 ~ ${total}강`, isCompleted: false, dailyCompletions,
        }] : undefined),
      }],
    }],
  } as Student;
}

// normalize
assert.equal(normalizeMaterialName('  행정법  기본강의 '), '행정법 기본강의');
assert.equal(normalizeMaterialName('EBS 수능특강!!'), 'ebs 수능특강');
assert.equal(materialKey('lecture', '행정법', '행정법 기본강의'),
  'lecture|행정법|행정법 기본강의');

// collectEntries: 같은 강의명 3명 묶임
const students = [
  lectureStudent('1', { done: 30, completions: [['2026-07-05', 30]], updatedAt: '2026-08-01' }),
  lectureStudent('2', { done: 15, completions: [['2026-09-18', 15]], updatedAt: '2026-09-18' }),
  lectureStudent('3', { done: 0, updatedAt: '2026-07-02' }), // 미시작(방치)
];
const collected = collectEntries(students, 'lecture', '행정법', '행정법 기본강의', TODAY);
assert.equal(collected.length, 3);

// filterSeriousCohort: 미시작(done=0)·오래 방치는 제외
const serious = filterSeriousCohort(collected, TODAY, 21);
const ids = serious.map((e) => e.studentId).sort();
assert.deepEqual(ids, ['1', '2']); // 3번(진도0) 제외, 1번(완료), 2번(최근활동) 포함

// 완료 판정
const s1 = serious.find((e) => e.studentId === '1')!;
assert.equal(s1.completed, true);
assert.equal(s1.finishDate, '2026-07-05');
const s2 = serious.find((e) => e.studentId === '2')!;
assert.equal(s2.completed, false);
assert.equal(s2.finishDate, null);

console.log('Task 1 OK');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/test-learning-benchmark.mts`
Expected: FAIL — `Cannot find module '../lib/learning-benchmark'` (파일 없음).

- [ ] **Step 3: Write minimal implementation**

Create `lib/learning-benchmark.ts`:

```ts
import { Student, BookProgress, LectureProgress, DetailedPlan } from '@/lib/types/student';
import { getExpectedFromPlans } from '@/lib/progress-plan';

export type MaterialType = 'book' | 'lecture';
export const DEFAULT_ABANDON_DAYS = 21;
const DAY_MS = 1000 * 60 * 60 * 24;

export function normalizeMaterialName(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[!?.,~·\-_/\\()[\]{}"'`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function materialKey(type: MaterialType, subject: string, name: string): string {
  return `${type}|${normalizeMaterialName(subject)}|${normalizeMaterialName(name)}`;
}

export interface BenchmarkEntry {
  studentId: string;
  type: MaterialType;
  subject: string;
  name: string;
  total: number;
  current: number;
  percent: number;                 // 0..100
  completed: boolean;
  startDate: string | null;        // YYYY-MM-DD
  finishDate: string | null;       // YYYY-MM-DD (완료자만)
  lastActivity: string | null;     // YYYY-MM-DD
  speedMultiplier?: number;
  targetDate?: string;
  status: 'ahead' | 'on-track' | 'behind' | 'no-plan';
  studyDays?: string[];
  createdAt: string;
  dailyProgress: Array<{ date: string; cumAmount: number }>; // 날짜 오름차순 누적량
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

// dailyCompletions 에서 (날짜, 그날 완료량) 목록을 뽑아 날짜 오름차순 누적으로 변환
function buildDailyProgress(plans: DetailedPlan[] | undefined): Array<{ date: string; cumAmount: number }> {
  if (!plans) return [];
  const perDate = new Map<string, number>();
  for (const plan of plans) {
    const dc = plan.dailyCompletions;
    if (!dc) continue;
    for (const [date, v] of Object.entries(dc)) {
      if (!v?.isCompleted) continue;
      const amt = typeof v.actualAmount === 'number' && v.actualAmount > 0
        ? v.actualAmount
        : (plan.dailyAmount || 1);
      perDate.set(date, (perDate.get(date) || 0) + amt);
    }
  }
  const dates = [...perDate.keys()].sort();
  let cum = 0;
  return dates.map((date) => { cum += perDate.get(date)!; return { date, cumAmount: cum }; });
}

function earliestPlanStart(plans: DetailedPlan[] | undefined): string | null {
  if (!plans || plans.length === 0) return null;
  const starts = plans.map((p) => p.startDate).filter(Boolean).sort();
  return starts[0] ?? null;
}

function computeStatus(
  plans: DetailedPlan[] | undefined, current: number, today: Date,
  studyDays: string[] | undefined, createdAt: string,
): BenchmarkEntry['status'] {
  const expected = getExpectedFromPlans(plans, today, studyDays, createdAt);
  if (expected === null) return 'no-plan';
  if (current + 1 < expected) return 'behind';
  if (current >= expected) return 'ahead';
  return 'on-track';
}

function toEntry(
  student: Student, type: MaterialType, subject: string,
  material: BookProgress | LectureProgress, today: Date,
): BenchmarkEntry {
  const total = type === 'book' ? (material as BookProgress).totalPages : (material as LectureProgress).totalLectures;
  const current = type === 'book' ? (material as BookProgress).currentPage : (material as LectureProgress).completedLectures;
  const name = type === 'book' ? (material as BookProgress).title : (material as LectureProgress).name;
  const dailyProgress = buildDailyProgress(material.detailedPlans);
  const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  const completed = total > 0 && current >= total;

  const startFromPlan = earliestPlanStart(material.detailedPlans);
  const startFromDaily = dailyProgress[0]?.date ?? null;
  const startCandidates = [startFromPlan, startFromDaily].filter(Boolean).sort() as string[];
  const startDate = startCandidates[0] ?? (material.updatedAt ? material.updatedAt.split('T')[0] : null);

  const lastDaily = dailyProgress[dailyProgress.length - 1]?.date ?? null;
  const updatedStr = material.updatedAt ? material.updatedAt.split('T')[0] : null;
  const lastActivity = [lastDaily, updatedStr].filter(Boolean).sort().reverse()[0] ?? null;

  const finishDate = completed ? (lastDaily ?? updatedStr) : null;

  return {
    studentId: student.id, type, subject, name,
    total, current, percent, completed,
    startDate, finishDate, lastActivity,
    speedMultiplier: type === 'lecture' ? (material as LectureProgress).speedMultiplier : undefined,
    targetDate: material.targetDate,
    status: computeStatus(material.detailedPlans, current, today, material.subjects_studyDays_placeholder ?? undefined, student.createdAt),
    studyDays: undefined,
    createdAt: student.createdAt,
    dailyProgress,
  };
}

// 각 학생의 subjects(폴백: 최상위 books/lectures)에서 key가 일치하는 항목만 추출
export function collectEntries(
  students: Student[], type: MaterialType, subject: string, name: string, today = new Date(),
): BenchmarkEntry[] {
  const t = new Date(today); t.setHours(0, 0, 0, 0);
  const target = materialKey(type, subject, name);
  const out: BenchmarkEntry[] = [];

  for (const student of students) {
    const subjects = (student.subjects && student.subjects.length > 0)
      ? student.subjects
      : [{ id: '_', name: '기본', books: student.books || [], lectures: student.lectures || [], updatedAt: '' } as any];

    for (const sub of subjects) {
      const materials = type === 'book' ? (sub.books || []) : (sub.lectures || []);
      for (const material of materials) {
        const mName = type === 'book' ? (material as BookProgress).title : (material as LectureProgress).name;
        if (materialKey(type, sub.name, mName) !== target) continue;
        const entry = toEntry(student, type, sub.name, material, t);
        entry.studyDays = sub.studyDays;
        entry.status = computeStatus(material.detailedPlans, entry.current, t, sub.studyDays, student.createdAt);
        out.push(entry);
      }
    }
  }
  return out;
}

// 성실 진행자: (1) 실제 시작(진도>0 또는 완료기록 존재) AND (2) 완료했거나 최근 abandonDays 이내 활동
export function filterSeriousCohort(
  entries: BenchmarkEntry[], today = new Date(), abandonDays = DEFAULT_ABANDON_DAYS,
): BenchmarkEntry[] {
  const t = new Date(today); t.setHours(0, 0, 0, 0);
  return entries.filter((e) => {
    const started = e.current > 0 || e.dailyProgress.length > 0;
    if (!started) return false;
    if (e.completed) return true;
    if (!e.lastActivity) return false;
    const last = new Date(e.lastActivity); last.setHours(0, 0, 0, 0);
    const days = Math.floor((t.getTime() - last.getTime()) / DAY_MS);
    return days <= abandonDays;
  });
}
```

Note: `toEntry` 초안의 `material.subjects_studyDays_placeholder` 참조는 컴파일되지 않는다 — 아래 Step 3b에서 제거한다(studyDays는 `collectEntries`가 sub 컨텍스트에서 주입).

- [ ] **Step 3b: Fix studyDays wiring (remove placeholder)**

`toEntry` 안의 `status:` 라인을 아래로 교체(placeholder 제거, 임시 no-plan 계산 후 collectEntries가 재계산):

```ts
    status: computeStatus(material.detailedPlans, current, today, undefined, student.createdAt),
```

`collectEntries`는 이미 `entry.status`를 sub.studyDays로 재계산하므로 정합.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/test-learning-benchmark.mts`
Expected: `Task 1 OK`

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: 통과(에러 0). 실패 시 placeholder 참조/타입 잔여를 수정.

- [ ] **Step 6: Commit**

```bash
git add lib/learning-benchmark.ts scripts/test-learning-benchmark.mts
git commit -m "feat: 학습 벤치마크 엔진 — 동일성 키·표본 수집·성실 진행자 필터

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: 엔진 — 집계 지표(배속·소요기간·목표대비·상태분포·월분포)

**Files:**
- Modify: `lib/learning-benchmark.ts`
- Modify: `scripts/test-learning-benchmark.mts`

**Interfaces:**
- Consumes: Task 1의 `BenchmarkEntry`, `filterSeriousCohort`.
- Produces:
  - `interface BenchmarkAggregate { key; type: MaterialType; displayName; subject; learnerCount; completerCount; speedMode: number|null; speedAvg: number|null; avgDurationWeeks: number|null; targetDeltaDaysAvg: number|null; statusDistribution: { ahead: number; onTrack: number; behind: number }; monthDistribution: Array<{ month: number; count: number; ratio: number }>; topMonthsLabel: string }`
  - `buildAggregate(cohort: BenchmarkEntry[], type: MaterialType, displayName: string, subject: string): BenchmarkAggregate`

- [ ] **Step 1: Write the failing test (append)**

`scripts/test-learning-benchmark.mts` 하단(`console.log('Task 1 OK')` 다음)에 추가:

```ts
import { buildAggregate } from '../lib/learning-benchmark';

const cohort2 = filterSeriousCohort(collectEntries([
  lectureStudent('1', { done: 30, speed: 1.5, completions: [['2026-07-05', 30]], updatedAt: '2026-07-05' }),
  lectureStudent('2', { done: 30, speed: 1.5, completions: [['2026-08-10', 30]], updatedAt: '2026-08-10' }),
  lectureStudent('3', { done: 30, speed: 2.0, completions: [['2026-08-12', 30]], updatedAt: '2026-08-12' }),
  lectureStudent('4', { done: 12, speed: 1.5, completions: [['2026-09-18', 12]], updatedAt: '2026-09-18' }),
], 'lecture', '행정법', '행정법 기본강의', TODAY), TODAY, 21);

const agg = buildAggregate(cohort2, 'lecture', '행정법 기본강의', '행정법');
assert.equal(agg.learnerCount, 4);
assert.equal(agg.completerCount, 3);
assert.equal(agg.speedMode, 1.5);          // 최빈 배속
assert.ok(Math.abs(agg.speedAvg! - 1.625) < 1e-6);
assert.ok(agg.avgDurationWeeks !== null);  // 완료자 3명 → 값 존재
assert.ok(agg.monthDistribution.length >= 1);
assert.ok(agg.topMonthsLabel.includes('월'));
const sum = agg.statusDistribution.ahead + agg.statusDistribution.onTrack + agg.statusDistribution.behind;
assert.ok(Math.abs(sum - 1) < 1e-6 || sum === 0);

console.log('Task 2 OK');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/test-learning-benchmark.mts`
Expected: FAIL — `buildAggregate` export 없음.

- [ ] **Step 3: Write minimal implementation (append to `lib/learning-benchmark.ts`)**

```ts
export interface BenchmarkAggregate {
  key: string;
  type: MaterialType;
  displayName: string;
  subject: string;
  learnerCount: number;
  completerCount: number;
  speedMode: number | null;       // 강의만
  speedAvg: number | null;
  avgDurationWeeks: number | null;  // 완료자
  targetDeltaDaysAvg: number | null;// 완료자, 음수=목표보다 빨리
  statusDistribution: { ahead: number; onTrack: number; behind: number };
  monthDistribution: Array<{ month: number; count: number; ratio: number }>;
  topMonthsLabel: string;
}

function mode(values: number[]): number | null {
  if (values.length === 0) return null;
  const count = new Map<number, number>();
  for (const v of values) count.set(v, (count.get(v) || 0) + 1);
  let best = values[0]; let bestN = 0;
  for (const [v, n] of count) if (n > bestN || (n === bestN && v < best)) { best = v; bestN = n; }
  return best;
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / DAY_MS);
}

function monthsLabel(dist: Array<{ month: number; count: number; ratio: number }>): string {
  if (dist.length === 0) return '';
  const sorted = [...dist].sort((a, b) => b.count - a.count);
  const picked: number[] = [];
  let cum = 0;
  for (const d of sorted) { picked.push(d.month); cum += d.ratio; if (cum >= 0.6) break; }
  picked.sort((a, b) => a - b);
  const consecutive = picked.length > 1 && picked[picked.length - 1] - picked[0] === picked.length - 1;
  return consecutive ? `${picked[0]}~${picked[picked.length - 1]}월` : picked.map((m) => `${m}월`).join('·');
}

export function buildAggregate(
  cohort: BenchmarkEntry[], type: MaterialType, displayName: string, subject: string,
): BenchmarkAggregate {
  const completers = cohort.filter((e) => e.completed && e.startDate && e.finishDate);
  const speeds = cohort.map((e) => e.speedMultiplier).filter((v): v is number => typeof v === 'number' && v > 0);

  const durationsWeeks = completers.map((e) => daysBetween(e.startDate!, e.finishDate!) / 7);
  const targetDeltas = completers
    .filter((e) => e.targetDate)
    .map((e) => daysBetween(e.targetDate!, e.finishDate!)); // 완료일 - 목표일, 음수=빨리

  const statusable = cohort.filter((e) => e.status !== 'no-plan');
  const statusDistribution = statusable.length === 0
    ? { ahead: 0, onTrack: 0, behind: 0 }
    : {
        ahead: statusable.filter((e) => e.status === 'ahead').length / statusable.length,
        onTrack: statusable.filter((e) => e.status === 'on-track').length / statusable.length,
        behind: statusable.filter((e) => e.status === 'behind').length / statusable.length,
      };

  const monthCount = new Map<number, number>();
  for (const e of cohort) {
    if (!e.startDate) continue;
    const m = new Date(e.startDate).getMonth() + 1;
    monthCount.set(m, (monthCount.get(m) || 0) + 1);
  }
  const totalMonths = [...monthCount.values()].reduce((a, b) => a + b, 0);
  const monthDistribution = [...monthCount.entries()]
    .map(([month, count]) => ({ month, count, ratio: totalMonths ? count / totalMonths : 0 }))
    .sort((a, b) => a.month - b.month);

  return {
    key: materialKey(type, subject, displayName),
    type, displayName, subject,
    learnerCount: cohort.length,
    completerCount: completers.length,
    speedMode: type === 'lecture' ? mode(speeds) : null,
    speedAvg: type === 'lecture' ? avg(speeds) : null,
    avgDurationWeeks: durationsWeeks.length ? Math.round((avg(durationsWeeks) ?? 0) * 10) / 10 : null,
    targetDeltaDaysAvg: targetDeltas.length ? Math.round(avg(targetDeltas) ?? 0) : null,
    statusDistribution,
    monthDistribution,
    topMonthsLabel: monthsLabel(monthDistribution),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/test-learning-benchmark.mts`
Expected: `Task 2 OK`

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck` → 통과.

- [ ] **Step 6: Commit**

```bash
git add lib/learning-benchmark.ts scripts/test-learning-benchmark.mts
git commit -m "feat: 학습 벤치마크 집계 지표(배속 최빈·소요기간·목표대비·상태/월 분포)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: 엔진 — 시즌 정규화 개인 비교

**Files:**
- Modify: `lib/learning-benchmark.ts`
- Modify: `scripts/test-learning-benchmark.mts`

**Interfaces:**
- Consumes: `BenchmarkEntry`(Task 1), `BenchmarkAggregate`(Task 2).
- Produces:
  - `interface PersonalComparison { startMonthLabel: string; weeksSinceStart: number; myPercent: number; cohortPercentAtSameWeek: number|null; percentileTopLabel: string|null; etaWeeks: number|null; summary: string; sparse: boolean }`
  - `percentAtWeek(entry: BenchmarkEntry, weeksSinceStart: number): number`
  - `buildPersonalComparison(cohort: BenchmarkEntry[], me: BenchmarkEntry, agg: BenchmarkAggregate, today?: Date): PersonalComparison | null`

- [ ] **Step 1: Write the failing test (append)**

```ts
import { buildPersonalComparison, percentAtWeek } from '../lib/learning-benchmark';

// me: 9월 8일 시작, 오늘(9/22) 2주차, 진도 45%
const meStudent = lectureStudent('me', {
  total: 20, done: 9, speed: 1.5,
  completions: [['2026-09-08', 5], ['2026-09-15', 4]],
  planStart: '2026-09-08', planEnd: '2026-10-20', updatedAt: '2026-09-22',
});
const cohortStudents = [
  lectureStudent('a', { total: 20, done: 20, speed: 1.5, planStart: '2026-07-07', planEnd: '2026-08-31',
    completions: [['2026-07-14', 10], ['2026-07-21', 10]], updatedAt: '2026-07-21' }),
  lectureStudent('b', { total: 20, done: 20, speed: 1.5, planStart: '2026-07-07', planEnd: '2026-08-31',
    completions: [['2026-07-14', 6], ['2026-07-28', 14]], updatedAt: '2026-07-28' }),
  lectureStudent('c', { total: 20, done: 20, speed: 2.0, planStart: '2026-08-04', planEnd: '2026-09-15',
    completions: [['2026-08-11', 8], ['2026-08-25', 12]], updatedAt: '2026-08-25' }),
  lectureStudent('d', { total: 20, done: 20, speed: 1.5, planStart: '2026-08-04', planEnd: '2026-09-15',
    completions: [['2026-08-11', 5], ['2026-09-01', 15]], updatedAt: '2026-09-01' }),
];
const all = [meStudent, ...cohortStudents];
const cohort3 = filterSeriousCohort(collectEntries(all, 'lecture', '행정법', '행정법 기본강의', TODAY), TODAY, 21);
const me = cohort3.find((e) => e.studentId === 'me')!;
const agg3 = buildAggregate(cohort3, 'lecture', '행정법 기본강의', '행정법');

// percentAtWeek: a는 2주차(첫 2주)에 20개 중 10개 → 50%
const aEntry = cohort3.find((e) => e.studentId === 'a')!;
assert.equal(percentAtWeek(aEntry, 2), 50);

const cmp = buildPersonalComparison(cohort3, me, agg3, TODAY)!;
assert.ok(cmp !== null);
assert.equal(cmp.weeksSinceStart, 2);
assert.equal(cmp.myPercent, 45);
assert.equal(cmp.startMonthLabel, '9월');
assert.ok(cmp.cohortPercentAtSameWeek !== null);
assert.ok(cmp.summary.length > 0);
assert.ok(!cmp.summary.includes('너')); // 존댓말/반말 금지 스모크

console.log('Task 3 OK');
console.log('ALL OK');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/test-learning-benchmark.mts`
Expected: FAIL — `buildPersonalComparison` export 없음.

- [ ] **Step 3: Write minimal implementation (append to `lib/learning-benchmark.ts`)**

```ts
export interface PersonalComparison {
  startMonthLabel: string;           // "9월"
  weeksSinceStart: number;           // 1-base
  myPercent: number;
  cohortPercentAtSameWeek: number | null;
  percentileTopLabel: string | null; // "상위 40%"
  etaWeeks: number | null;
  summary: string;
  sparse: boolean;                   // 같은 주차 표본 부족 여부
}

// entry가 "시작 후 w주"까지 도달했던 진도% (dailyProgress 누적 기준, 없으면 최종 진도로 선형 근사)
export function percentAtWeek(entry: BenchmarkEntry, w: number): number {
  if (entry.total <= 0 || !entry.startDate) return 0;
  const cutoff = new Date(entry.startDate);
  cutoff.setDate(cutoff.getDate() + w * 7);
  const cutoffStr = toDateStr(cutoff);

  if (entry.dailyProgress.length > 0) {
    let cum = 0;
    for (const p of entry.dailyProgress) { if (p.date <= cutoffStr) cum = p.cumAmount; else break; }
    return Math.min(100, Math.round((cum / entry.total) * 100));
  }
  // 폴백: 마지막 활동까지 걸린 주수로 선형 근사
  const spanWeeks = entry.lastActivity
    ? Math.max(1, daysBetween(entry.startDate, entry.lastActivity) / 7)
    : 1;
  const frac = Math.min(1, w / spanWeeks);
  return Math.min(100, Math.round(entry.percent * frac));
}

export function buildPersonalComparison(
  cohort: BenchmarkEntry[], me: BenchmarkEntry, agg: BenchmarkAggregate, today = new Date(),
): PersonalComparison | null {
  if (!me.startDate) return null;
  const t = new Date(today); t.setHours(0, 0, 0, 0);
  const start = new Date(me.startDate); start.setHours(0, 0, 0, 0);
  const weeksSinceStart = Math.max(1, Math.floor((t.getTime() - start.getTime()) / (DAY_MS * 7)) + 1);
  const startMonthLabel = `${start.getMonth() + 1}월`;

  // 같은 "시작 후 주차"에 그 주차만큼 데이터가 있는 동료들
  const others = cohort.filter((e) => e.studentId !== me.studentId && e.startDate);
  const reached = others.filter((e) => {
    const span = e.lastActivity ? daysBetween(e.startDate!, e.lastActivity) / 7 : 0;
    return e.completed || span >= weeksSinceStart;
  });
  const sparse = reached.length < 4;
  const peers = reached.length > 0 ? reached : others;

  const peerPercents = peers.map((e) => percentAtWeek(e, weeksSinceStart));
  const cohortPercentAtSameWeek = peerPercents.length
    ? Math.round(peerPercents.reduce((a, b) => a + b, 0) / peerPercents.length)
    : null;

  let percentileTopLabel: string | null = null;
  if (peerPercents.length >= 1) {
    const atOrBelow = peerPercents.filter((p) => p <= me.percent).length;
    const topFrac = 1 - atOrBelow / peerPercents.length; // 나보다 높은 비율
    percentileTopLabel = `상위 ${Math.max(1, Math.round(topFrac * 100))}%`;
  }

  const etaWeeks = agg.avgDurationWeeks !== null
    ? Math.max(0, Math.round((agg.avgDurationWeeks - weeksSinceStart) * 10) / 10)
    : null;

  // 존댓말 요약 — 시즌·상대속도 상황별 분기
  const seasonLate = agg.topMonthsLabel && !agg.topMonthsLabel.includes(startMonthLabel);
  const ahead = cohortPercentAtSameWeek !== null && me.percent >= cohortPercentAtSameWeek;
  let summary: string;
  if (seasonLate && ahead) {
    summary = `${startMonthLabel}에 시작해 달력상 다소 늦지만, 시작 후 같은 시점(${weeksSinceStart}주차) 기준으로는 평균보다 앞서 있습니다.`;
  } else if (ahead) {
    summary = `시작 후 ${weeksSinceStart}주차 기준으로 평균보다 앞서 있습니다.`;
  } else if (cohortPercentAtSameWeek !== null) {
    summary = `시작 후 ${weeksSinceStart}주차 기준 평균은 ${cohortPercentAtSameWeek}%입니다. 조금만 더 속도를 내면 따라잡을 수 있습니다.`;
  } else {
    summary = `아직 같은 시점의 비교 표본이 충분하지 않습니다.`;
  }
  if (sparse && cohortPercentAtSameWeek !== null) summary += ' (같은 주차 표본이 적어 참고용입니다.)';

  return {
    startMonthLabel, weeksSinceStart, myPercent: me.percent,
    cohortPercentAtSameWeek, percentileTopLabel, etaWeeks, summary, sparse,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/test-learning-benchmark.mts`
Expected: `Task 3 OK` 그리고 `ALL OK`.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck` → 통과.

- [ ] **Step 6: Commit**

```bash
git add lib/learning-benchmark.ts scripts/test-learning-benchmark.mts
git commit -m "feat: 학습 벤치마크 시즌 정규화 개인 비교(시작 후 경과주차 백분위)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: API 라우트 — 인증·전체학원 로드·TTL 캐시

**Files:**
- Create: `app/api/learning-benchmark/route.ts`

**Interfaces:**
- Consumes: `collectEntries`, `filterSeriousCohort`, `buildAggregate`, `buildPersonalComparison`, `DEFAULT_ABANDON_DAYS`, `MaterialType` (`@/lib/learning-benchmark`); `getStudents` (`@/lib/store`); `activeBackend` (`@/lib/store`); `canViewStudent`, `isAdmin`, `getStudentSessionId` (`@/lib/auth`); `getSetting` (`@/lib/store` 또는 app_settings 헬퍼 — 아래 참조).
- Produces: `GET /api/learning-benchmark?type=&subject=&name=&studentId=&materialId=` →
  ```json
  { "success": true, "configured": true, "eligible": true,
    "aggregate": { ... BenchmarkAggregate ... },
    "personal": { ... PersonalComparison | null } }
  ```
  표본 부족 시 `{ "success": true, "configured": true, "eligible": false, "learnerCount": n }`.

- [ ] **Step 1: Confirm app_settings getter name**

Run: `grep -rn "app_settings\|getSetting\|getAppSetting" lib/store.ts lib/supabase.ts | head`
Expected: app_settings 조회 헬퍼 이름 확인(예: `getSetting`/`getAppSetting`). 존재하면 그 이름 사용, 없으면 이 태스크에서 `benchmark_abandon_days` 오버라이드는 생략하고 `DEFAULT_ABANDON_DAYS` 상수만 사용(주석으로 후속 표기).

- [ ] **Step 2: Write the route**

Create `app/api/learning-benchmark/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { canViewStudent, isAdmin, getStudentSessionId } from '@/lib/auth';
import { activeBackend, getStudents } from '@/lib/store';
import {
  collectEntries, filterSeriousCohort, buildAggregate, buildPersonalComparison,
  DEFAULT_ABANDON_DAYS, MaterialType,
} from '@/lib/learning-benchmark';

const MIN_LEARNERS = 4;
const CACHE_TTL_MS = 10 * 60 * 1000;

type CacheVal = { at: number; aggregate: ReturnType<typeof buildAggregate>; cohortKey: string };
const cache = new Map<string, CacheVal>();

export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = url.searchParams.get('type') as MaterialType | null;
  const subject = url.searchParams.get('subject') || '';
  const name = url.searchParams.get('name') || '';
  const studentId = url.searchParams.get('studentId') || '';

  if (type !== 'book' && type !== 'lecture') {
    return NextResponse.json({ success: false, message: 'type은 book|lecture' }, { status: 400 });
  }
  if (!subject || !name) {
    return NextResponse.json({ success: false, message: 'subject·name 필요' }, { status: 400 });
  }

  // 인증: 관리자이거나, studentId가 본인일 때만
  let meId = '';
  if (studentId) {
    if (!(await canViewStudent(studentId))) {
      return NextResponse.json({ success: false, message: '열람 권한이 없습니다.' }, { status: 401 });
    }
    meId = studentId;
  } else {
    const sid = await getStudentSessionId();
    if (!sid && !(await isAdmin())) {
      return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
    }
    meId = sid || '';
  }

  if (activeBackend() !== 'supabase') {
    return NextResponse.json({ success: true, configured: false });
  }

  try {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const students = await getStudents(); // 전체 학원 통합(campus 필터 없음)
    const cohort = filterSeriousCohort(
      collectEntries(students, type, subject, name, today), today, DEFAULT_ABANDON_DAYS,
    );

    if (cohort.length < MIN_LEARNERS) {
      return NextResponse.json({ success: true, configured: true, eligible: false, learnerCount: cohort.length });
    }

    const aggregate = buildAggregate(cohort, type, name, subject);
    // 완료자 4명 미만이면 완료자 전용 지표 숨김
    if (aggregate.completerCount < MIN_LEARNERS) {
      aggregate.avgDurationWeeks = null;
      aggregate.targetDeltaDaysAvg = null;
    }

    let personal = null;
    if (meId) {
      const me = cohort.find((e) => e.studentId === meId)
        ?? collectEntries(students, type, subject, name, today).find((e) => e.studentId === meId);
      if (me) personal = buildPersonalComparison(cohort, me, aggregate, today);
    }

    return NextResponse.json({ success: true, configured: true, eligible: true, aggregate, personal });
  } catch (e: any) {
    console.error('learning-benchmark error:', e);
    return NextResponse.json({ success: false, message: e?.message || '벤치마크 조회 실패' }, { status: 500 });
  }
}
```

Note: 캐시(`cache`, `CACHE_TTL_MS`)는 이후 최적화 훅이다. 초기 구현은 매 요청 집계로 두되, 부하 확인 후 aggregate를 `${materialKey}` 키로 `cache`에 저장/재사용하도록 확장한다(personal은 학생별이라 캐시 제외). 지금은 미사용 변수 lint를 피하려면 캐시 블록을 실제 사용하거나 이 단계에서 제거한다 — **초기엔 제거**하고 주석 `// TODO: materialKey별 TTL 캐시` 로 남긴다.

- [ ] **Step 3: Remove unused cache scaffold (lint 통과)**

`cache`, `CacheVal`, `CACHE_TTL_MS` 선언을 삭제하고 상단에 주석만 남긴다:

```ts
// 부하가 문제되면 materialKey별 TTL(약 10분) 인메모리 캐시를 aggregate에 도입한다(personal 제외).
```

- [ ] **Step 4: Typecheck + lint**

Run: `npm run test`  (= lint + typecheck)
Expected: 통과. `canViewStudent`/`getStudentSessionId`/`getStudents` import 경로가 실제와 다르면 Step 1 grep 결과대로 교정.

- [ ] **Step 5: Commit**

```bash
git add app/api/learning-benchmark/route.ts
git commit -m "feat: 학습 벤치마크 API(인증·전체학원 집계·n>=4 게이트)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: 공유 UI 컴포넌트 — BenchmarkSection

**Files:**
- Create: `components/learning/benchmark-section.tsx`

**Interfaces:**
- Consumes: `/api/learning-benchmark` 응답(Task 4).
- Produces: `export function BenchmarkSection(props: { type: 'book'|'lecture'; subject: string; name: string; studentId?: string; audience: 'admin'|'student' }): JSX.Element`
  - `studentId` 지정 시 개인 비교(personal)까지 요청. `audience`는 문구 톤 미세조정용.

- [ ] **Step 1: Write the component**

Create `components/learning/benchmark-section.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';

interface Aggregate {
  learnerCount: number; completerCount: number;
  speedMode: number | null; speedAvg: number | null;
  avgDurationWeeks: number | null; targetDeltaDaysAvg: number | null;
  statusDistribution: { ahead: number; onTrack: number; behind: number };
  topMonthsLabel: string; type: 'book' | 'lecture';
}
interface Personal {
  startMonthLabel: string; weeksSinceStart: number; myPercent: number;
  cohortPercentAtSameWeek: number | null; percentileTopLabel: string | null;
  etaWeeks: number | null; summary: string; sparse: boolean;
}
interface Resp {
  success: boolean; configured?: boolean; eligible?: boolean; learnerCount?: number;
  aggregate?: Aggregate; personal?: Personal | null;
}

export function BenchmarkSection(props: {
  type: 'book' | 'lecture'; subject: string; name: string;
  studentId?: string; audience: 'admin' | 'student';
}) {
  const { type, subject, name, studentId } = props;
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams({ type, subject, name });
    if (studentId) params.set('studentId', studentId);
    setLoading(true);
    fetch(`/api/learning-benchmark?${params.toString()}`)
      .then((r) => r.json())
      .then((j: Resp) => { if (alive) setData(j); })
      .catch(() => { if (alive) setData({ success: false }); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [type, subject, name, studentId]);

  if (loading) return null;
  if (!data?.success || data.configured === false) return null;
  if (data.eligible === false) {
    return (
      <p className="mt-2 text-xs text-muted-foreground">
        아직 이 {type === 'book' ? '교재' : '강의'}를 공부한 학생 데이터가 충분하지 않습니다(4명 이상부터 표시).
      </p>
    );
  }

  const a = data.aggregate!;
  const p = data.personal ?? null;
  const unitLabel = type === 'book' ? '교재' : '강의';

  return (
    <div className="glass mt-3 rounded-2xl p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-sm font-semibold"
      >
        <span>이 {unitLabel}, 다른 학생들은? · {a.learnerCount}명</span>
        <span className="text-xs text-muted-foreground">{open ? '접기' : '펼치기'}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <ul className="grid grid-cols-2 gap-2 text-xs">
            {a.avgDurationWeeks !== null && (
              <li className="glass rounded-xl p-2">평균 소요 <b>{a.avgDurationWeeks}주</b></li>
            )}
            {a.type === 'lecture' && a.speedMode !== null && (
              <li className="glass rounded-xl p-2">많이 쓴 배속 <b>{a.speedMode}배</b>{a.speedAvg ? ` (평균 ${a.speedAvg.toFixed(1)}배)` : ''}</li>
            )}
            {a.topMonthsLabel && (
              <li className="glass rounded-xl p-2">주로 <b>{a.topMonthsLabel}</b>에 학습</li>
            )}
            {a.targetDeltaDaysAvg !== null && (
              <li className="glass rounded-xl p-2">
                목표일 대비 <b>{a.targetDeltaDaysAvg <= 0 ? `${Math.abs(a.targetDeltaDaysAvg)}일 빨리` : `${a.targetDeltaDaysAvg}일 늦게`}</b> 완료
              </li>
            )}
          </ul>

          {p && (
            <div>
              <table className="w-full text-xs">
                <tbody>
                  <tr className="border-b border-white/10"><td className="py-1 text-muted-foreground">시작 시기</td><td className="py-1 text-right">{p.startMonthLabel}</td><td className="py-1 text-right text-muted-foreground">주로 {a.topMonthsLabel}</td></tr>
                  <tr className="border-b border-white/10"><td className="py-1 text-muted-foreground">시작 후 경과</td><td className="py-1 text-right">{p.weeksSinceStart}주차</td><td className="py-1 text-right">—</td></tr>
                  <tr className="border-b border-white/10"><td className="py-1 text-muted-foreground">현재 진도</td><td className="py-1 text-right font-semibold">{p.myPercent}%</td><td className="py-1 text-right text-muted-foreground">{p.cohortPercentAtSameWeek !== null ? `같은 주차 평균 ${p.cohortPercentAtSameWeek}%` : '—'}</td></tr>
                  {p.percentileTopLabel && (
                    <tr className="border-b border-white/10"><td className="py-1 text-muted-foreground">상대 위치</td><td className="py-1 text-right font-semibold" colSpan={2}>{p.percentileTopLabel}</td></tr>
                  )}
                  {p.etaWeeks !== null && (
                    <tr><td className="py-1 text-muted-foreground">완료까지 예상</td><td className="py-1 text-right">약 {p.etaWeeks}주 뒤</td><td className="py-1 text-right text-muted-foreground">평균 {a.avgDurationWeeks ?? '—'}주</td></tr>
                  )}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-muted-foreground">{p.summary}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

Note: 색·표면은 기존 `.glass` 유틸과 `text-muted-foreground` 토큰만 사용(보라/인디고 금지). 실제 토큰명이 다르면 인접 컴포넌트(`components/report/subject-progress-tab.tsx`)에서 쓰는 클래스에 맞춘다.

- [ ] **Step 2: Typecheck + lint**

Run: `npm run test`
Expected: 통과.

- [ ] **Step 3: Commit**

```bash
git add components/learning/benchmark-section.tsx
git commit -m "feat: 학습 벤치마크 공유 UI(집계 카드+개인비교 표, n<4 폴백)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: 관리자 진도 카드에 삽입

**Files:**
- Modify: `components/admin/detail-tabs/progress-tab.tsx`

**Interfaces:**
- Consumes: `BenchmarkSection`(Task 5). 진도 카드가 렌더하는 학생(`student.id`)·과목명·교재/강의명.

- [ ] **Step 1: Locate insertion points**

Run: `grep -n "교재 진도\|인강 진도\|book.title\|lecture.name\|현재 진도\|slider\|Slider" components/admin/detail-tabs/progress-tab.tsx | head -40`
Expected: 교재 진도 섹션(라인 ~871-924)과 인강 진도 섹션 위치 확인. 각 교재/강의 카드의 진도 편집 UI **바로 아래**가 삽입 지점.

- [ ] **Step 2: Import**

`progress-tab.tsx` 상단 import 블록에 추가:

```tsx
import { BenchmarkSection } from '@/components/learning/benchmark-section';
```

- [ ] **Step 3: Insert per book card**

교재 카드 진도 편집부 마지막 닫는 태그 직전(또는 직후)에, 해당 스코프의 `student`, `subject`, `book` 변수명을 확인해 삽입:

```tsx
<BenchmarkSection
  type="book"
  subject={subject.name}
  name={book.title}
  studentId={student.id}
  audience="admin"
/>
```

(변수명이 `s`/`subj`/`b` 등이면 실제 map 콜백 인자명에 맞춘다.)

- [ ] **Step 4: Insert per lecture card**

인강 카드 진도 편집부에 동일 패턴:

```tsx
<BenchmarkSection
  type="lecture"
  subject={subject.name}
  name={lecture.name}
  studentId={student.id}
  audience="admin"
/>
```

- [ ] **Step 5: Typecheck + lint**

Run: `npm run test`
Expected: 통과. 스코프에 `student`가 없으면 상위 props에서 학생 객체/ID를 찾아 전달.

- [ ] **Step 6: Preview verification**

- `preview_start`(단일 관리 서버)로 dev 서버 기동, 관리자 로그인 → 학생 상세 → 진도 탭 진입.
- 교재/강의 카드 아래 "이 교재/강의, 다른 학생들은?" 토글이 보이는지 `preview_snapshot`으로 확인.
- 표본 부족 자료는 안내 문구, 4명 이상 자료는 집계/표가 뜨는지 확인. `preview_console_logs`로 에러 없음 확인.
- 검증 후 서버 종료(`preview_stop`).

- [ ] **Step 7: Commit**

```bash
git add components/admin/detail-tabs/progress-tab.tsx
git commit -m "feat: 관리자 진도 카드에 학습 벤치마크 섹션 삽입

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: 학생 리포트에 삽입

**Files:**
- Modify: `components/report/subject-progress-tab.tsx`

**Interfaces:**
- Consumes: `BenchmarkSection`(Task 5). 리포트 주인공 학생 ID(리포트 데이터에 이미 존재), 과목명, 교재/강의명.

- [ ] **Step 1: Locate insertion points & student id source**

Run: `grep -n "book.title\|lecture.name\|studentId\|student.id\|getPlanStatus\|교재\|인강" components/report/subject-progress-tab.tsx | head -40`
Expected: 교재/강의별 렌더 위치와 리포트 학생 ID를 담은 prop/변수(예: `student.id` 또는 `data.student.id`) 확인.

- [ ] **Step 2: Import**

```tsx
import { BenchmarkSection } from '@/components/learning/benchmark-section';
```

- [ ] **Step 3: Insert per book & lecture**

각 교재/강의 진도 표시 블록 하단에 삽입(학생 ID 변수명은 Step 1 결과 사용):

```tsx
<BenchmarkSection type="book" subject={subject.name} name={book.title} studentId={studentId} audience="student" />
```
```tsx
<BenchmarkSection type="lecture" subject={subject.name} name={lecture.name} studentId={studentId} audience="student" />
```

- [ ] **Step 4: Typecheck + lint**

Run: `npm run test`
Expected: 통과.

- [ ] **Step 5: Preview verification**

- dev 서버(`preview_start`)에서 학생 리포트(또는 공유 리포트) 과목진도 탭 진입.
- 교재/강의별로 개인 비교 **표**가 존댓말 문구와 함께 뜨는지 `preview_snapshot` 확인. 반말("너") 없는지 확인.
- 표본 부족 자료는 안내 문구만. `preview_console_logs` 에러 없음 확인 후 서버 종료.

- [ ] **Step 6: Commit**

```bash
git add components/report/subject-progress-tab.tsx
git commit -m "feat: 학생 리포트 과목진도에 학습 벤치마크 개인비교 삽입

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: 최종 점검 — IDOR·스코프·리뷰

**Files:** (검증만, 코드 수정은 발견 시)

- [ ] **Step 1: IDOR 스모크**

관리자/학생 세션으로 `/api/learning-benchmark?type=lecture&subject=..&name=..&studentId=<타학생>` 호출 시 학생 세션은 401(본인 아님)인지 확인. `canViewStudent` 경유이므로 통과 예상 — 실패 시 라우트 인증 분기 수정.

- [ ] **Step 2: 전체 검증 스크립트 재실행**

Run: `npx tsx scripts/test-learning-benchmark.mts` → `ALL OK`
Run: `npm run test` → lint+typecheck 통과.

- [ ] **Step 3: 레포 특화 리뷰**

`/review-diff`(repo-code-reviewer)로 현재 브랜치 diff 리뷰: 진도 단일소스 훼손 없음, IDOR/세션, Glass 규칙, 이름 정규화 그룹핑 한계 주석 확인.

- [ ] **Step 4: 최종 커밋(리뷰 반영 있으면)**

```bash
git add -A
git commit -m "chore: 학습 벤치마크 리뷰 반영·최종 점검

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review (작성자 점검 결과)

- **스펙 커버리지**: 배속 최빈(Task2), 걸린 기간=달력 주수(Task2), 목표 대비(Task2), 계획준수 분포(Task2), 월 분포+시즌 정규화 상대속도 표(Task3/5), n>=4 게이트(Task4/5), 성실 진행자 필터(Task1), 완료자<4 부분숨김(Task4), 관리자 진도카드+학생 리포트 배치(Task6/7), 전체학원 통합(Task4), 존댓말·표(Task3/5), 프라이버시(Task4/5) — 모두 태스크 존재.
- **플레이스홀더**: 엔진/ API/컴포넌트 코드 실체 포함. UI 삽입 태스크는 기존 파일 변수명 확인 grep을 각 스텝에 명시(레포 특화 불가피 지점).
- **타입 일관성**: `BenchmarkEntry`/`BenchmarkAggregate`/`PersonalComparison` 필드명이 엔진→API→컴포넌트에서 동일하게 사용됨(`avgDurationWeeks`, `speedMode`, `topMonthsLabel`, `percentileTopLabel`, `weeksSinceStart` 등). Task1 초안의 `subjects_studyDays_placeholder`는 Step 3b에서 제거하도록 명시.
- **알려진 리스크**: 이름 기반 그룹핑(오타 분산), 시즌 표본 희소(`sparse` 플래그로 완화), 완료일/시작일 추정 폴백(`updatedAt`). 스펙 §12와 일치.
