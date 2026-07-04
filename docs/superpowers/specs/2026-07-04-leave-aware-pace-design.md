# 휴가 정합 코어 (Leave-aware pace) — 설계 문서

- 날짜: 2026-07-04
- 상태: 설계안 — 사용자 검토 대기
- 범위: **A. 휴가 정합 코어**만. (B 쿠폰 이월 / C 정기외출 권고는 별도 스펙)
- 선행: `2026-07-04-progress-stall-improvement-design.md`(일일계획 휴가면제 v1)의 결정 3개를 **뒤집는 재설계**.

## 배경 / 검증된 문제

진도 pace 계산이 두 갈래인데 휴가 처리가 어긋나 있다. 실제 함수로 10개 시나리오 +
실원생(김의구) 라이브 검증으로 확인:

- **기간목표(deadline, 모드 B)** = `getDeadlinePace`는 **휴가를 완전히 무시**(시그니처에 `leaveDates` 없음).
  - 실증: 김의구 소방학 창 07-03~07-09(월수금, target 13강, actual 4). 창 내 학습일 07-03·07-06·07-08 중
    **07-03=오후반차, 07-08=병가**인데, today=07-08(병가일)에 `expected=13강·behind=true·danger·오늘권장9강`.
    정당 휴가 중인 날 "오늘 9강 하라 + 위험"이라 나무람.
- **일일계획(daily)** = 휴가를 하루 통째 면제(`getLeaveDates` "반차도 그날 전부 면제") + 보강 재분배.
  - 반차(오전/오후/야간)인데 하루치를 통째 이월 → 과다 면제.
- **계획 연장 없음**: 어느 쪽도 빠진 만큼을 다음으로 미루지 않음(B에서 다룸).

## 목표 (A)

1. **deadline이 휴가를 반영**한다 — 정당 휴가로 danger/behind 오판 제거(핵심 버그).
2. **반차 = 슬롯분만** 차감 — 하루 통째가 아니라 그 슬롯 몫만.
   - 일일계획: 그 슬롯에 배정된 **특정 과목**의 그날치만.
   - 주간목표: 그날 기대의 슬롯 **비율(%)** 만.
3. **면제분은 그 주(창) 남은 학습일에 보강**으로 남긴다(정체 판정과 분리된 어드바이저리, 기존 유지).

## 휴가 타입 분류 (단일 소스: `lib/leave.ts` LEAVE_TYPES)

| type | category | 면제 크기 | 이월(B) 자격 |
|---|---|---|---|
| morning / afternoon / night (월2 반차) | halfday | 슬롯 % | **가능** |
| fullday (월1 휴식권) | fullday | 100% | **가능** |
| personal_halfday (개인사정 반차) | personal_halfday | 슬롯 % | 불가(주말까지 보강) |
| personal_fullday (개인사정 휴가) | personal_fullday | 100% | 불가 |
| sick (병가) | sick | 슬롯 있으면 슬롯%, 없으면 100% | 불가 |

- 쿠폰 교환분(`usedCredit=true`)이라도 **type이 halfday/fullday 계열이면 이월 가능**(반차권/휴식권이므로).
- 이월(B) 자격 규칙: `category ∈ {halfday, fullday}` → 가능. `{personal_halfday, personal_fullday, sick}` → 불가.
- **A 범위에서는 이 분류를 데이터로만 확정**하고, 실제 이월 동작은 B에서 구현.

## 슬롯 비율 (면제분)

하루 자습 = 650분(= 오전190 + 오후210 + 야간250, `getAvailableMinutes` 근거).

| 슬롯 | 분 | 면제분 |
|---|---|---|
| morning | 190 | 190/650 ≈ **0.292** |
| afternoon | 210 | 210/650 ≈ **0.323** |
| night | 250 | 250/650 ≈ **0.385** |
| fullday | 650 | **1.0** |

- 상수는 `lib/academy-timetable.ts`/`getAvailableMinutes`에서 파생(하드코딩 금지, 단일 소스).

## 설계

### 데이터 모델 (마이그레이션 없음)

- 재사용: `student.leaveRequests`(`{type, date, slot?, status}`), `SubjectProgress.studyTime`(오전/오후/야간),
  `SubjectProgress.studyDays`.
- 신규 컬럼/테이블 없음.

### 휴가 → 슬롯 면제 유도 (신규 헬퍼, `lib/progress-plan.ts` 또는 `lib/leave.ts`)

```
getLeaveExemption(student): Map<dateKey, { fraction: number; slot?: LeaveSlot }[]>
```
- 승인된(자동승인 포함) 결석성 휴가만.
- 각 휴가일에 대해 slot(반차/병가 슬롯) → fraction, fullday류 → 1.0.
- 한 날 복수 휴가(예: 오전+오후) 가능 → fraction 합산(최대 1.0 캡).

