# 주간/월간 목표 버킷 구현 계획

> **For agentic workers:** 각 Task는 독립적으로 테스트 가능한 산출물로 끝난다. 순서대로 진행하고 Task마다 커밋한다.

**Goal:** 목표 유형에 따라 미션을 "매일 시간표"(weeks/dailyAmount)와 "기간 버킷"(weeklyAmount/monthlyAmount)으로 분리하고, 버킷에 학습일 기준 페이스를 시각화한다.

**Architecture:** `DetailedPlan.periodType`로 버킷 여부를 표시. 생성기(`generateDetailedPlans`)가 주간/월간 버킷 plan을 태깅. 미션 파생 2곳(서버 `missions-hub`, 클라 `weeklyDailyPlans`)이 버킷을 daily와 분리해 반환. 버킷은 studyDays 게이트 없이 현재 기간만 표시하고 누적량 입력으로 진행.

**Tech Stack:** Next.js(App Router), TypeScript, Supabase(subjects JSONB 단일소스), 로컬 폴백.

## Global Constraints
- 마이그레이션 없음 — 신규 필드는 `subjects` JSONB 내부.
- iOS26 Liquid Glass: 색=의미, 보라/인디고 금지, `.glass` 재사용, 한글 word-break 세로깨짐 주의.
- 진도 단일소스 = `subjects`. 저장은 기존 `patchStudentProgress` 경로.
- 하위호환: `periodType` 없는 plan = 기존 daily 동작.

---

### Task 1: 타입 확장 (periodType, monthlyAmount)

**Files:**
- Modify: `lib/types/student.ts` (DetailedPlan, BookProgress.goalType, LectureProgress.goalType, ProposedGoal.goalType)

**Produces:** `DetailedPlan.periodType?: 'week' | 'month'`; goalType union에 `'monthlyAmount'`.

- [ ] `DetailedPlan`에 `periodType?: 'week' | 'month';` 추가(주석: 버킷 모드, undefined=매일 시간표).
- [ ] `BookProgress.goalType`, `LectureProgress.goalType`, `ProposedGoal.goalType` 유니온에 `'monthlyAmount'` 추가.
- [ ] `npx tsc --noEmit` 통과 확인(타입만).
- [ ] 커밋: `feat(types): DetailedPlan.periodType + monthlyAmount goalType`

---

### Task 2: 생성기 — 월간 분기 + 주간 태깅 + 페이스 유틸

**Files:**
- Modify: `lib/progress-plan.ts`

**Interfaces / Produces:**
- `generateDetailedPlans(...)`: `weeklyAmount` → 생성 plan에 `periodType='week'`; 신규 `monthlyAmount` 분기 → `periodType='month'`.
- `export function getBucketPace(plan: DetailedPlan, today: Date, studyDays?: string[]): { totalStudyDays: number; elapsedStudyDays: number; expectedRatio: number; expectedAmount: number; behind: boolean }`

- [ ] `appendPlansByWeeklyAmount`가 push하는 plan 객체에 `periodType` 인자를 받아 세팅하도록 확장(기본 undefined). 주간 청킹 호출 시 `'week'` 전달.
- [ ] `goalType === 'monthlyAmount'` 분기 추가: 달력 월 단위 plan 생성. 각 월 plan: `startDate`=해당 월 1일(첫 plan은 오늘 속한 월 1일), `endDate`=말일, `targetAmount`=min(남은량, round(goalValue)), `rangeText`=`${pass}회독 ${from}~${to}${unit}`, `dailyAmount`=ceil(targetAmount / 월내 학습일수 근사), `periodType='month'`, `weekNumber`=순번. 남은량 소진까지 다음 달 반복.
- [ ] 회독(reviewPasses)도 월간이면 월 단위로 이어붙임(간단히: 각 회독을 별도 월 chunk로).
- [ ] `getBucketPace` 구현: `countStudyDaysInRange(start,end,studyDays)`로 총 학습일, `countStudyDaysInRange(start, min(today,end), studyDays)`로 경과 학습일, `expectedRatio=elapsed/total`, `expectedAmount=round(targetAmount*ratio)`, `behind = (plan.actualAmount||0) < expectedAmount`.
- [ ] 표준 node 포트로 monthlyAmount 출력 + 페이스 스냅샷 검증(scratchpad `.mjs`): 월 buckets 개수·날짜창·periodType, 학습일 기준 기대치.
- [ ] `npx tsc --noEmit` 통과.
- [ ] 커밋: `feat(plan): monthlyAmount 월간 버킷 생성 + periodType 태깅 + getBucketPace`

---

### Task 3: 미션 파생 분리 (버킷 vs daily)

**Files:**
- Modify: `app/api/student/missions-hub/route.ts`
- Modify: `hooks/use-report-state.ts` (`weeklyDailyPlans` 및 요약치)

**Interfaces / Produces:**
- missions-hub 응답에 `bucketGoals: BucketGoal[]` 추가. daily는 `todayPlanEntries`(기존, periodType 없는 plan만).
- `BucketGoal = { id, subject, title, type:'강의'|'교재', materialType, materialId, planId, periodType:'week'|'month', targetAmount, actualAmount, isCompleted, expectedAmount, expectedRatio, actualRatio, behind, rangeText, dateKey }`

- [ ] missions-hub: 각 lecture/book의 detailedPlans를 `periodType` 유무로 분리.
  - daily: `!plan.periodType && isPlanActiveOnDate(plan, todayKey)` + 기존 studyDays 게이트.
  - bucket: `plan.periodType && isPlanActiveOnDate(plan, todayKey)`, studyDays 게이트 **미적용**, `getBucketPace`로 페이스 산출.
