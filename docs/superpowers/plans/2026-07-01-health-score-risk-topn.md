# 학생 건강지수(Health Score) + 위험 TOP N Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 여러 출결·학습 신호를 규칙·집계로 하나의 위험지수(0~100)로 합쳐, 관리자가 위험 학생을 자동으로 TOP N으로 보게 한다 (스마트화 로드맵 Wave 1 #1, 후속 #2·#3·#8의 주춧돌).

**Architecture:** 순수 계산 모듈(`lib/health-score.ts`, 외부 의존 0)이 신호→점수를 계산하고, 어셈블러(`lib/health-signals.ts`)가 `Student` + 결석집계에서 신호를 뽑아 그 모듈에 넣는다. API 라우트가 기존 absence-ranking 라우트 패턴을 재사용해 학생별 점수를 만들어 정렬 반환하고, 관리자 페이지가 위험밴드·기여요인과 함께 렌더한다. 가중치는 `app_settings`에서 읽고 없으면 기본값.

**Tech Stack:** Next.js(App Router) · TypeScript · Supabase(app_settings/seat_statuses/study_sessions) · 검증은 `npm run test`(lint+typecheck) + `npx tsx` 실행 검증 + live-verifier(화면).

## Global Constraints

- **테스트 러너 없음.** 순수 로직은 `npx tsx scripts/checks/*.check.ts` 실행 assert로, 전체는 `npm run test`(= `eslint . --quiet && tsc --noEmit`)로 검증. 새 테스트 의존성 추가 금지.
- **점수 규약:** score는 0~100 정수, 높을수록 위험. band 임계 `watch=30`, `risk=60`.
- **날짜:** 날짜키는 항상 `getSeoulDateKey()`(Asia/Seoul, `YYYY-MM-DD`) 사용.
- **정당사유 제외:** 결석/이탈은 기존 `buildAbsenceRanking`(승인휴가 교시 제외)을 그대로 재사용 — 별도 재계산 금지.
- **캠퍼스 화이트리스트:** `VALID_CAMPUSES = ['wonju','chuncheon','chungju']`. 라벨은 `getCampusLabel`(`lib/meal.ts`).
- **인증:** 모든 admin 라우트는 `getAdminSession()`로 가드하고, `session.campus !== 'all'`이면 해당 캠퍼스로 필터.
- **디자인:** 화면은 iOS26 Liquid Glass 규칙 — `.glass` 유틸 재사용, 색=의미/역할, **보라·인디고 금지**, 한글 `word-break` 세로깨짐 주의.
- **커밋:** 태스크마다 커밋. 메시지 한국어, 끝에 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

- `lib/health-score.ts` (신규) — 순수 점수 계산. 타입·기본가중치·임계·`computeHealthScore`·`bandForScore`. **import 0개.**
- `lib/health-signals.ts` (신규) — `Student`+결석집계 → `HealthSignals` 어셈블. `student-activity` 리더 재사용.
- `scripts/checks/health-score.check.ts` (신규) — Task 1 실행 검증.
- `scripts/checks/health-signals.check.ts` (신규) — Task 2 실행 검증.
- `app/api/admin/health-score/route.ts` (신규) — absence-ranking 라우트 패턴 재사용, 학생별 점수 반환.
- `app/admin/health-score/page.tsx` (신규) — 위험 TOP N 화면.
- `app/admin/layout.tsx` (수정) — 관리자 내비에 '건강지수' 링크 추가.

---

## Task 1: 순수 건강지수 계산 모듈

**Files:**
- Create: `lib/health-score.ts`
- Test: `scripts/checks/health-score.check.ts`

**Interfaces:**
- Consumes: 없음 (외부 의존 0)
- Produces:
  - `type HealthBand = 'normal' | 'watch' | 'risk'`
  - `interface HealthSignals { absentDays:number; leftDays:number; planCompletionRate:number|null; distractionSpike:number; avgSleepHours:number|null; phoneNonSubmitDays:number; mockDeclining:boolean; daysSinceConsultation:number|null; penaltyPoints:number }`
  - `interface HealthWeights { absentDay:number; leftDay:number; planShortfall:number; distractionSpike:number; sleepDeficit:number; phoneNonSubmitDay:number; mockDeclining:number; consultationStale:number; penaltyPoint:number }`
  - `const DEFAULT_HEALTH_WEIGHTS: HealthWeights`
  - `interface HealthFactor { key:string; label:string; contribution:number }`
  - `interface HealthResult { score:number; band:HealthBand; factors:HealthFactor[] }`
  - `function bandForScore(score:number): HealthBand`
  - `function computeHealthScore(signals:HealthSignals, weights?:HealthWeights): HealthResult`
  - `const HEALTH_THRESHOLDS`, `CONSULTATION_STALE_AFTER_DAYS`, `RECOMMENDED_SLEEP_HOURS`