### ① 주간목표(deadline) — `getDeadlinePace`에 휴가 반영

현재: `elapsedStudyDays` = 학습일 정수 카운트.
변경: **가중 경과일** — 각 경과 학습일의 기여 = `1 − min(1, 그날 면제분)`.
- 휴가 없는 학습일 → 1. 오후반차일 → 0.677. 병가(fullday)일 → 0.
- `expectedRatio = 가중경과 / totalStudyDays`(분모는 유지). → 정당휴가로 danger/behind 완화.
- `expectedRatioPrior`(어제까지)도 동일 가중.
- `totalStudyDays` 분모는 **유지**(면제분은 보강으로 남아야 하므로 목표량은 안 줄임).
- `todayRecommend`: 오늘이 휴가면 그 비율만큼 축소(오늘 온전 학습 아님).
- 시그니처에 `leaveExemption`(optional) 추가 → 하위호환.

### ② 일일계획(daily) — 반차는 슬롯 배정 과목만

현재: `getLeaveDates`가 날짜만 보고 그날 전체 과목 면제.
변경: 면제를 **(날짜, 슬롯) → 그 슬롯 과목**으로 좁힌다.
- 반차(슬롯 있음): 그날 `subject.studyTime === 슬롯` 인 과목의 자료만 면제/보강. 다른 슬롯 과목 무영향.
- fullday류: 그날 전 과목 면제(기존과 동일).
- **폴백(결정됨)**: 반차일인데 과목에 `studyTime` 태그가 **없으면** → 슬롯 **비율(%)** 로 부분 면제(주간목표와 동일 취급). 태그 있으면 그 과목만 전액.
- `buildItem`/`getExpectedFromPlans`/`getExpectedWithinCurrentPlan` 경로가 (날짜,슬롯,과목studyTime)을 알도록 인자 확장.

### ③ 보강(주 내)

- `getMakeupAmount`를 확장: (a) deadline plan도 대상, (b) 슬롯 부분면제분(=fraction×dailyAmount) 반영.
- 면제량을 그 주(창)의 **남은 학습일(오늘~min(창끝, 토))**에 분배. (기존 로직 계승)
- **behind 판정(결정됨)**: 휴가 가중 반영 후엔 **순수 휴가만으로는 절대 behind가 뜨지 않는다**.
  (실제로 안 한 미달만 behind.)

## 비목표 (A에서 안 함 — 별도 스펙)

- **B. 쿠폰 이월**: 이번 주 보강을 다음 주로 넘기기(반차/휴식권만, 주1). 계획 target 이월. → A는 "이월 자격 분류"만 데이터로 확정.
- **C. 정기외출(AwaySchedule)**: 외출시간 배정 시 시간표/계획 조정 권고 + 학생 통지.
- 과거 소급.

## 하위호환 / 영향

- 새 헬퍼 + optional 파라미터 → 기존 호출 하위호환.
- `behind/danger`가 **완화되는 방향** → 관리자 대시보드 진도지연·상담 정체·학생 리포트 위험이 정당휴가만큼 줄어든다.
- deadline 위험 판정(`deriveDeadlineGoals`)이 휴가를 반영하게 되어 김의구류 오탐 제거.

## 검증

- **결정론 하네스**(`scripts/verify-leave-plan-scenarios.mts`)에 "휴가 반영 후 기대치" 단언 추가:
  - S6/S7(deadline+휴가): danger→ok, expected가 면제분만큼 감소.
  - S3(오전반차, 슬롯 과목): 하루통째(5) 아니라 슬롯분(≈1.5)만 면제.
- **라이브 재확인**: 김의구 today=07-08(병가) → `danger→ok`, `오늘권장 9강→0` 확인(읽기전용/로컬).
- 관리자 진도지연·상담 정체 카운트가 휴가 반영 후 줄어드는지.

## 데이터 실태 (2026-07-04 운영 스냅샷)

- 활성 계획: **deadline 13 vs daily 9** → deadline(모드 B)이 다수. 휴가 무시 버그가 대다수 계획에 영향(A 우선순위 근거).
- `subject.studyTime` 설정률 **63%**(8과목 중 5: 오전3·오후2·야간0, 빈값3) → 슬롯-특정 경로 실효 있음, 폴백(%)은 ~37% 대비용.
- 62명 중 계획 보유 과목은 8개뿐 → 블라스트 반경 아직 작음(지금 변경 저위험).

## 미결(검토 시 확인)

- 한 날 복수 반차(오전+오후) 합산 캡 1.0 — OK?
- `studyTime` 빈값(37%) 폴백을 %로 — 확정(위 실태로 광범위 오작동 우려 낮음).