- [ ] `bucketGoals` 배열 응답 추가.
- [ ] `weeklyDailyPlans`(클라)도 동일 분리: daily entries는 `!plan.periodType`만. 별도 `bucketGoals` 파생값 export(오늘 활성 기간, subjects studyDays 사용). 홈/미션 요약(`todayPlanEntries`, 미션 총계)은 daily만 카운트.
- [ ] `npx tsc --noEmit` 통과.
- [ ] 커밋: `feat(missions): 버킷 목표를 daily 미션과 분리 파생(+페이스)`

---

### Task 4: 버킷 진행 입력 (완료 경로)

**Files:**
- Modify: `hooks/use-report-state.ts` (`updatePlanCompletion` 확장 또는 `updateBucketProgress` 신설)

**Interfaces / Produces:**
- `updateBucketProgress(materialType, materialId, planId, amount)` — plan.actualAmount=clamp(0,amount,targetAmount 이상 허용은 targetAmount로 캡 X: 초과 허용하되 완료판정만), isCompleted = amount≥targetAmount. 자료 current = clamp(parsePlanBounds.start-1 + amount). 루트+subjects 동기화(기존 updatePlanCompletion 패턴 재사용). 서버 저장은 기존 progress PATCH.

- [ ] `updatePlanCompletion` 내부 로직을 참고해 버킷 전용 갱신 함수 추가(플랜 `actualAmount`/`isCompleted` 및 자료 current 동기화). 루트 books/lectures + subjects[] 모두 갱신.
- [ ] 서버 저장: 기존 진도 저장 트리거(디바운스/명시 저장) 재사용 — 별도 API 불필요하면 기존 경로 사용.
- [ ] 반환 객체에 `updateBucketProgress` 포함.
- [ ] `npx tsc --noEmit` 통과.
- [ ] 커밋: `feat(progress): 버킷 누적 진행 입력 반영`

---

### Task 5: 학생 UI — 버킷 섹션

**Files:**
- Modify: `components/student/missions-hub.tsx`
- Modify: `app/report/[id]/page.tsx` (bucketGoals prop 배선)
- Modify: `components/report/home-overview-tab.tsx` (간략 버킷 표시)

- [ ] MissionsHub: 서버 `bucketGoals` fetch 반영. "이번 주 · 이번 달 목표" 섹션 렌더: 카드마다 라벨(주간/월간), 진행바(actualRatio) + 기준 마커(expectedRatio), 문구 "지금이면 약 {expected%}({expectedAmount}) · 현재 {actual%}({actualAmount})", 누적량 입력(number stepper) → `updateBucketProgress`, 완료 배지. behind면 amber/red, 아니면 emerald.
- [ ] 홈 카드: 버킷이 있으면 daily 미션 아래 "이번 주/이번 달 목표 N건(진행 X%)" 요약 + 페이스 뒤처짐 경고 한 줄.
- [ ] iOS26 Glass 규칙 준수. 한글 라벨 `break-keep`.
- [ ] `npx tsc --noEmit` + 데브서버 렌더 확인(콘솔 에러 0).
- [ ] 커밋: `feat(student-ui): 주간/월간 목표 버킷 섹션 + 페이스`

---

### Task 6: 관리자/요청 폼 월간 옵션

**Files:**
- Modify: `components/admin/student-detail-sheet.tsx` (설정 방식 드롭다운, estimatedDailyAmount 월간 분기)
- Modify: `components/report/execution-plan-tab.tsx` (goalType select)
- Verify: `app/api/admin/students/[id]/requests/route.ts` (goalType 전달 — 이미 generic)

- [ ] student-detail-sheet 설정 방식 select에 `<option value="monthlyAmount">월간 분량 지정</option>` 추가. 목표 수치 단위 라벨/미리보기 팝업의 `estimatedDailyAmount`에 `monthlyAmount` 분기(= goalValue / 월 학습일 근사) 추가.
- [ ] execution-plan-tab goalType select에 "월간 분량" 옵션 추가. 단위 라벨 처리.
- [ ] 승인 경로가 monthlyAmount를 그대로 generateDetailedPlans에 넘기는지 확인(변경 없으면 통과).
- [ ] `npx tsc --noEmit` 통과.
- [ ] 커밋: `feat(admin): 월간 분량 지정 옵션(관리자/요청 폼)`

---

### Task 7: 데브서버 왕복 검증 (5 예시)

- [ ] 데브서버 기동(preview_start), 관리자 로그인.
- [ ] 학생 1명에 자료 5종 세팅: (1) weeks, (2) dailyAmount, (3) weeklyAmount, (4) monthlyAmount, (5) weeklyAmount+monthlyAmount 혼합. 학습요일은 월/수/금 등 비매일로.
- [ ] 학생 화면: daily(1,2)는 학습요일에만 하루치, 버킷(3,4,5)은 요일 무관 표시 + 페이스 마커 확인. 오늘이 비학습일이어도 버킷 노출 확인.
- [ ] 학생이 버킷 누적량 입력 → 진행바/완료 갱신, 페이스 색 변화 확인.
- [ ] 관리자 화면에서 그 학생 진도/plan에 반영 확인(왕복).
- [ ] 콘솔/네트워크 에러 0, 각 입장 문제없음 → main 병합·푸시.
