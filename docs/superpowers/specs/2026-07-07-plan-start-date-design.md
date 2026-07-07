# 계획 시작일 선택 (Plan Start Date)

작성일: 2026-07-07

## 배경 / 문제

관리자가 학습 계획을 만들면 `generateDetailedPlans`가 항상 **오늘(`new Date()`)**을 기준점(anchor)으로 잡는다.
실무에서는 "오늘 계획을 세우지만 실제 시작은 다음날(또는 다음 주)"인 경우가 대부분이라, 학생이 시작 전 날짜부터
"뒤처짐"으로 표시되는 문제가 있다.

## 목표

계획을 (재)생성할 때 관리자가 **시작 날짜를 직접 고를 수 있게** 한다. 기본값은 **내일(KST)**.
날짜를 자유롭게 고르므로 "내일부터"뿐 아니라 "다음 주 월요일부터"도 가능하다.

## 비목표 (YAGNI)

- 학생 신청→승인, 재조정(realign), 상담 다음진도 등 다른 계획 생성 경로는 이번 범위에서 제외(기존 오늘-anchor 유지).
- 시작일을 자료에 영구 저장하지 않는다(아래 "상태" 참조).

## 설계

### 1) 라이브러리 — `lib/progress-plan.ts`

`generateDetailedPlans`에 **맨 뒤 optional 파라미터** 추가:

```ts
export function generateDetailedPlans(
  materialId, totalAmount, type, goalType, goalValue, currentAmount,
  customUnit, reviewPasses, studyDays, lectureSpeedMultiplier,
  estimatedMinutesPerUnit, studyTime, category,
  startDateStr?: string,   // ← 신규. YYYY-MM-DD. 미지정=오늘
)
```

동작:

- **미지정** → `anchor = 오늘`. 기존 동작을 **한 줄도 바꾸지 않는다**(첫 주 plan.startDate = 그 주 월요일).
  기존 호출부 15곳은 전부 미지정이므로 완전 하위호환.
- **지정(유효한 YYYY-MM-DD)** → `anchor = parseDate(startDateStr)`. 함수 내부에서 `today`로 기준점을
  잡던 곳(주 시작 계산 `startOfWeek`, 첫 주 일할 `firstWeekFromDate`, deadline `phaseStart`,
  `calculatedTargetDate` 폴백)을 전부 `anchor`로 치환.
- **지정일 때만**, daily/weekly 모드의 **첫 주 plan.startDate를 `anchor` 그대로** 쓴다(그 주 월요일로 스냅하지
  않음). endDate는 그대로 그 주 일요일. 일할(dailyAmount) 계산은 이미 `firstWeekFromDate=anchor` 기준이라 정합.
  deadline 모드는 이미 `phaseStart=anchor`라 자동으로 startDate=anchor.

**왜 첫 주 startDate를 anchor로 두는가 (핵심):**
`getExpectedFromPlans`는 `today < plan.startDate`면 0(직전 plan 종료치)을 돌려준다. 첫 주 startDate를
고른 날짜로 두면 시작일 전까지 기대치가 0 → **학생이 시작일 전 "뒤처짐"으로 표시되지 않는다**
(메모리 "당일등록 하루 뒤처짐" 버그 계열 방지). 월요일로 스냅하면 시작일 전 월~화가 경과 학습일로
집계돼 유령 기대치가 생긴다.

`anchor`는 호출자가 넘긴 Date를 파괴하지 않도록 자정 정규화한 복제본으로 만든다. 날짜 직렬화는 기존과 동일하게
모듈 상단 `seoulDateStr`(KST) 사용.

### 2) UI — `components/admin/student-detail-sheet.tsx`

**시작일 상태(영구 저장 안 함):** 컴포넌트 ephemeral 상태
`const [planStartDrafts, setPlanStartDrafts] = useState<Record<string, string>>({})`.
자료별(materialId) 시작일 초안. 미설정 시 표시 기본값 = **내일**(헬퍼 `defaultPlanStart()` = KST 내일 YYYY-MM-DD).

