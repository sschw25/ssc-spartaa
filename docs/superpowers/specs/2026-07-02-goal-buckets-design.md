# 기간 목표(1~12주) + 분 정규화 페이스 — 설계 (v2, 페르소나 반영)

작성일: 2026-07-02
브랜치: `feat/goal-buckets`
개정: 10 페르소나(관리자5/학생5) 스트레스 테스트 결과 반영. 초기 "주간/월간 버킷 + 단순 합계 판정"에서
"기간 목표 창 + 분 정규화 집계 + 자료별 마감 위험 경보"로 재설계.

## 배경 / 문제

학생 "오늘 미션"은 `subjects[].detailedPlans`에서 파생되며, 미션 화면은 (A) 과목 studyDays,
(B) 날짜창 게이트를 건다. 그래서 "주당/기간 목표"를 잡아도 매일 하루치로 쪼개져 특정 요일에만 뜬다.
그러나 기간 목표의 본질은 "기간 내에 끝내면 됨"이다. 학생이 특정 과목을 몰아서 할 수 있어야 한다.

## 두 모드

| 모드 | 조건 | 미션 표현 |
|---|---|---|
| **A. 반복 시간표** | 요일이 정해져 매주 반복 | 기존 유지 — 그 학습요일에 하루치 |
| **B. 기간 목표** | 1~12주 기간 안에 완료 | 기간 목표 창 + 분 정규화 집계 달성 + 자료별 위험 경보 |

모드는 자료(교재/인강)별 목표 설정에서 결정된다. `goalType`:
- `weeks`, `dailyAmount` → 모드 A(반복 시간표, 기존).
- `weeklyAmount` → 모드 B, 기간 = 1주.
- `deadlineWeeks` (신규) → 모드 B, 기간 = N주(1~12).

(주간/월간을 따로 두지 않고 "N주 기간"으로 일반화. 주간=1주, 월간≈4주.)

## 모드 B 판정·표시 (페르소나 반영)

### 데이터 모델
- `DetailedPlan.periodType?: 'deadline'` — 기간 목표 창 plan 표시(undefined=기존 daily).
- 기간 목표 자료는 **자료당 plan 1개**가 전체 기간을 덮는다:
  `startDate` = 이번 주 시작(또는 오늘), `endDate` = start + N주 - 1일, `targetAmount` = 기간 내 완료 분량,
  `actualAmount` = 누적 진행량, `periodType='deadline'`.

### 1) 일일 달성 = 분(min) 정규화 집계
- 자료마다 단위(강/페이지/문제)가 달라 개수 합산은 무의미 → **분으로 환산해 합산.**
- 자료별 환산: 기존 `getEstimatedStudyTimeMin(unit, amount, type, estimatedMinutesPerUnit)`
  (인강은 배속 반영). "1강=estimatedMinutesPerUnit(기본 60)/배속" 등.
- 오늘까지 누적 기대 분 = Σ(자료별 targetAmount 분) × (경과 학습일 ÷ 총 학습일)
- 실제 진행 분 = Σ(자료별 actualAmount 분)
- **오늘 미션 달성 = 실제 진행 분 ≥ 오늘까지 누적 기대 분.** 몰빵/순서 자유(사용자 의도 유지).

### 2) 오늘 권장 (구체)
- 자료별 "오늘 권장 진행" = ceil(남은량 ÷ 남은 학습일). 미션에 "오늘 권장: {자료} {범위}"로 표시.
- 집계 달성이므로 강제는 아니지만, 초보/상위권이 항상 "오늘 뭘"을 알 수 있게 한다.

### 3) 자료별 마감 위험 경보 (편식 방지, 하루 차단 아님)
- 자료별 "남은 기간 완료 필요 페이스" = 남은량 ÷ 남은 학습일(분 환산).
- 이 필요 페이스가 그 자료의 하루 가용 한도 대비 과도하거나, 자료 진행률이 기대 대비 임계(예: 기대의 60%) 미만이면 **위험 배지**.
- 하루 미션을 막지 않고 조기 경보만. 관리자 대시보드 bottleneck(최저 진행 자료) 표기.

### 4) 선행/뒤처짐 분리 (복귀자·상위권)
- "오늘 목표"(오늘 하루 공정분, 분) vs "누적 격차"(밀린 총 분) 분리 표시.
- 실제 ≥ 오늘 기대면 "오늘치 완료 · 약 N일치 앞섬" 배지(앞선 분 ÷ 하루 평균 분).
- 뒤처지면 "현재 X%(기대 Y%)" + 격차 progress bar. 매일 "미달"만 반복되지 않게 오늘 목표 자체는 도달 가능하게.