- [ ] **Step 1: 모듈 작성**

`lib/health-score.ts`:

```typescript
// 학생 건강지수(위험도) 순수 계산 모듈. 외부 의존 없음(재사용·검증 용이).
// score 0~100 정수, 높을수록 위험.

export type HealthBand = 'normal' | 'watch' | 'risk';

export interface HealthSignals {
  absentDays: number;                   // 최근 윈도우 결석일 (정당사유 제외)
  leftDays: number;                     // 최근 윈도우 이탈일
  planCompletionRate: number | null;    // 최근 7일 계획 이행률 0~1, 활성 계획 없으면 null
  distractionSpike: number;             // 최근 집중이탈 평균 - 기준선(양수=악화)
  avgSleepHours: number | null;         // 최근 평균 수면시간, 기록 없으면 null
  phoneNonSubmitDays: number;           // 최근 윈도우 휴대폰 미제출 일수
  mockDeclining: boolean;               // 최근 모의고사 하락 추세
  daysSinceConsultation: number | null; // 마지막 상담 경과일, 기록 없으면 null
  penaltyPoints: number;                // 최근 순 벌점(penalty-bonus), 음수는 0 취급
}

export interface HealthWeights {
  absentDay: number;
  leftDay: number;
  planShortfall: number;   // (1-이행률) 당
  distractionSpike: number; // spike 1당
  sleepDeficit: number;    // 부족시간(권장-실제) 1시간당
  phoneNonSubmitDay: number;
  mockDeclining: number;   // 하락 추세면 가산(고정)
  consultationStale: number; // 임계 초과 경과일 1일당
  penaltyPoint: number;    // 벌점 1점당
}

export const DEFAULT_HEALTH_WEIGHTS: HealthWeights = {
  absentDay: 12,
  leftDay: 5,
  planShortfall: 20,
  distractionSpike: 2,
  sleepDeficit: 3,
  phoneNonSubmitDay: 3,
  mockDeclining: 10,
  consultationStale: 0.7,
  penaltyPoint: 4,
};

export const HEALTH_THRESHOLDS = { watch: 30, risk: 60 } as const;
export const CONSULTATION_STALE_AFTER_DAYS = 21; // 이 이상 상담 공백부터 가산
export const RECOMMENDED_SLEEP_HOURS = 6;

export interface HealthFactor { key: string; label: string; contribution: number }
export interface HealthResult { score: number; band: HealthBand; factors: HealthFactor[] }

export function bandForScore(score: number): HealthBand {
  if (score >= HEALTH_THRESHOLDS.risk) return 'risk';
  if (score >= HEALTH_THRESHOLDS.watch) return 'watch';
  return 'normal';
}

function round1(n: number): number { return Math.round(n * 10) / 10; }

export function computeHealthScore(
  signals: HealthSignals,
  weights: HealthWeights = DEFAULT_HEALTH_WEIGHTS,
): HealthResult {
  const factors: HealthFactor[] = [];
  const add = (key: string, label: string, contribution: number) => {
    if (contribution > 0) factors.push({ key, label, contribution: round1(contribution) });
  };

  add('absent', '결석', signals.absentDays * weights.absentDay);
  add('left', '이탈', signals.leftDays * weights.leftDay);

  if (signals.planCompletionRate !== null) {
    const shortfall = Math.max(0, 1 - signals.planCompletionRate);
    add('plan', '계획 미이행', shortfall * weights.planShortfall);
  }

  add('distraction', '집중이탈 급증', Math.max(0, signals.distractionSpike) * weights.distractionSpike);

  if (signals.avgSleepHours !== null) {
    const deficit = Math.max(0, RECOMMENDED_SLEEP_HOURS - signals.avgSleepHours);
    add('sleep', '수면부족', deficit * weights.sleepDeficit);
  }

  add('phone', '휴대폰 미제출', signals.phoneNonSubmitDays * weights.phoneNonSubmitDay);

  if (signals.mockDeclining) add('mock', '성적 하락', weights.mockDeclining);

  if (signals.daysSinceConsultation !== null) {
    const over = Math.max(0, signals.daysSinceConsultation - CONSULTATION_STALE_AFTER_DAYS);
    add('consultation', '상담 공백', over * weights.consultationStale);
  }

  add('penalty', '벌점', Math.max(0, signals.penaltyPoints) * weights.penaltyPoint);

  const raw = factors.reduce((s, f) => s + f.contribution, 0);
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  factors.sort((a, b) => b.contribution - a.contribution);
  return { score, band: bandForScore(score), factors };
}
```

