# 학습계획 탭 재구성 + 주간목표 완료 판정 개선 설계

날짜: 2026-07-03
대상: `components/report/execution-plan-tab.tsx`, `components/student/missions-hub.tsx`, `hooks/use-report-state.ts`

## 배경
- 학습계획(execution-plan) 탭은 요청/재조정이 위, 실제 계획(주간목표·주차)이 아래라 우선순위가 뒤집혀 있음.
- 주간목표(deadline, 요일무관)가 주차계획과 분리돼 "그 주에 뭘 해야 하는지"가 시간표에서 안 보임.
- "오늘 완료" 판정이 `todayRecommend`(남은량÷남은일) 기반이라 오늘 몫을 채워도 계속 양수라 완료가 안 뜸.
- 미션탭 "이번 주 집중 포인트" 카드가 amber/emerald 꽉찬 배경으로 앱 디자인에서 튐.

## 변경 사항

### A. 섹션 재배치 (execution-plan-tab)
위→아래 순서: 헤더 → **주간 목표 계획** → **주차별 계획** → 진도 재조정 요청 → 학습 관련 요청(변경 신청).
JSX 블록 순서만 이동, 로직 변경 없음.

### B. 주차별 "주간목표" 가로 배너
- `weeklyDailyPlans`의 각 주차에 `startDate`/`endDate` 노출 (현재 `rangeLabel` 문자열만) — `hooks/use-report-state.ts`.
- 각 주차 블록 상단(7일 그리드 위)에 그 주 날짜범위와 겹치는 deadline 목표를 풀폭 가로 배너로 표시.
  - 겹침: `goal.startDate <= week.endDate && goal.endDate >= week.startDate`.
  - 내용(읽기 전용 요약): 🎯 과목 · 자료 · 목표범위(rangeText) · 누적 X/Y{unit}. 여러 개면 행/칩 나열.
  - 상세 조작(오늘 완료·수정·진행바)은 위 "주간 목표 계획" 카드에 유지. 배너는 중복 조작 없음.
  - 겹치는 목표 없으면 배너 생략.
- 데이터는 기존 `deadlinePlanEntries` 재사용. 색은 `#0071E3` 유지(보라/인디고 금지).

### C. 라벨 통일: "오늘 기대/오늘까지" → "예상목표치"
- execution-plan 카드: "오늘까지 {expectedAmount}" → "예상목표치 {expectedAmount}".
- missions-hub 목표카드/집계요약: "오늘 기대 …" → "예상목표치 …".

### D. 완료 판정 = 누적 ≥ 예상목표치 × 90%
- `metToday = expectedAmount > 0 && actualAmount >= 0.9 * expectedAmount`.
- "오늘 완료" 퀵버튼: 누적을 **예상목표치(expectedAmount)까지 채움**(기존 actual+todayRecommend 폐기).
  - 이미 90% 이상이면 버튼 숨기고 "오늘 완료(초록)" 표시.
- 적용: execution-plan 카드 + missions-hub 목표 로우(오늘 계획 내) + missions-hub 기간목표 섹션.

### E. "이번 주 집중 포인트" 디자인 통일 (missions-hub)
- 추천 카드의 `bg-amber-50`/`bg-emerald-50` 꽉찬 배경 제거 → 흰 카드(다른 미션 섹션과 동일) + 아이콘/포인트 텍스트만 의미색(칭찬=emerald, 주의=amber).

## 검증
- `tsc --noEmit` 통과.
- 프리뷰 컴파일 에러 없음. (인증 필요 화면의 픽셀 검증은 사용자 로그인 브라우저 몫 — 프리뷰 하네스 세션 시크릿 격리 제약.)

## 비고
- 학부모용/모의고사 "결과지" 문구는 이 작업 범위 아님.
