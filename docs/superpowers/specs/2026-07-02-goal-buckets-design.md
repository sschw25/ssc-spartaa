# 주간/월간 목표 버킷 + 페이스 시각화 — 설계

작성일: 2026-07-02
브랜치: `feat/goal-buckets`

## 배경 / 문제

학생 "오늘 미션"은 `student.subjects[].detailedPlans`에서 실시간 파생되며, 미션 화면은
학습계획 표에는 없는 두 게이트를 건다:
- (A) 과목 `studyDays` — 오늘이 학습요일이 아니면 제외
- (B) 날짜창 — `startDate ≤ today ≤ endDate`인 세부계획만

이 때문에 "주당 분량"으로 목표를 잡아도 매일 하루치(예: 하루 2강)로 쪼개져 학습요일에만 뜬다.
그러나 주당/월간 목표의 본질은 **"기간 내에 그 분량을 끝내면 됨"**이지, 특정 요일에 강제 배정하는 게
아니다. 매일 공부하지 않는 학생 현실과도 맞지 않는다.

## 목표

목표 유형에 따라 미션 표현을 두 모드로 분리한다.

| 목표 유형 | 모드 | 미션 표현 |
|---|---|---|
| `weeks` (주수) | 매일 시간표 | 학습요일마다 하루치 (기존 동작 유지) |
| `dailyAmount` (일일 학습량) | 매일 시간표 | 학습요일마다 하루치 (기존 동작 유지) |
| `weeklyAmount` (주당 분량) | **주간 버킷** | 이번 주 내 목표량, 한 만큼 입력 |
| `monthlyAmount` (월간 분량, 신규) | **월간 버킷** | 이번 달(달력 월) 내 목표량, 한 만큼 입력 |

## 동작 정의

### 버킷 모드 (주간·월간 공통)
- 기간 = 주간 버킷은 주(월~일), 월간 버킷은 **달력 월(1일~말일)**.
- 학생이 **누적 진행량을 직접 입력**한다(예: 이번 주 6강 중 3강 완료).
- 해당 기간 내내 미션에 표시되고, `누적 ≥ 목표량`이면 그 기간 완료로 처리.
- **요일 게이트 없음, 하루 할당 없음** — 주/월 내 아무 때나 채우면 됨.
- **일일 쿠폰 판정과 분리** — 버킷 미달이어도 그날의 "매일 시간표" 미션/쿠폰을 막지 않는다.
  일일 완료 판정은 daily-timetable 항목만으로 한다.
- 월간 목표 달성 시 별도 보상은 이번 범위에 **미포함**.

### 페이스 기준선 (학습일 기준)
- 기대 진행률 = (기간 내 **경과 학습일** ÷ 기간 **총 학습일**) × 100
  - 경과 학습일: 기간 시작일 ~ 오늘(포함) 사이의 학습요일 수
  - 총 학습일: 기간 전체(시작~끝)의 학습요일 수
  - 학습요일은 과목 `studyDays`(미설정 시 기본 월~토)
- 기대 목표량 = round(목표량 × 기대 진행률)
- UI: 진행바 + 기준 마커 + 문구
  "지금이면 약 {기대%}({기대량}) 했어야 해요 · 현재 {실제%}({실제량})"
- 뒤처짐(실제 < 기대)이면 경고색(amber/red 계열), 도달/앞섬이면 안심색(emerald 계열).
  색=의미 규칙(iOS26 Liquid Glass) 준수, 보라/인디고 금지.

## 데이터 모델

### `DetailedPlan` 확장 (`lib/types/student.ts`)
- `periodType?: 'week' | 'month'` 추가.
  - `undefined` = 매일 시간표(daily). 기존 데이터 하위호환.
  - `'week'` = 주간 버킷, `'month'` = 월간 버킷.
- 누적 진행은 기존 `actualAmount`(units 완료) + `isCompleted`(≥목표) 재사용.
  per-date `dailyCompletions`는 버킷에서 사용하지 않는다.

### `goalType` enum
- `'weeks' | 'weeklyAmount' | 'dailyAmount' | 'monthlyAmount'` — `monthlyAmount` 추가.
  (`BookProgress.goalType`, `LectureProgress.goalType`, `ProposedGoal.goalType`,
   관련 UI select, `generateDetailedPlans` 시그니처)

## 계획 생성 (`lib/progress-plan.ts`)

`generateDetailedPlans`에 모드별 분기 추가:
- `weeklyAmount`: 기존 주간 청킹 유지하되, 생성되는 각 plan에 `periodType='week'` 세팅.
- `monthlyAmount` (신규): **달력 월** 단위로 plan 생성. 각 plan은
  `startDate` = 해당 월 1일(단, 첫 plan은 오늘이 속한 월의 1일), `endDate` = 해당 월 말일,
  `targetAmount` = min(남은 분량, goalValue), `rangeText`는 "N회독 a~b" 형식,
  `dailyAmount`는 참고용(월 학습일로 나눈 근사), `periodType='month'`.
  남은 분량 소진까지 다음 달로 반복. 회독(reviewPasses)도 동일 규칙으로 이어붙임.