- [ ] **Step 2: 실행 검증 스크립트 작성**

`scripts/checks/health-score.check.ts`:

```typescript
import {
  computeHealthScore, bandForScore, DEFAULT_HEALTH_WEIGHTS, type HealthSignals,
} from '../../lib/health-score';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { console.error('FAIL:', msg); failures++; } else console.log('ok:', msg);
}

const perfect: HealthSignals = {
  absentDays: 0, leftDays: 0, planCompletionRate: 1, distractionSpike: 0,
  avgSleepHours: 7, phoneNonSubmitDays: 0, mockDeclining: false,
  daysSinceConsultation: 5, penaltyPoints: 0,
};
assert(computeHealthScore(perfect).score === 0, '완벽한 신호 → 0점');
assert(computeHealthScore(perfect).band === 'normal', '0점은 normal');
assert(computeHealthScore(perfect).factors.length === 0, '기여 요인 없음');

const risky: HealthSignals = {
  absentDays: 3, leftDays: 2, planCompletionRate: 0.2, distractionSpike: 4,
  avgSleepHours: 3, phoneNonSubmitDays: 2, mockDeclining: true,
  daysSinceConsultation: 41, penaltyPoints: 5,
};
const r = computeHealthScore(risky);
assert(r.score === 100, `다중 위험신호 → 100 상한 (got ${r.score})`);
assert(r.band === 'risk', '높은 점수는 risk');
assert(r.factors[0].contribution >= r.factors[1].contribution, 'factors 내림차순');
assert(r.factors.every((f) => f.contribution > 0), '기여 0 요인 제외');

const nulls: HealthSignals = {
  absentDays: 1, leftDays: 0, planCompletionRate: null, distractionSpike: 0,
  avgSleepHours: null, phoneNonSubmitDays: 0, mockDeclining: false,
  daysSinceConsultation: null, penaltyPoints: 0,
};
const n = computeHealthScore(nulls);
assert(n.score === DEFAULT_HEALTH_WEIGHTS.absentDay, `null 신호 스킵, 결석1일=${DEFAULT_HEALTH_WEIGHTS.absentDay} (got ${n.score})`);
assert(!n.factors.some((f) => ['plan', 'sleep', 'consultation'].includes(f.key)), 'null 요인 미포함');

assert(bandForScore(29) === 'normal', '29 normal');
assert(bandForScore(30) === 'watch' && bandForScore(59) === 'watch', '30~59 watch');
assert(bandForScore(60) === 'risk', '60+ risk');

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
if (failures) process.exit(1);
```

- [ ] **Step 3: 검증 실행 (실패 없이 통과)**

Run: `npx tsx scripts/checks/health-score.check.ts`
Expected: 마지막 줄 `ALL PASS` (exit 0). 실패 시 `FAIL:` 줄과 함께 exit 1.

- [ ] **Step 4: 타입/린트 게이트**

Run: `npm run test`
Expected: lint·typecheck 에러 0. (`health-score.ts`는 import가 없어 alias 이슈 없음)

- [ ] **Step 5: 커밋**

```bash
git add lib/health-score.ts scripts/checks/health-score.check.ts
git commit -m "feat: 학생 건강지수 순수 계산 모듈(신호→위험지수·밴드·기여요인)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: 신호 어셈블러 (Student → HealthSignals)

**Files:**
- Create: `lib/health-signals.ts`
- Test: `scripts/checks/health-signals.check.ts`

**Interfaces:**
- Consumes:
  - `lib/health-score.ts` → `HealthSignals`
  - `lib/student-activity.ts` → `getSeoulDateKey(date?)`, `getPomodoroStatsFromStudent(student, dateKey?)`, `getDailyChecklistFromStudent(student, dateKey?)`, `getPlanDailyCompletion(plan, dateKey)`
  - `lib/types/student.ts` → `Student`, `DetailedPlan`
- Produces:
  - `function buildHealthSignals(student: Student, absence: { absentDays:number; leftDays:number } | null, opts?: { today?: Date }): HealthSignals`

- [ ] **Step 1: 어셈블러 작성**

`lib/health-signals.ts`:

```typescript
import type { HealthSignals } from '@/lib/health-score';
import type { Student, DetailedPlan } from '@/lib/types/student';
import {
  getSeoulDateKey,
  getPomodoroStatsFromStudent,
  getDailyChecklistFromStudent,
  getPlanDailyCompletion,
} from '@/lib/student-activity';