> 영구 저장하지 않는 이유: 시작일은 "지금 이 계획을 언제부터"라는 그 순간의 결정이다. 나중에 goalValue만 다시
> 손볼 때는 그 시점 기준으로 다시 잡는 게 맞다(과거 날짜로 재-anchor되면 유령 뒤처짐 재발). 그래서 창을 다시 열면
> 다시 내일로 초기화된다. 계획이 언제 시작하는지는 생성된 plan.startDate가 이미 보여준다.

**렌더 위치 (2곳):**
1. **자료 추가 폼**(newMaterial…): 목표 설정 옆에 "시작일" `date` 입력. 별도 상태 `newMaterialStartDate`
   (기본 내일). 저장 핸들러에서 최초 계획 생성 시 `startDateStr`로 전달.
2. **인라인 목표 편집**: 각 교재/인강의 목표 설정 영역에 "시작일" `date` 입력. 값은 `planStartDrafts[materialId]`
   (미설정 시 내일). 변경 시 계획 재생성.

**재생성 배선:**
- `updateBookGoalField` / `updateLectureGoalField`가 `generateDetailedPlansLib` 호출 시
  `planStartDrafts[materialId] ?? defaultPlanStart()`를 새 `startDateStr` 인자로 넘긴다.
- 시작일 입력 변경도 재생성을 트리거해야 하므로, 재생성 조건 화이트리스트(`field === 'goalType' || 'goalValue' …`)에
  준하는 전용 경로를 둔다: 날짜 변경 시 `setPlanStartDrafts` 후 해당 자료의 계획을 현재 goalType/goalValue로
  다시 생성(goalType·goalValue가 유효할 때만; selfPaced/미설정이면 아무 것도 안 함).

날짜 입력은 iOS26 Glass 규칙을 따르는 기존 입력 프리미티브/유틸을 재사용(색=역할, 보라/인디고 금지).

### 3) 테스트 — `scripts/test-progress-plan.mts`

기존 케이스(미지정 호출)는 그대로 통과해야 한다(회귀 가드). 추가:

- **weekly, startDate=내일(주중)**: 첫 plan.startDate === 내일, 그 전 날짜에 계획 없음, 일할이 남은 요일 기준.
- **weekly, startDate=다음 주 월요일**: 첫 plan.startDate === 다음 주 월요일.
- **deadlineWeeks, startDate=내일**: 첫 창 startDate === 내일, 이후 창이 이어붙음.
- **미지정 vs 오늘 명시**가 실질 동일 결과인지(단, 명시 시 첫 주 startDate=오늘로 달라질 수 있음 — 이 차이를 명시).

`today`/`Math.random` 등 비결정성은 결과에 날짜가 들어가므로, 테스트는 상대 오프셋(오늘+1 등)을 계산해 비교한다.

## 리스크 / 구현 중 검증

- **첫 주 월요일 아님:** 지정 시 첫 주가 수요일 시작이 될 수 있다. 주차 완료 입력/시간표 탭(`timetable-tab`,
  완료 입력)이 월요일 경계를 가정하는지 확인. 문제 없으면 진행, 있으면 그 지점만 보정.
- **재생성 트리거 누락:** 날짜만 바꾸고 목표를 안 바꾸면 재생성이 안 되는 실수 방지 — 날짜 onChange에서 명시적으로
  재생성.
- 최종 동작 검증은 dev 서버(ssc-spartaa, 포트 3000, 실 Supabase)로 브라우저 확인 후 사용자 본인 확인.

## 파일 변경 요약

- `lib/progress-plan.ts` — `generateDetailedPlans`에 `startDateStr` 파라미터 + anchor 치환 + 첫 주 startDate 처리.
- `components/admin/student-detail-sheet.tsx` — `planStartDrafts`/`newMaterialStartDate` 상태, 날짜 입력 UI 2곳,
  래퍼·핸들러 배선.
- `scripts/test-progress-plan.mts` — 시작일 케이스 추가.
- 마이그레이션: **불필요**(계획은 subjects JSON 단일 컬럼, 시작일은 영구 저장 안 함).