- `weeks`, `dailyAmount`: 변화 없음(`periodType` undefined).

### 페이스 유틸 (신규, `lib/progress-plan.ts` 또는 `lib/student-activity.ts`)
```
getBucketPace(plan, today, studyDays): {
  totalStudyDays, elapsedStudyDays, expectedRatio, expectedAmount,
  actualAmount, actualRatio, behind: boolean
}
```
`countStudyDaysInRange`(기존) 재사용.

## 미션 파생 (분리)

두 파생 지점을 동일 규칙으로 수정한다.
- `app/api/student/missions-hub/route.ts` (서버, MissionsHub 탭)
- `hooks/use-report-state.ts` `weeklyDailyPlans` (클라, 홈 "오늘 미션" 카드)

변경:
- 각 자료의 `detailedPlans`를 `periodType` 유무로 분리.
  - `periodType` 없음 → 기존 daily 항목(studyDays 게이트 + 날짜창 + per-date 완료).
  - `periodType` 있음 → **버킷 항목**: 현재 기간 활성(startDate≤today≤endDate)인 것만,
    studyDays 게이트 **미적용**, 자료당 현재 기간 1건, 진행(`actualAmount/targetAmount`) + 페이스 포함.
- 응답/반환에 `bucketGoals`(주간+월간) 목록을 daily 목록과 **별도**로 제공.
- 일일 완료/쿠폰 판정 로직은 daily 목록만 본다(버킷 제외).

## 진행 입력 (완료 경로)

- 기존 `updatePlanCompletion`(클라, `hooks/use-report-state.ts`) + 서버 저장 경로를 버킷용으로 확장.
  - 버킷 항목은 "체크"가 아니라 **누적량 입력**(number). 입력 시 해당 plan의 `actualAmount` 설정,
    `isCompleted = actualAmount ≥ targetAmount`.
  - 자료 진행(currentPage/completedLectures)도 best-effort 동기화:
    `parsePlanBounds(plan).start - 1 + actualAmount`로 세팅(범위 밖이면 클램프).
- 서버 저장은 기존 진도 PATCH 경로(`patchStudentProgress`, subjects 단일소스) 재사용.

## UI

### 학생 (미션 허브 + 홈 카드)
- 기존 "오늘 미션"(daily) 위/아래에 **"이번 주 · 이번 달 목표"** 섹션 추가.
- 각 버킷 카드: 과목·자료명, 진행바(실제) + 기준 마커(기대), 문구, 누적량 입력 스텝퍼/인풋,
  완료 시 배지. 주간/월간 라벨 구분.
- iOS26 Glass 규칙 준수(.glass 유틸 재사용, 색=의미, word-break 한글깨짐 주의).

### 관리자 (`components/admin/student-detail-sheet.tsx`)
- "설정 방식" 드롭다운에 **"월간 분량 지정"** 추가. 기존 "주당 분량 지정"과 병렬.
- 목표 수치 단위 라벨(주/월/일) 및 미리보기 추정치(`estimatedDailyAmount`)에 월간 분기 반영
  (월간: goalValue / 월 학습일 근사).

### 학생 요청 폼 (`components/report/execution-plan-tab.tsx`)
- goalType select에 "월간 분량" 옵션 추가.

## 손대는 파일 요약
- `lib/types/student.ts` — `periodType`, `monthlyAmount`
- `lib/progress-plan.ts` — 월간 생성 분기, 주간 `periodType` 태깅, 페이스 유틸
- `app/api/student/missions-hub/route.ts` — 버킷 분리 + 페이스
- `hooks/use-report-state.ts` — `weeklyDailyPlans` 버킷 분리, `updatePlanCompletion` 버킷 확장
- `components/student/missions-hub.tsx` — 버킷 섹션 UI
- `components/report/home-overview-tab.tsx` — 홈 버킷 표시(간략)
- `components/admin/student-detail-sheet.tsx` — 월간 옵션/미리보기
- `components/report/execution-plan-tab.tsx` — 요청 폼 월간 옵션
- 승인 경로 `app/api/admin/students/[id]/requests/route.ts` — monthlyAmount 전달 확인

## 마이그레이션
- 신규 컬럼 없음. `periodType`/`monthlyAmount`는 `subjects` JSONB 내부에 저장 — **마이그레이션 불필요**.

## 하위호환
- 기존 `periodType` 없는 plan은 daily로 동작(변화 없음).
- 기존 `weeklyAmount` 자료: 재생성 전까지는 plan에 `periodType`가 없어 daily로 보임.
  관리자/학생이 계획을 재생성(승인)하면 버킷으로 전환된다. (일괄 마이그레이션은 범위 밖)

## 검증 계획
- 데브서버(로컬 폴백)에서 학생/관리자 왕복.
- 예시 5종: (1) 주수, (2) 일일 학습량, (3) 주당 분량, (4) 월간 분량, (5) 주당+월간 혼합.
- 관리자로 계획 생성 → 학생 화면에서 daily는 요일별 표시, 버킷은 진행 입력·페이스 확인 →
  학생이 진행 입력 → 관리자 화면 반영 확인. 각 입장 문제없으면 main 병합·푸시.