// today부터 과거로 n개 날짜키(YYYY-MM-DD, Seoul) 반환
function recentDateKeys(today: Date, n: number): string[] {
  const keys: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(today.getTime());
    d.setDate(d.getDate() - i);
    keys.push(getSeoulDateKey(d));
  }
  return keys;
}

// subjects[].books/lectures[] + 최상위 books/lectures[]의 모든 detailedPlans 수집
function collectDetailedPlans(student: Student): DetailedPlan[] {
  const plans: DetailedPlan[] = [];
  const pushFrom = (books?: { detailedPlans?: DetailedPlan[] }[], lectures?: { detailedPlans?: DetailedPlan[] }[]) => {
    (books || []).forEach((b) => (b.detailedPlans || []).forEach((p) => plans.push(p)));
    (lectures || []).forEach((l) => (l.detailedPlans || []).forEach((p) => plans.push(p)));
  };
  (student.subjects || []).forEach((s) => pushFrom(s.books, s.lectures));
  pushFrom(student.books, student.lectures);
  return plans;
}

function computePlanCompletionRate(student: Student, last7: string[]): number | null {
  const plans = collectDetailedPlans(student);
  let expected = 0;
  let completed = 0;
  for (const dk of last7) {
    const inWindow = plans.filter((p) => p.startDate <= dk && dk <= p.endDate);
    if (inWindow.length === 0) continue; // 그 날 활성 계획 없음 → 분모 제외
    expected++;
    if (inWindow.some((p) => getPlanDailyCompletion(p, dk).isCompleted)) completed++;
  }
  return expected > 0 ? completed / expected : null;
}

// 최근 3 활성일 평균 - 이전 4~10 활성일 평균 (활성 = 뽀모도로 세션 있는 날)
function computeDistractionSpike(student: Student, keys: string[]): number {
  const active = keys
    .map((dk) => ({ dk, ...getPomodoroStatsFromStudent(student, dk) }))
    .filter((s) => s.sessions > 0);
  const recent = active.slice(0, 3);
  const prior = active.slice(3, 10);
  if (recent.length === 0 || prior.length === 0) return 0;
  const avg = (arr: { distractions: number }[]) => arr.reduce((s, x) => s + x.distractions, 0) / arr.length;
  return avg(recent) - avg(prior);
}

function computeSleepAndPhone(student: Student, last7: string[]): { avgSleepHours: number | null; phoneNonSubmitDays: number } {
  let sleepSum = 0;
  let sleepCount = 0;
  let phoneNonSubmit = 0;
  for (const dk of last7) {
    const entry = getDailyChecklistFromStudent(student, dk);
    if (!entry) continue;
    if (typeof entry.sleep_hours === 'number') { sleepSum += entry.sleep_hours; sleepCount++; }
    const status = entry.phone_status ?? (entry.phone_submitted ? 'submitted' : undefined);
    if (status && status !== 'submitted') phoneNonSubmit++;
  }
  return { avgSleepHours: sleepCount > 0 ? sleepSum / sleepCount : null, phoneNonSubmitDays: phoneNonSubmit };
}

function computeMockDeclining(student: Student): boolean {
  const scored = (student.mockExams || [])
    .filter((e) => typeof e.score === 'number')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  if (scored.length < 2) return false;
  return (scored[0].score as number) < (scored[1].score as number);
}

function computeDaysSinceConsultation(student: Student, today: Date): number | null {
  const dates = (student.consultationLogs || []).map((l) => l.date).filter(Boolean).sort((a, b) => b.localeCompare(a));
  if (dates.length === 0) return null;
  const last = new Date(`${dates[0]}T00:00:00+09:00`);
  const diff = Math.floor((today.getTime() - last.getTime()) / 86400000);
  return diff >= 0 ? diff : 0;
}

function computePenaltyPoints(student: Student, today: Date): number {
  const cutoff = new Date(today.getTime());
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffKey = getSeoulDateKey(cutoff);
  let net = 0;
  for (const p of student.penalties || []) {
    if (p.date < cutoffKey) continue;
    net += p.type === 'penalty' ? p.points : -p.points;
  }
  return net;
}

