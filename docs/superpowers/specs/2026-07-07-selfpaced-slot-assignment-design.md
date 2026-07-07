# 자율학습 자료의 학생 시간대 배정 (per-material 시간표 반영)

- 날짜: 2026-07-07
- 상태: 설계 승인 대기
- 관련 메모리: [[study-days-material-only-2026-07-07]], [[selfpaced-exposure-review-2026-07-07]], [[study-plan-selfpaced-permaterial-2026-07-06]]

## 배경 / 문제

자율학습(`goalType: 'selfPaced'`) 자료는 계획(`detailedPlans`)이 없고 학생이 그날 한 만큼만 누적 입력한다. 현재 이 자료는 **부모 과목의 `subject.studyTime`(오전/오후/야간)을 물려받아** 시간표에 자동으로 노출된다.

원하는 동작:
- 학생이 **요일만** 설정하고 시간대(오전/오후/야간)를 지정하지 않은 자율학습 자료는 그날 홈의 "자율 학습" 그룹(그날 할일)에는 나오되 **시간표에는 나오지 않는다**.
- 학생이 홈에서 그 자료를 "오전 / 오후 / 야간 / 몇 교시"에 하겠다고 **직접 설정**하면, 그때 시간표에 반영된다.

즉, 시간표 노출 여부를 **과목 단위 상속**에서 **자료 단위 학생 설정**으로 이관한다.

## 결정 사항 (확정)

| 항목 | 결정 |
|---|---|
| 배정 단위 | 개별 자료(강의/교재) 단위 |
| 배정 granularity | 블록(오전/오후/야간) **및** 특정 교시(0~8교시) 둘 다 |
| 지속성 | 계속 유지(학생이 바꿀 때까지 고정) |
| 블록 지정 시 시간표 표시 | 그 블록에 속한 교시 3칸 **모두**에 표시(기존 계획형 과목과 일관) |
| 설정 진입점 | 홈의 "자율 학습" 그룹에만 |
| 승인 | 불필요 — 학생 직접 설정 즉시 반영 |
| 마이그레이션 | 불필요(자료는 `subjects` JSONB 안의 중첩 JSON) |

## 동작 매트릭스

| 자료 상태 | 홈 "자율 학습" 그룹 | 시간표 |
|---|---|---|
| 슬롯 미지정(요일만) | ✅ 노출(진도 입력) | ❌ 제외 |
| 슬롯 = 블록(오전/오후/야간) | ✅ 노출, 라벨 표시 | ✅ 해당 블록 교시 3칸에 "자율 학습" |
| 슬롯 = 특정 교시(예: 3교시) | ✅ 노출, 라벨 표시 | ✅ 그 한 칸에만 "자율 학습" |

- 홈 "자율 학습" 그룹은 진도를 **입력하는 곳**이므로 슬롯과 무관하게 항상 유지된다(오늘이 그 자료의 학습요일일 때). 슬롯은 (a) 시간표 노출과 (b) 홈 그룹의 시간대 라벨만 추가로 결정한다.
- 홈 그룹 노출 조건은 기존과 동일: 자료 학습요일(`getMaterialStudyDays`)에 오늘 요일이 포함되면 노출. 슬롯이 노출 여부를 바꾸지 않는다.

## 데이터 모델

`BookProgress`와 `LectureProgress`(둘 다 `lib/types/student.ts`)에 학생 제어 선택 필드 하나 추가:

```ts
/** 자율학습(selfPaced) 자료의 학생 지정 시간대. 시간표 노출 결정용.
 *  '' | 미설정 → 시간표 제외(홈 그룹만). 'morning'|'afternoon'|'night' = 블록.
 *  'p0'~'p8' = 특정 교시(p8 = 심야 자율). selfPaced 자료에만 의미. */
studySlot?: '' | 'morning' | 'afternoon' | 'night' | `p${number}`;
```

- 블록 3종과 특정 교시 키를 한 필드에 저장(union). `p0`~`p7`은 0~7교시, `p8`은 심야 자율.
- 기본값(미설정) → 시간표 제외.
- 마이그레이션 없음: 자료는 `subjects` 단일 JSONB 컬럼 안에 중첩 저장되며, 기존 `studyDays`/`inputLog`/`reviewLog`와 동일하게 자동 직렬화된다. `patchStudentProgress`는 `subjects` 컬럼만 타깃 업데이트하므로 다른 컬럼을 건드리지 않는다.

## 컴포넌트별 변경

### A. `lib/academy-timetable.ts`
- study 성격 period(`type` 이 `study`|`late-study`|`supplement`)에 안정적 `periodKey` 부여: `p0`(0교시)~`p7`(7교시), 심야 자율 = `p8`.
- 슬롯 라벨 헬퍼 추가: `formatSlotLabel(slot): string` — 블록/교시 키를 사람이 읽는 라벨로(`'morning'→'오전'`, `'p3'→'3교시'`, `'p8'→'심야'`). 슬롯 선택 옵션 목록도 여기서 export(`STUDY_SLOT_OPTIONS`)해 홈 UI와 검증이 같은 소스를 쓰게 한다.
- 슬롯 판별 헬퍼: `isBlockSlot(slot)` / `isPeriodSlot(slot)`(그리고 매칭용 순수 함수 `slotMatchesPeriod(slot, period)`).

