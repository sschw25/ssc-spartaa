# 학생 승인 후 첫진입 온보딩 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 승인된 신규생이 처음 로그인하면 환영+핵심 사용법 가이드(`/student/welcome`)를 보여주고, 완료하면 다시 안 뜨게 하며, "사용법 다시보기"로 재열람 가능하게 한다.

**Architecture:** 리포트 페이지를 건드리지 않는 격리 전용 라우트. 단계 구성은 순수 모듈(`lib/onboarding.ts`)로, 완료 플래그는 `student_state.onboardedAt`(jsonb, 마이그레이션 없음)에 `updateStudentById` 병합 저장. 진입 분기는 중앙 진입점 `app/student/page.tsx`에 추가.

**Tech Stack:** Next.js App Router(서버 컴포넌트 가드 + 클라이언트 캐러셀), TypeScript 5.7, Supabase/local-json 이중. 표준 테스트러너 없음 → 순수함수는 `npx tsx scripts/verify-*.mts`.

## Global Constraints

- 마이그레이션 금지: 완료 플래그는 `student_state.onboardedAt`(ISO 문자열), 기존 `student_state`(enrollStartDate 등) 보존.
- 읽고 닫기 성격: 체크리스트·진행률·게이미피케이션 없음(YAGNI).
- 모의고사 단계: `Student.contact`(목표시험, 자유텍스트)에 `공무원`/`경찰`/`소방`/`수능` 중 하나라도 포함될 때만. (substring 매칭.)
- 온보딩이 진입을 막지 않음: POST 실패해도 리포트로 진행.
- replay 모드(`?replay=1`): 단계는 보여주되 닫을 때 플래그 재기록 안 함.
- 색: 보라/인디고 금지. iOS26 글래스. 사진 필요시 placeholder. 글 많은 곳 시각화 대체 가능.
- 리포트 측 변경은 '사용법 다시보기' 링크 1개만 — `use-report-state` early-return/기존 흐름 미변경.
- import 별칭 `@/*` = 레포 루트. 학생 세션 = `getStudentSessionId()`(@/lib/auth). 학생 조회 = `getStudentById`(@/lib/store).
- 리다이렉트 경로: 비로그인 → `/student/login`, 리포트 → `/report/{id}?audience=student`.

---

### Task 1: 온보딩 단계 순수 모듈

**Files:**
- Create: `lib/onboarding.ts`
- Test: `scripts/verify-onboarding.mts`

**Interfaces:**
- Produces:
  - `export type WelcomeStepId = 'welcome' | 'attendance' | 'report' | 'requests' | 'meal' | 'coupon' | 'mock' | 'finish'`
  - `export const MOCK_EXAM_KEYWORDS = ['공무원', '경찰', '소방', '수능']`
  - `export function shouldShowMockStep(contact?: string): boolean`
  - `export function buildWelcomeStepIds(showMock: boolean): WelcomeStepId[]`

- [ ] **Step 1: 검증 스크립트 작성 (실패 먼저)**

`scripts/verify-onboarding.mts` 생성:

```typescript
import assert from 'node:assert';
import { shouldShowMockStep, buildWelcomeStepIds } from '../lib/onboarding';

// shouldShowMockStep
assert.strictEqual(shouldShowMockStep('9급 공무원'), true, '공무원 포함');
assert.strictEqual(shouldShowMockStep('경찰'), true, '경찰');
assert.strictEqual(shouldShowMockStep('소방 준비'), true, '소방');
assert.strictEqual(shouldShowMockStep('수능'), true, '수능');
assert.strictEqual(shouldShowMockStep('임용'), false, '임용 제외');
assert.strictEqual(shouldShowMockStep(''), false, '빈문자열');
assert.strictEqual(shouldShowMockStep(undefined), false, 'undefined');

// buildWelcomeStepIds
const withMock = buildWelcomeStepIds(true);
const noMock = buildWelcomeStepIds(false);
assert.deepStrictEqual(withMock, ['welcome','attendance','report','requests','meal','coupon','mock','finish'], 'mock 포함 순서');
assert.deepStrictEqual(noMock, ['welcome','attendance','report','requests','meal','coupon','finish'], 'mock 제외');
assert.ok(!noMock.includes('mock'), 'noMock에 mock 없음');
assert.strictEqual(withMock[0], 'welcome', '첫 단계 welcome');
assert.strictEqual(withMock[withMock.length - 1], 'finish', '마지막 finish');

console.log('PASS: onboarding');
```