### 5) 페이스 기준
- 학습일 기준(과목 studyDays, 미설정 시 월~토). (출석일 기준 리베이스는 v1 제외.)

### 6) 일일 쿠폰
- 모드 B(기간 목표) 자료는 위 집계 달성으로 "오늘 미션 달성" 판정에 참여. 모드 A와 함께 오늘 전체 달성 계산.
  (기존 daily 항목 + 기간목표 집계가 모두 충족일 때 쿠폰.)

## 계획 생성 (`lib/progress-plan.ts`)
- `deadlineWeeks` 분기: 자료당 단일 plan(전체 기간 창), `periodType='deadline'`, targetAmount=완료분량.
- `weeklyAmount`: 기존 주간 청킹 대신 기간=1주짜리 deadline plan으로 통일(또는 기존 유지 + periodType 태깅).
  → 구현 단순화를 위해 `weeklyAmount`도 deadline 창(1주)으로 취급.
- 신규 유틸:
  - `getPlanUnitMinutes(material)` → 자료 1단위 분(배속 반영) — `getEstimatedStudyTimeMin` 래핑.
  - `getDeadlinePace(plan, material, today, studyDays)` → { expectedRatio, expectedAmount, actualAmount,
    behind, todayRecommend, aheadDays } (분 환산 포함).

## 미션 파생 (`missions-hub` + `weeklyDailyPlans`)
- daily 항목: `!periodType`만(기존).
- 기간목표(`periodType==='deadline'` 현재 활성) 자료들을 모아 **분 정규화 집계** 계산:
  응답에 `deadlineGoals: DeadlineGoal[]` + `deadlineSummary`(오늘 기대분/실제분/달성/앞선일수) 추가.
- 일일 완료/쿠폰 판정 = daily 항목 전부 완료 AND `deadlineSummary.metToday`(있을 때).

## 진행 입력
- 기간목표 자료는 누적 진행량 입력(number) → plan.actualAmount, 자료 current 동기화(best-effort),
  isCompleted=actualAmount≥targetAmount. 기존 progress 저장 경로 재사용.

## UI
### 학생
- "오늘 미션"(daily) + **"기간 목표"** 섹션: 상단에 집계 요약(오늘 기대분 vs 실제분, 달성/앞선일수 배지),
  아래 자료별 카드(진행바+기대 마커, "오늘 권장 ~", 누적 입력, 마감 위험 배지). 색=의미(iOS26).
- 홈 카드: 기간목표 있으면 요약 한 줄 + 위험 자료 경고.

### 관리자
- `student-detail-sheet` 설정 방식에 **"기간 목표(주 선택)"** 추가 + 주수(1~12) 입력. 미리보기: "이 속도면 하루 약 N분".
- 대시보드/진도 탭에 자료별 진행 + bottleneck 표기(가능 범위).
- 요청 폼(`execution-plan-tab`)에 기간목표 옵션.

## 손대는 파일
- `lib/types/student.ts` — `periodType`, goalType에 `deadlineWeeks`(+`weeklyAmount` 유지)
- `lib/progress-plan.ts` — deadline 생성, 분 환산·페이스 유틸
- `app/api/student/missions-hub/route.ts` — deadlineGoals/summary
- `hooks/use-report-state.ts` — weeklyDailyPlans 분리, 진행 입력, 요약 파생
- `components/student/missions-hub.tsx`, `components/report/home-overview-tab.tsx`, `app/report/[id]/page.tsx`
- `components/admin/student-detail-sheet.tsx`, `components/report/execution-plan-tab.tsx`
- 승인 경로 `app/api/admin/students/[id]/requests/route.ts` — deadlineWeeks 전달

## 마이그레이션
없음 — 신규 필드는 `subjects` JSONB 내부.

## 하위호환
- `periodType` 없는 기존 plan = daily 유지. 재생성 전까지 기존 동작.

## 검증
- 데브서버(로컬 폴백) 학생/관리자 왕복, 예시 5종:
  (1) weeks(반복), (2) dailyAmount(반복), (3) deadlineWeeks 2주 단일자료,
  (4) deadlineWeeks 4주 다자료(편식 시 위험 경보 확인), (5) 반복+기간 혼합.
- 확인: 모드A는 요일별, 모드B는 요일 무관·집계 달성·오늘 권장·위험 경보·앞선일수. 진행 입력 왕복 반영.
- 각 입장 문제없고 콘솔/네트워크 에러 0이면 main 병합·푸시. 아니면 브랜치 유지 + 보고.