### B. `hooks/use-report-state.ts` — `todaySelfPacedItems`
- 반환 항목의 `studyTime` 필드 소스를 `subject.studyTime` → 해당 자료의 `studySlot`로 교체(빈 문자열이면 미지정).
- 시간표/홈 그룹 양쪽이 이 값을 소비. 홈 그룹 노출 조건(요일)은 변경 없음.

### C. `components/report/timetable-tab.tsx`
- selfPaced 매칭 로직 교체: 현재 `todaySelfPacedItems.filter(item => item.studyTime === period.studyTime)` →
  `slotMatchesPeriod(item.studyTime, period)` 사용.
  - 블록 슬롯: `period.studyTime === slot` → 그 블록 3칸 모두 표시.
  - 특정 교시 슬롯: `period.periodKey === slot` → 그 칸만 표시.
  - 미지정(`''`): 어떤 period 에도 매칭 안 됨 → 시간표 제외.
- `subject.studyTime` 기반 selfPaced 상속 제거(계획형 자료의 `subject.studyTime` 사용은 그대로 유지).

### D. `components/report/home-overview-tab.tsx` — "자율 학습" 그룹
- 각 자료 카드에 슬롯 선택 컨트롤(네이티브 `<select>`) 1개 추가:
  - 옵션: 미지정 / 오전 / 오후 / 야간 / 0교시 / 1교시 / … / 7교시 / 심야(8교시) — `STUDY_SLOT_OPTIONS`에서.
  - 현재값 표시, 변경 시 `saveStudySlot(...)` 즉시 호출(낙관적 갱신), 성공 토스트.
- 시간대 라벨 표시를 `studyTimeLabels[item.studyTime] || '미지정'` → `formatSlotLabel(item.studyTime)`로(교시 키도 라벨링 가능하게).
- iOS26 Glass 규칙 준수(색=역할, 보라/인디고 금지, 기존 `.glass`/입력 프리미티브 재사용, 다크모드 포함).

### E. `use-report-state.ts` — `saveStudySlot`
```ts
saveStudySlot(materialType: 'book'|'lecture', materialId: string, slot: string): Promise<boolean>
```
- `/api/student/progress` PATCH 호출(`{ materialType, materialId, studySlot: slot }`).
- 성공 시 로컬 `student.subjects[].books/lectures` 해당 자료의 `studySlot` 낙관적 갱신 + `mutationSeqRef` 증가.

### F. `app/api/student/progress/route.ts` PATCH
- `studySlot` 분기 추가(기존 `reviewMinutes`/`deadlineAmount` 분기와 동형):
  - 허용 값 검증: `'' | 'morning' | 'afternoon' | 'night' | /^p[0-8]$/`. 그 외는 400.
  - 대상 자료(최상위 + subjects 병합 탐색, 기존 패턴 재사용)에 `material.studySlot = value` 설정.
  - `patchStudentProgress(student, originalUpdatedAt)`로 저장(optimistic locking 2회 재시도 재사용).
  - selfPaced 아닌 자료에 대한 설정 요청은 무시하거나 허용? → **허용**(무해, 시간표에서 selfPaced 항목만 이 값을 소비). 단순화를 위해 goalType 검사 없이 저장.

## 데이터 흐름

```
학생(홈 "자율 학습" 그룹에서 select 변경)
  → saveStudySlot()  →  PATCH /api/student/progress { studySlot }
     → applyStudySlotMutation: material.studySlot = value
     → patchStudentProgress (subjects JSONB 컬럼만 저장, optimistic lock)
  → 낙관적 갱신 → todaySelfPacedItems 재계산(studyTime=studySlot)
     → 홈 그룹 라벨 갱신 + 시간표(timetable-tab) 해당 칸에 "자율 학습" 노출
```

## 에러 / 엣지 케이스

- 잘못된 슬롯 문자열 → API 400, 홈에서 토스트 에러, 로컬 갱신 롤백.
- 저장 충돌(409) → 기존 optimistic locking 재시도 로직으로 흡수, 실패 시 토스트.
- 슬롯을 "미지정"으로 되돌리면 시간표에서 사라지고 홈 그룹에는 남는다.
- 자료가 selfPaced 가 아니게 바뀌어도 `studySlot` 값은 남지만 시간표는 selfPaced 항목만 소비하므로 무해.
- 특정 교시 키가 미래에 시간표 개편으로 사라질 경우: `slotMatchesPeriod`가 매칭 실패 → 시간표에서 조용히 빠지고 홈 그룹 라벨은 `formatSlotLabel` 폴백('미지정' 또는 원문). 데이터 손상 없음.

## 테스트 / 검증

- 단위 성격: `slotMatchesPeriod`(블록→3칸, 교시→1칸, 미지정→0칸), `formatSlotLabel`(블록/교시/폴백).
- 통합: PATCH `studySlot` 검증(허용/거부 값), 저장 후 라운드트립(다른 컬럼 보존 확인).
- 라이브(사용자 최종 확인): 홈에서 슬롯 지정 → 시간표 해당 칸 노출, 미지정 → 시간표 제외/홈 유지, 블록 3칸 표시, 특정 교시 1칸 표시.

## 범위 밖 (YAGNI)

- 비-selfPaced(계획형) 자료의 시간표 배정은 그대로 `subject.studyTime` 사용 — 변경 없음.
- 관리자 UI에서 자료별 슬롯 편집 — 이번 범위 아님(학생 셀프 설정만). 필요 시 후속.
- 슬롯별 학습시간/분 배분, 슬롯 기반 리마인더 등 — 이번 범위 아님.