export function buildHealthSignals(
  student: Student,
  absence: { absentDays: number; leftDays: number } | null,
  opts?: { today?: Date },
): HealthSignals {
  const today = opts?.today ?? new Date();
  const last7 = recentDateKeys(today, 7);
  const last14 = recentDateKeys(today, 14);
  const { avgSleepHours, phoneNonSubmitDays } = computeSleepAndPhone(student, last7);
  return {
    absentDays: absence?.absentDays ?? 0,
    leftDays: absence?.leftDays ?? 0,
    planCompletionRate: computePlanCompletionRate(student, last7),
    distractionSpike: computeDistractionSpike(student, last14),
    avgSleepHours,
    phoneNonSubmitDays,
    mockDeclining: computeMockDeclining(student),
    daysSinceConsultation: computeDaysSinceConsultation(student, today),
    penaltyPoints: computePenaltyPoints(student, today),
  };
}
```

> 주의: `Student.subjects[]`의 항목 타입에 `books`/`lectures`가 있음(Explore 확인). `collectDetailedPlans`의 매개변수 타입은 최소 구조만 요구하도록 구조적 타이핑을 사용한다. typecheck가 통과하지 않으면 `s.books`/`s.lectures` 접근을 `(s.books ?? [])`로 방어.

- [ ] **Step 2: 실행 검증 스크립트 작성**

`scripts/checks/health-signals.check.ts`:

```typescript
import { buildHealthSignals } from '../../lib/health-signals';
import type { Student } from '../../lib/types/student';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { console.error('FAIL:', msg); failures++; } else console.log('ok:', msg);
}

const today = new Date('2026-07-01T09:00:00+09:00');
const dk = (n: number) => {
  const d = new Date(today.getTime()); d.setDate(d.getDate() - n);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(d);
};

// 최소 Student(관계형 필드 대부분 생략) — 어셈블러가 방어적으로 읽는지 확인
const base = {
  id: 's1', name: '홍길동', campus: 'wonju', manager: 'm',
  createdAt: '2026-01-01', updatedAt: '2026-06-30',
  books: [], lectures: [], consultationLogs: [], grades: [],
} as unknown as Student;

const empty = buildHealthSignals(base, null, { today });
assert(empty.absentDays === 0 && empty.leftDays === 0, '결석집계 null → 0');
assert(empty.planCompletionRate === null, '활성 계획 없음 → null');
assert(empty.avgSleepHours === null, '수면 기록 없음 → null');
assert(empty.daysSinceConsultation === null, '상담 없음 → null');
assert(empty.penaltyPoints === 0, '벌점 없음 → 0');
assert(empty.mockDeclining === false, '모고 없음 → false');

// 계획 이행률: 최근 7일 중 어제만 활성+미완료 → 0/1 = 0
const withPlan = {
  ...base,
  subjects: [{
    books: [{ detailedPlans: [{
      id: 'p1', materialId: 'm1', weekNumber: 1, startDate: dk(6), endDate: dk(0),
      targetAmount: 10, rangeText: '', isCompleted: false, dailyCompletions: {},
    }] }],
    lectures: [],
  }],
} as unknown as Student;
const pr = buildHealthSignals(withPlan, { absentDays: 2, leftDays: 1 }, { today });
assert(pr.absentDays === 2 && pr.leftDays === 1, '결석/이탈 전달');
assert(pr.planCompletionRate === 0, `활성계획 미완료 → 0 (got ${pr.planCompletionRate})`);

// 상담 경과일: 10일 전 상담 → 10
const withConsult = { ...base, consultationLogs: [{ id: 'c', date: dk(10), manager: 'm', content: '' }] } as unknown as Student;
assert(buildHealthSignals(withConsult, null, { today }).daysSinceConsultation === 10, '상담 경과일 10');

// 모의고사 하락: 최신(70) < 직전(80) → true
const withMock = { ...base, mockExams: [
  { examId: 'e2', status: 'attending', score: 70, updatedAt: '2026-06-20T00:00:00Z' },
  { examId: 'e1', status: 'attending', score: 80, updatedAt: '2026-05-20T00:00:00Z' },
] } as unknown as Student;
assert(buildHealthSignals(withMock, null, { today }).mockDeclining === true, '모의고사 하락 감지');