- [ ] **Step 2: 실패 확인**

Run: `npx tsx scripts/verify-onboarding.mts`
Expected: FAIL — `shouldShowMockStep is not a function`

- [ ] **Step 3: 모듈 구현**

`lib/onboarding.ts` 생성:

```typescript
// 승인 후 첫진입 온보딩 단계 구성(순수). 화면 콘텐츠/문구는 컴포넌트가 담당하고,
// 여기서는 "어떤 단계를 어떤 순서로" 보여줄지만 결정한다.

export type WelcomeStepId =
  | 'welcome' | 'attendance' | 'report' | 'requests' | 'meal' | 'coupon' | 'mock' | 'finish';

// 모의고사 단계를 노출할 목표시험 키워드. contact(자유텍스트)에 substring으로 매칭.
export const MOCK_EXAM_KEYWORDS = ['공무원', '경찰', '소방', '수능'];

export function shouldShowMockStep(contact?: string): boolean {
  if (!contact) return false;
  return MOCK_EXAM_KEYWORDS.some((kw) => contact.includes(kw));
}

export function buildWelcomeStepIds(showMock: boolean): WelcomeStepId[] {
  return [
    'welcome',
    'attendance',
    'report',
    'requests',
    'meal',
    'coupon',
    ...(showMock ? (['mock'] as const) : []),
    'finish',
  ];
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx tsx scripts/verify-onboarding.mts`
Expected: `PASS: onboarding`

- [ ] **Step 5: 타입 체크 + 커밋**

```bash
npx tsc --noEmit
git add lib/onboarding.ts scripts/verify-onboarding.mts
git commit -m "feat: 온보딩 단계 구성 순수 모듈(shouldShowMockStep·buildWelcomeStepIds)"
```

---

### Task 2: 완료 플래그 저장 + 온보딩 API

**Files:**
- Modify: `lib/store.ts` (`markStudentOnboarded` 추가)
- Create: `app/api/student/onboarding/route.ts`

**Interfaces:**
- Consumes: 기존 `updateStudentById(id, mutate)` (반환 `Student | 'not_found' | 'conflict' | 'abort'`), `getStudentSessionId()`.
- Produces:
  - `markStudentOnboarded(studentId: string): Promise<boolean>` (store) — `student_state.onboardedAt` 멱등 설정.
  - `POST /api/student/onboarding` → `{ success }`.

- [ ] **Step 1: store 헬퍼 추가**

`lib/store.ts`의 학생 관련 함수들 근처에 추가:

```typescript
// 승인 후 첫진입 온보딩 완료 표시. student_state.onboardedAt 을 멱등 설정(기존 값 보존).
// 다른 student_state 키(enrollStartDate 등)는 보존된다.
export async function markStudentOnboarded(studentId: string): Promise<boolean> {
  const result = await updateStudentById(studentId, (s) => {
    const prev = (s.studentState || {}) as Record<string, unknown>;
    if (prev.onboardedAt) return false; // 이미 완료 → 저장 스킵(멱등)
    s.studentState = { ...prev, onboardedAt: new Date().toISOString() };
  });
  return result !== 'not_found' && result !== 'conflict' && result !== 'abort';
}
```

> `updateStudentById`의 mutate가 `false`를 반환하면 'abort'가 되어 저장을 건너뛴다(이미 온보딩됨도 true로 보고 싶으면 아래 라우트에서 성공 처리). `Student` 타입에 `studentState?: Record<string, any>`가 있는지 확인(있음 — supabase rowToStudent가 `studentState: r.student_state || {}` 매핑).

