# 진도 정체 로직 개선 — 설계 문서

- 날짜: 2026-07-04
- 상태: 승인됨(설계) → 구현 계획 대기

## 배경 / 문제

학생이 **반차/휴식 등 승인된 휴가**를 쓰고 하원한 날, 그 과목에 진도를 입력하지 않으면
현재 로직이 그날치 기대 진도를 그대로 쌓아 **"진도 정체(behind)"로 오판**한다.
정당한 사유(휴가)로 못 한 날까지 정체로 뜨니 실제와 안 맞는다.

관련 코드: `lib/progress-plan.ts`의 `buildItem` → `status: 'ahead'|'on-track'|'behind'|'no-plan'`.
`behind`는 `current + 1 < expectedToday`이고, `expectedToday`는 **경과 학습일(월~토 기본) × 일일량**으로
계산되는데 **휴가일을 빼지 않는다**. 이 status는 학생 리포트·관리자 대시보드(진도 지연)·
상담 화면(진도 정체)에서 **공용**으로 쓰인다.

또한 자료(`BookProgress`/`LectureProgress`)에는 `updatedAt`(마지막 수정 시각)만 있고
**날짜별 진도 입력 이력이 없어**, "언제 진도를 넣었는지" 시각화가 불가능하다.

## 목표 (3가지)

1. **휴가일 정체 면제** — 승인된 결석성 휴가를 쓴 날은 진도 미입력이어도 정체(behind)로 뜨지 않는다.
2. **보강 안내** — 다음날부터 주말(토)까지, 전날 휴가로 못 한 만큼 이번 주에 보강해야 할 양을 알려준다.
3. **과목별 입력 히트맵** — 강의/교재별로 진도를 입력한 날은 파랑, 안 한 날은 공란인
   가로 히트맵(클로드코드 사용량 시각화 스타일)을 학생 화면에 보여준다.

## 승인된 결정 사항

- **히트맵 데이터**: 과거 소급 불가(이력 없음). **지금부터 입력 로그를 축적**한다(정확 우선).
- **면제 범위**: 승인된 **모든 결석성 휴가**(반차 morning/afternoon/night·personal_halfday,
  휴식권 fullday, 병가 sick, 개인휴가 personal_fullday).
- **반차 처리**: 반일이어도 **그날 전부 면제**(하원했으니 그날치는 통째로 보강으로 이월).
- **보강 표시**: 면제된 만큼을 **남은 학습일(오늘~토)에 분배**해 자료별 `보강 +N` 배지 +
  '오늘 권장'에 반영. **정체 판정과는 분리된 어드바이저리**(안 해도 정체로 안 나무람, 주말 지나면 소멸).

## 설계

### 데이터 모델 (마이그레이션 없음)

- `BookProgress`/`LectureProgress`에 `inputLog?: string[]` 추가.
  - 값: 진도를 입력한 날짜(KST `YYYY-MM-DD`) 배열, 중복 제거, **최근 ~120일만 유지(캡)**.
  - 저장 위치: 기존 `subjects` JSONB 안 — **새 컬럼/마이그레이션 불필요**.
- 휴가는 기존 `student.leaveRequests`(`{ type, date, status }`) 재사용.

### 로직 (lib/progress-plan.ts)

- **휴가 날짜 집합 유도**: `getLeaveDates(student): Set<string>` — `leaveRequests` 중
  `status === 'approved'`(자동승인 포함)인 결석성 타입의 `date`를 KST 기준으로 모은다.
- **경과 학습일에서 제외**: `countStudyDaysInRange(start, end, studyDays, leaveDates?)`에
  `leaveDates` 파라미터 추가 — 범위 내 날짜가 `leaveDates`에 있으면 학습일로 세지 않는다.
  `buildItem` → `getExpectedFromPlans` → `getExpectedWithinCurrentPlan` 경로로 전달.
  - 효과: 휴가일은 `expectedToday`를 늘리지 않아 `behind`로 오판되지 않는다.
  - 기존 시그니처에 optional 파라미터만 추가 → 기존 호출부 하위호환.
- **보강량 헬퍼**: `getMakeupAmount(material, today, studyDays, leaveDates)` (일일 plan 전용,
  `periodType` deadline 제외).
  - 현재 활성 일일 plan 창(today ∈ [startDate,endDate])에서 **오늘 이전의 휴가 학습일 수 × 일일량**을
    이월분으로 잡고, **남은 학습일(오늘~min(endDate,토))에 분배**.
  - 반환: `{ makeupTotal: number, perDay: number }`. 남은 학습일 0이면 makeup 0.

### UI

- **과목별 진도 탭**(`components/report/subject-progress-tab.tsx`): 자료별로
  - `보강 +N` 배지(makeupTotal>0일 때) + '오늘 권장'에 perDay 반영.
  - **히트맵 스트립**: 최근 ~5주(35일)를 가로 셀로. **파랑=inputLog에 있는 날 / 옅은 칸=학습일인데
    미입력 / 점(dot)=비학습일 또는 휴가일**. 접근성: 각 셀 title에 날짜·상태.
- **학생 홈**(`components/report/home-overview-tab.tsx`): 어떤 자료든 makeup>0이면
  "어제 휴가로 이번 주 보강이 있어요" 한 줄 안내(진도 탭으로 유도).

### 진도 입력 시 로그 기록

- 진도 업데이트 API(교재 currentPage / 인강 completedLectures 저장 경로)에서 저장 시
  해당 자료 `inputLog`에 **오늘(KST) 날짜를 append(중복 제거·120일 캡)**.
  - 대상: 학생 자가 입력 + 관리자 입력 모두(진도가 실제로 바뀌는 경로).

## 영향 범위 / 하위호환

- `countStudyDaysInRange` optional 파라미터 추가 → 기존 호출 하위호환.
- `status='behind'` 판정이 **완화**되는 방향(휴가일 제외)이라, 기존에 잘못 뜨던 정체가 사라진다.
- `inputLog`는 지금부터 쌓이므로 히트맵은 **과거 공란, 시간이 지나며 채워진다**.

## 비목표 (YAGNI)

- 과거 진도 이력 소급/추정(부정확) — 하지 않는다.
- 보강을 정체 판정에 접붙여 강제하는 방식 — 하지 않는다(어드바이저리 유지).
- 기간 목표(deadline) 자료의 보강 — 이번 범위 밖(deadline은 별도 페이스 판정).

## 검증

- 로컬(운영 Supabase 격리 폴백)에서: 휴가 레코드가 있는 학생의 자료가 정체에서 빠지는지,
  보강 배지/수치가 남은 학습일에 맞게 나오는지, 진도 입력 시 `inputLog`에 오늘이 append되고
  히트맵 파랑칸이 생기는지 미리보기 직접 확인.
- 관리자 대시보드 진도지연·상담 진도정체 카운트가 휴가 반영 후 줄어드는지 확인.