// 벌점: 30일 내 penalty 3, bonus 1 → net 2
const withPenalty = { ...base, penalties: [
  { id: 'x', date: dk(5), points: 3, reason: '', type: 'penalty', awardedBy: 'a', createdAt: '' },
  { id: 'y', date: dk(5), points: 1, reason: '', type: 'bonus', awardedBy: 'a', createdAt: '' },
] } as unknown as Student;
assert(buildHealthSignals(withPenalty, null, { today }).penaltyPoints === 2, '순 벌점 2');

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
if (failures) process.exit(1);
```

- [ ] **Step 3: 검증 실행**

Run: `npx tsx scripts/checks/health-signals.check.ts`
Expected: `ALL PASS` (exit 0).
> `@/` alias 미해석으로 실패하면 `npx tsx --tsconfig ./tsconfig.json scripts/checks/health-signals.check.ts`로 재실행.

- [ ] **Step 4: 타입/린트 게이트**

Run: `npm run test`
Expected: 에러 0. (`Student.subjects` 항목의 `books/lectures` 접근에서 타입 에러가 나면 Step 1 주의사항대로 방어 접근 적용 후 재실행)

- [ ] **Step 5: 커밋**

```bash
git add lib/health-signals.ts scripts/checks/health-signals.check.ts
git commit -m "feat: 건강지수 신호 어셈블러(Student→계획이행·집중이탈·수면·벌점·상담공백·모고추세)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: 건강지수 API 라우트

**Files:**
- Create: `app/api/admin/health-score/route.ts`
- Reference (수정 금지, 패턴 복제): `app/api/admin/attendance/absence-ranking/route.ts`

**Interfaces:**
- Consumes: `buildHealthSignals`(Task 2), `computeHealthScore`/`DEFAULT_HEALTH_WEIGHTS`/`HealthWeights`(Task 1), 기존 `buildAbsenceRanking`(`lib/absence-stats.ts`), absence-ranking 라우트가 쓰는 데이터 로더/세션/`VALID_CAMPUSES`, `getAppSettingSupabase`(`lib/supabase.ts`).
- Produces: `GET /api/admin/health-score?campus=<code>&days=<n>` → `{ success:true, data: HealthRow[] }`
  - `interface HealthRow { studentId:string; name:string; campus:string; score:number; band:'normal'|'watch'|'risk'; factors:{key:string;label:string;contribution:number}[] }`

- [ ] **Step 1: 라우트 작성 (absence-ranking 패턴 복제)**

먼저 `app/api/admin/attendance/absence-ranking/route.ts`를 열어 실제 import 이름(세션 함수, 학생/좌석/등원 로더, `VALID_CAMPUSES`, 날짜 파라미터 처리)을 확인하고 **동일한 import를 재사용**한다. 그 위에 아래 로직을 얹는다:

`app/api/admin/health-score/route.ts`:

```typescript
import { NextResponse } from 'next/server';
// ↓ absence-ranking/route.ts와 동일한 경로/이름으로 맞춘다:
//   getAdminSession, getStudents, getSeatAbsenceMarks, getAttendedDays, VALID_CAMPUSES
import { getAdminSession } from '@/lib/auth';
import { getStudents, getSeatAbsenceMarks, getAttendedDays } from '@/lib/store';
import { buildAbsenceRanking } from '@/lib/absence-stats';
import { getAppSettingSupabase } from '@/lib/supabase';
import { buildHealthSignals } from '@/lib/health-signals';
import { computeHealthScore, DEFAULT_HEALTH_WEIGHTS, type HealthWeights } from '@/lib/health-score';

const VALID_CAMPUSES = ['wonju', 'chuncheon', 'chungju'];
const HEALTH_WEIGHTS_KEY = 'health_score_weights';

function ymd(d: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(d);
}

export async function GET(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const campusFilter = searchParams.get('campus');
  const days = Math.min(30, Math.max(7, Number(searchParams.get('days')) || 14));

  const to = new Date();
  const from = new Date(to.getTime());
  from.setDate(from.getDate() - (days - 1));
  const fromStr = ymd(from);
  const toStr = ymd(to);

  const [marks, attended, allStudents, rawWeights] = await Promise.all([
    getSeatAbsenceMarks(fromStr, toStr),
    getAttendedDays(fromStr, toStr),
    getStudents(),
    getAppSettingSupabase(HEALTH_WEIGHTS_KEY),
  ]);

  // 캠퍼스 스코프
  let students = allStudents;
  if (session.campus !== 'all') {
    students = students.filter((s) => s.campus === session.campus);
  } else if (campusFilter) {
    if (!VALID_CAMPUSES.includes(campusFilter)) {
      return NextResponse.json({ success: false, message: '잘못된 캠퍼스' }, { status: 400 });
    }
    students = students.filter((s) => s.campus === campusFilter);
  }

  const weights: HealthWeights = { ...DEFAULT_HEALTH_WEIGHTS, ...(rawWeights || {}) };

  // 결석집계를 studentId로 인덱싱해 재사용
  const absenceRows = buildAbsenceRanking(marks, attended, students);
  const absenceById = new Map(absenceRows.map((r) => [r.studentId, r]));

  const data = students.map((s) => {
    const a = absenceById.get(s.id);
    const signals = buildHealthSignals(s, a ? { absentDays: a.absentDays, leftDays: a.leftDays } : null);
    const result = computeHealthScore(signals, weights);
    return {
      studentId: s.id,
      name: s.name,
      campus: s.campus,
      score: result.score,
      band: result.band,
      factors: result.factors,
    };
  });

  data.sort((x, y) => y.score - x.score || x.name.localeCompare(y.name, 'ko'));

  return NextResponse.json({ success: true, data });
}
```