- [ ] **Step 2: API 라우트 작성**

`app/api/student/onboarding/route.ts` 생성:

```typescript
import { NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { markStudentOnboarded } from '@/lib/store';

export async function POST() {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }
  try {
    await markStudentOnboarded(studentId); // 멱등 — 이미 완료여도 성공으로 본다
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[student onboarding POST]', err);
    return NextResponse.json({ success: false, message: '저장에 실패했습니다.' }, { status: 500 });
  }
}
```

- [ ] **Step 3: 타입 체크 + 빌드**

Run: `npx tsc --noEmit && npm run build`
Expected: 성공, 새 라우트 컴파일. (stale `.next/types`면 `rm -rf .next/types` 후 재실행.) 빌드 로그 끝부분 report 첨부.

- [ ] **Step 4: 수동 검증 메모**

report에 "수동 확인 필요: 학생 로그인 후 POST /api/student/onboarding → success, student_state.onboardedAt 설정, 다른 student_state 키 보존" 남겨라.

- [ ] **Step 5: 커밋**

```bash
git add lib/store.ts app/api/student/onboarding/route.ts
git commit -m "feat: 온보딩 완료 플래그(student_state.onboardedAt) 저장 + API"
```

---

### Task 3: 환영 라우트 + 캐러셀

**Files:**
- Create: `app/student/welcome/page.tsx` (서버 가드 + 마운트)
- Create: `components/student/welcome-carousel.tsx` (클라이언트 캐러셀)

**Interfaces:**
- Consumes: `shouldShowMockStep`/`buildWelcomeStepIds`/`WelcomeStepId` (Task 1), `getStudentSessionId`/`getStudentById` (store/auth), `POST /api/student/onboarding` (Task 2).
- Produces: `/student/welcome`(+`?replay=1`) 화면.

- [ ] **Step 1: 서버 가드 페이지**

`app/student/welcome/page.tsx` 생성:

```typescript
import { redirect } from 'next/navigation';
import { getStudentSessionId } from '@/lib/auth';
import { getStudentById } from '@/lib/store';
import { shouldShowMockStep } from '@/lib/onboarding';
import { WelcomeCarousel } from '@/components/student/welcome-carousel';

export default async function StudentWelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ replay?: string }>;
}) {
  const sid = await getStudentSessionId();
  if (!sid) redirect('/student/login');

  const student = await getStudentById(sid);
  if (!student) redirect('/student/login');

  const { replay } = await searchParams;
  const isReplay = replay === '1';
  const onboarded = Boolean((student.studentState as Record<string, unknown> | undefined)?.onboardedAt);

  // 이미 온보딩했고 재열람이 아니면 리포트로.
  if (onboarded && !isReplay) {
    redirect(`/report/${sid}?audience=student`);
  }

  return (
    <WelcomeCarousel
      studentId={sid}
      name={student.name}
      campus={student.campus}
      enrollStartDate={student.enrollStartDate}
      showMock={shouldShowMockStep(student.contact)}
      replay={isReplay}
    />
  );
}
```

> Next 15 App Router에서 `searchParams`는 Promise다(이 레포의 다른 라우트가 `params: Promise<...>` 패턴 사용). `getStudentById`/`getStudentSessionId` 시그니처는 기존 학생 라우트(`app/api/student/mock-exams/route.ts`)와 동일하게 사용.

- [ ] **Step 2: 캐러셀 컴포넌트**

`components/student/welcome-carousel.tsx` 생성. 단계 id→콘텐츠 매핑은 이 컴포넌트가 보유(프레젠테이션):