> **중요:** import 이름은 반드시 `absence-ranking/route.ts`에서 실제 사용하는 것과 일치시킬 것(`getSeatAbsenceMarks`/`getAttendedDays`/`getStudents`/`getAdminSession`의 실제 export 경로). 위 경로는 가정치이며, 참조 파일과 다르면 참조 파일 쪽으로 맞춘다.

- [ ] **Step 2: 타입/린트 게이트**

Run: `npm run test`
Expected: 에러 0.

- [ ] **Step 3: 라우트 동작 확인 (live-verifier 또는 수동)**

dev 서버에서 관리자 세션으로 `GET /api/admin/health-score?days=14` 호출 → `{ success:true, data:[...] }`, `data`가 `score` 내림차순인지 확인. (운영 Supabase 격리·stale .next 404 함정은 verify-live 스킬 절차 준수)

- [ ] **Step 4: 커밋**

```bash
git add app/api/admin/health-score/route.ts
git commit -m "feat: 건강지수 API(캠퍼스 스코프·결석집계 재사용·가중치 app_settings 폴백·score 내림차순)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: 위험 TOP N 관리자 화면 + 내비 링크

**Files:**
- Create: `app/admin/health-score/page.tsx`
- Modify: `app/admin/layout.tsx` (내비 항목 추가)
- Reference: `app/admin/dashboard/page.tsx` (auth/fetch 패턴), `app/admin/inbox/page.tsx` (glass 카드·campus 라벨 패턴)

**Interfaces:**
- Consumes: `GET /api/admin/health-score`(Task 3), `getCampusLabel`(`lib/meal.ts`)
- Produces: 라우트 `/admin/health-score`

- [ ] **Step 1: 페이지 작성**

`app/admin/dashboard/page.tsx`의 auth 패턴(`fetch('/api/admin/auth/me')` → 실패 시 `router.replace('/admin')`, 성공 시 `campus` 저장)을 그대로 따른다.

`app/admin/health-score/page.tsx`:

```tsx
'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { getCampusLabel } from '@/lib/meal';

interface HealthRow {
  studentId: string;
  name: string;
  campus: string;
  score: number;
  band: 'normal' | 'watch' | 'risk';
  factors: { key: string; label: string; contribution: number }[];
}

const BAND_STYLE: Record<HealthRow['band'], { label: string; cls: string }> = {
  risk: { label: '위험', cls: 'bg-red-500/15 text-red-600 border-red-500/30' },
  watch: { label: '주의', cls: 'bg-amber-500/15 text-amber-600 border-amber-500/30' },
  normal: { label: '정상', cls: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30' },
};

export default function HealthScorePage() {
  const router = useRouter();
  const [rows, setRows] = React.useState<HealthRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [adminCampus, setAdminCampus] = React.useState<string>('all');
  const [campusFilter, setCampusFilter] = React.useState<string>('all');

  React.useEffect(() => {
    (async () => {
      const me = await fetch('/api/admin/auth/me');
      if (!me.ok) { router.replace('/admin'); return; }
      const j = await me.json();
      setAdminCampus(j.campus || 'all');
      load('all');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load(campus: string) {
    setLoading(true);
    const q = campus && campus !== 'all' ? `?campus=${campus}` : '';
    const res = await fetch(`/api/admin/health-score${q}`, { cache: 'no-store' });
    const j = await res.json();
    setRows(j.data || []);
    setLoading(false);
  }

  const visible = rows.filter((r) => r.band !== 'normal');

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-semibold">학생 건강지수 · 위험 TOP</h1>
        {adminCampus === 'all' && (
          <select
            value={campusFilter}
            onChange={(e) => { setCampusFilter(e.target.value); load(e.target.value); }}
            className="glass rounded-lg px-3 py-2 text-sm"
          >
            <option value="all">전체 캠퍼스</option>
            <option value="wonju">원주</option>
            <option value="chuncheon">춘천</option>
            <option value="chungju">충주</option>
          </select>
        )}
      </header>

      {loading ? (
        <p className="text-sm text-gray-500">불러오는 중…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-gray-500">주의·위험 학생이 없습니다.</p>
      ) : (
        <ul className="space-y-3">
          {visible.map((r) => {
            const b = BAND_STYLE[r.band];
            return (
              <li key={r.studentId} className="glass rounded-2xl p-4 flex items-start gap-4">
                <div className="text-2xl font-bold tabular-nums w-12 text-center">{r.score}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{r.name}</span>
                    <span className="text-xs text-gray-500">{getCampusLabel(r.campus)}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${b.cls}`}>{b.label}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {r.factors.slice(0, 4).map((f) => (
                      <span key={f.key} className="text-xs px-2 py-0.5 rounded-md bg-black/5 dark:bg-white/10">
                        {f.label} +{f.contribution}
                      </span>
                    ))}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

> band 색은 의미(위험=red, 주의=amber, 정상=emerald)로만 사용, **보라/인디고 금지**. `.glass` 유틸 재사용. factor 칩은 한 줄에 여러 개 — 한글 `word-break`로 세로깨짐 나지 않게 `flex-wrap`만 사용(글자 강제 줄바꿈 금지).

- [ ] **Step 2: 내비 링크 추가**

`app/admin/layout.tsx`를 열어 기존 내비 항목 배열(형제 링크들)을 찾고, **동일한 항목 형태로** 건강지수 링크를 추가한다(예: `{ href: '/admin/health-score', label: '건강지수' }` 형태로 형제와 키/구조 일치). 위치는 출결/대시보드 근처.

- [ ] **Step 3: 타입/린트 게이트**

Run: `npm run test`
Expected: 에러 0.

- [ ] **Step 4: 화면 검증 (live-verifier)**

dev 서버 + 관리자 세션으로 `/admin/health-score` 진입 → 위험/주의 학생이 score 내림차순으로 카드 렌더, band 색·factor 칩 표시, 캠퍼스 셀렉트(슈퍼) 동작, 내비 링크로 진입되는지 스냅샷/스크린샷으로 확인. (verify-live 절차: 운영 Supabase 격리·stale .next 404 회피)

- [ ] **Step 5: 커밋**

```bash
git add app/admin/health-score/page.tsx app/admin/layout.tsx
git commit -m "feat: 위험 TOP N 관리자 화면(밴드색·기여요인 칩·캠퍼스 필터) + 내비 링크

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage (스펙 §4.1 건강지수 엔진):**
- 순수 함수 모듈 `lib/health-score.ts` → Task 1 ✅
- 입력 신호(결석·이탈·이행률·집중이탈·수면·모고·상담경과·벌점) → Task 2 어셈블러 ✅ (휴대폰 미제출도 포함)
- score/band/factors breakdown → Task 1 ✅
- 가중치 app_settings 조정(기본값 폴백) → Task 3 라우트에서 read+merge ✅ (편집 UI는 후속 계획으로 명시적 이월 — 스펙은 "조정 가능"만 요구, 직접 settings 편집으로 충족)
- 위험 TOP N 대시보드 → Task 4 ✅
- 후속(#2 디제스트·#3 트리거·#8 미션추천)이 이 출력 재사용 → 엔진/어셈블러/라우트가 분리돼 재사용 가능 ✅

**2. Placeholder scan:** 모든 코드 스텝에 실제 코드 포함. "TBD/TODO/적절히 처리" 없음. 유일한 가정치는 Task 3 import 이름 → "참조 파일과 일치시킬 것"으로 구체 지시 ✅

**3. Type consistency:** `HealthSignals`/`HealthWeights`/`HealthResult`/`HealthRow` 필드명이 Task 1↔2↔3↔4에서 일치. `buildHealthSignals(student, absence, opts)` 시그니처가 Task 2 정의 = Task 3 호출과 일치. `getPlanDailyCompletion`/`getPomodoroStatsFromStudent`/`getDailyChecklistFromStudent`/`getSeoulDateKey`는 Explore 확인된 실제 export ✅

**남은 리스크(실행 중 확인):**
- Task 3 데이터 로더 export 이름/경로 — 참조 파일로 확정.
- `npx tsx`의 `@/` alias 해석 — 실패 시 `--tsconfig` 플래그.
- `app/admin/layout.tsx` 내비 배열 실제 형태 — 파일 열어 형제 복제.
- 마이그레이션: **불필요** (app_settings·기존 테이블만 사용). 새 컬럼/테이블 없음 → migration-check 대상 아님.