```tsx
'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildWelcomeStepIds, type WelcomeStepId } from '@/lib/onboarding';

interface WelcomeCarouselProps {
  studentId: string;
  name: string;
  campus: string;
  enrollStartDate?: string;
  showMock: boolean;
  replay: boolean;
}

export function WelcomeCarousel({ studentId, name, campus, enrollStartDate, showMock, replay }: WelcomeCarouselProps) {
  const router = useRouter();
  const stepIds = useMemo(() => buildWelcomeStepIds(showMock), [showMock]);
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(false);

  const stepContent: Record<WelcomeStepId, { title: string; body: string }> = {
    welcome: { title: `${name}님, 환영해요!`, body: `${campus} 센터${enrollStartDate ? ` · 이용 시작일 ${enrollStartDate}` : ''}. SSC스파르타와 함께 시작해요.` },
    attendance: { title: '출결은 QR로', body: '입구 QR을 본인 로그인으로 스캔해 등원/하원을 찍어요. 순공 시간이 자동 기록돼요.' },
    report: { title: '내 리포트', body: '진도·성적·순공 시간·랭킹을 여기서 확인해요. 매주 성적도 입력해요.' },
    requests: { title: '신청과 소통', body: '휴가/반차·상담 예약을 신청하고, 메시지로 담당 코멘터와 소통해요.' },
    meal: { title: '도시락 신청', body: '주간 도시락을 미리 신청할 수 있어요. 마감 시간을 확인하세요.' },
    coupon: { title: '미션과 쿠폰', body: '미션을 달성하면 쿠폰을 받고, 반차권·상품 등으로 교환할 수 있어요.' },
    mock: { title: '모의고사', body: '예정된 모의고사 응시 여부를 앱에서 응답해요. 일정 알림을 받게 돼요.' },
    finish: { title: '이제 시작해요', body: '출결번호로 로그인해요. 시작일부터 이용 가능하고, 궁금한 건 언제든 메시지로 물어보세요.' },
  };

  const isLast = idx >= stepIds.length - 1;
  const current = stepContent[stepIds[idx]];

  async function finish() {
    if (busy) return;
    setBusy(true);
    try {
      if (!replay) {
        await fetch('/api/student/onboarding', { method: 'POST' }).catch(() => {});
      }
    } finally {
      router.push(`/report/${studentId}?audience=student`);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-3xl bg-white/80 backdrop-blur p-6 shadow-sm">
        <div className="flex justify-end">
          <button onClick={finish} className="text-xs text-[#86868B]" disabled={busy}>건너뛰기</button>
        </div>
        <h2 className="text-xl font-semibold mt-2">{current.title}</h2>
        <p className="text-sm text-[#1d1d1f]/80 mt-3 leading-relaxed">{current.body}</p>
        {/* 진행 점 */}
        <div className="flex gap-1.5 justify-center mt-6">
          {stepIds.map((s, i) => (
            <span key={s} className={`h-1.5 rounded-full transition-all ${i === idx ? 'w-4 bg-[#0071E3]' : 'w-1.5 bg-[#D2D2D7]'}`} />
          ))}
        </div>
        <div className="flex gap-2 mt-6">
          {idx > 0 && (
            <button onClick={() => setIdx((v) => v - 1)} className="flex-1 rounded-full py-2.5 text-sm bg-[#F5F5F7]" disabled={busy}>이전</button>
          )}
          {!isLast ? (
            <button onClick={() => setIdx((v) => v + 1)} className="flex-1 rounded-full py-2.5 text-sm bg-[#0071E3] text-white">다음</button>
          ) : (
            <button onClick={finish} className="flex-1 rounded-full py-2.5 text-sm bg-[#0071E3] text-white" disabled={busy}>시작하기</button>
          )}
        </div>
      </div>
    </div>
  );
}
```

> 스타일은 위 자리표시(애플 블루 `#0071E3` 등 — 보라/인디고 아님)를 기준으로 페이지 iOS26 글래스 톤에 맞춰 다듬어도 됨. 문구는 그대로 사용 가능.

- [ ] **Step 3: 타입 체크 + 빌드**

Run: `npx tsc --noEmit && npm run build`
Expected: 성공, `/student/welcome` 라우트 컴파일.

- [ ] **Step 4: 수동 검증 메모**

report에 "수동 확인 필요: /student/welcome 직접 접근 → 단계 이동/건너뛰기/시작하기, ?replay=1로 재열람" 남겨라.

- [ ] **Step 5: 커밋**

```bash
git add app/student/welcome/page.tsx components/student/welcome-carousel.tsx
git commit -m "feat: 학생 환영 온보딩 라우트(/student/welcome) + 단계 캐러셀"
```

---

### Task 4: 진입 분기 + 사용법 다시보기 링크

**Files:**
- Modify: `app/student/page.tsx` (온보딩 분기)
- Modify: 학생 리포트 진입 컴포넌트 1곳 (사용법 다시보기 링크)

**Interfaces:**
- Consumes: `getStudentSessionId`, `getStudentById`, `/student/welcome` 라우트.

- [ ] **Step 1: 중앙 진입점 분기**

`app/student/page.tsx`를 교체:

```typescript
import { redirect } from 'next/navigation';
import { getStudentSessionId } from '@/lib/auth';
import { getStudentById } from '@/lib/store';

// 학생 포털 진입점: 로그인 + 온보딩 여부에 따라 분기.
export default async function StudentPage() {
  const sid = await getStudentSessionId();
  if (!sid) redirect('/student/login');

  const student = await getStudentById(sid);
  if (!student) redirect('/student/login');

  const onboarded = Boolean((student.studentState as Record<string, unknown> | undefined)?.onboardedAt);
  if (!onboarded) redirect('/student/welcome');
  redirect(`/report/${sid}?audience=student`);
}
```

- [ ] **Step 2: 사용법 다시보기 링크**

학생 리포트(student audience)에서 눈에 띄지 않는 자리에 작은 링크 추가. 먼저 리포트 진입 컴포넌트(`app/report/[id]/page.tsx` 또는 그 안의 학생용 헤더/메뉴/푸터 영역)를 읽어 적절한 위치를 찾고, 아래 형태의 정적 링크만 추가(상태/로직 변경 없음, `use-report-state` 미변경):

```tsx
{/* 학생 audience일 때만 */}
<a href="/student/welcome?replay=1" className="text-xs text-[#86868B] underline">사용법 다시보기</a>
```

> 링크는 `<a href>` 정적 이동으로 충분(클라이언트 라우팅 불필요). 학생 리포트가 아닌 학부모 화면엔 노출하지 말 것(기존 `audience`/`isStudentReport` 분기 안에 배치). 위치·스타일은 기존 컨벤션에 맞춤. 보라/인디고 금지.

- [ ] **Step 3: 타입 체크 + 빌드**

Run: `npx tsc --noEmit && npm run build`
Expected: 성공.

- [ ] **Step 4: 수동 검증 메모**

report에 "수동 확인 필요: 온보딩 안 한 학생 로그인→/student/welcome, 한 학생→리포트 직행. 리포트의 '사용법 다시보기'→replay" 남기고, 링크를 실제로 어느 파일/위치에 넣었는지 명시.

- [ ] **Step 5: 커밋**

```bash
git add app/student/page.tsx app/report/[id]/page.tsx
git commit -m "feat: 학생 진입 온보딩 분기 + 리포트 사용법 다시보기 링크"
```

---

## 최종 검증
- [ ] `npx tsx scripts/verify-onboarding.mts` → PASS
- [ ] `npx tsc --noEmit` 무에러
- [ ] `npm run build` 성공
- [ ] (운영 반영 전) 시각·실제 흐름 최종확인은 사용자 본인. **자동 PASS 선언 금지.**

## 자기 검토 메모(작성자)
- 스펙 커버리지: 단계구성/모의고사조건(T1)·플래그저장/API(T2)·환영라우트+캐러셀+replay(T3)·진입분기+다시보기링크(T4) 모두 매핑.
- 타입 일관: `WelcomeStepId`·`shouldShowMockStep`·`buildWelcomeStepIds`·`markStudentOnboarded`·`studentState.onboardedAt` 명칭 Task 간 일치.
- 마이그레이션 없음, 신규 env 없음.
