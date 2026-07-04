# 정기외출 → 계획 재조정 권고·적용 (C) — 설계 문서

- 날짜: 2026-07-04
- 상태: 설계안 — 구현 착수(C-1부터)
- 선행: A(휴가 정합)·B(이월) 배포 완료.

## 목표

계획 수립 이후 **정기 외출(AwaySchedule)**이 배정되면, 그로 인해 상시 손실되는 학습 슬롯을 감지하고:
1. 영향받는 과목의 계획을 **자동 재생성(preview)** 한다.
2. 관리자에게 상세시트 패널 + 대시보드 브리핑으로 **권고·미리보기**를 보여준다.
3. 관리자가 **"확인·적용"** 하면 즉시 계획이 반영된다.
4. 학생에게 **"외출로 계획이 이렇게 바뀌었어요"** 알림(스레드 메시지)을 보낸다.

## 데이터 (기존 재사용, 마이그레이션 없음)

- `student.awaySchedules: AwaySchedule[]`(awayTime·returnTime?·days[]·dayMode?·until). 관리자 상세시트에서 관리.
- `lib/academy-timetable.ts` ACADEMY_TIMETABLE(교시별 start/end + studyTime 슬롯).
- `SubjectProgress.studyTime`(슬롯) + `studyDays`(요일) + `goalType`/`goalValue`(재생성용) + detailedPlans.
- 통지: `lib/thread.ts` / 학생 알림 스레드.

## 설계

### C-1. 외출 영향 감지 (`lib/away-impact.ts`)

- `getAwayImpactSlots(awaySchedules, todayKey): Map<weekday, Set<slot>>`
  - 활성 외출만(until==='forever' 또는 until>=today).
  - 각 외출의 [awayTime, returnTime(없으면 하루끝)]를 ACADEMY_TIMETABLE 의 `type==='study'` 교시와 겹침 판정.
  - 겹친 교시의 studyTime 슬롯을, 외출의 days[](dayMode 정규화)에 해당하는 각 요일에 매핑.
  - **슬롯 손실 판정**: 그 슬롯의 study 교시 중 **과반이 외출과 겹치면** 그 (요일,슬롯)을 "손실"로 본다(부분겹침 노이즈 방지).
- `getAffectedSubjects(student, todayKey): { subject, lostStudyDays: string[] }[]`
  - 과목의 `studyTime` 슬롯이 손실된 요일 중, 그 요일이 과목 `studyDays`에 있으면 그 요일을 "잃은 학습일"로.
  - lostStudyDays 비어있지 않은 과목만.

### C-2. 계획 재생성 미리보기

- `buildAwayReplan(student, todayKey): AwayReplanItem[]`
  - 영향 과목의 각 자료(book/lecture)에 대해, **effectiveStudyDays = studyDays − lostStudyDays** 로 `generateDetailedPlans` 재호출(현재 진도·goalType/goalValue 유지).
  - 반환: `{ subjectId, materialId, materialType, title, before:{studyDays,targetDate,weeks}, after:{studyDays,targetDate,weeks}, newPlans }` + 사람이 읽는 diff("주 5일→4일, 마감 7-30→8-06 (7일 밀림)").
  - lostStudyDays 로 effectiveStudyDays 가 비면(모든 학습일 손실) → 경고(외출 재검토 권고), 자동적용 제외.

### C-3. 적용 API + 학생 통지

- `POST /api/admin/students/[id]/away-replan` (관리자 세션)
  - body: 적용할 항목(materialId 목록) 또는 전체.
  - 처리: 해당 자료 detailedPlans 를 newPlans 로 교체(진도 컬럼 보존·optimistic locking), targetDate 갱신.
  - 학생 스레드에 알림 append: "정기 외출({요일 슬롯})이 반영되어 {과목} 계획이 조정되었어요: {diff}".
  - 멱등: 같은 외출 상태에 이미 반영된 계획이면 no-op(권고에서 사라짐).

### C-4. UI

- **학생 상세시트 패널**("외출 영향 · 계획 조정"): 영향 과목·before/after diff·"확인·적용" 버튼(항목별/일괄). 미리보기는 read-only 계산.
- **대시보드 브리핑**: "외출로 계획 조정 필요 N명" 요약 칩 → 클릭 시 해당 학생.

## 재생성 규칙(핵심)

- 외출이 슬롯을 **상시(정기)** 막으므로, 그 요일은 그 과목의 학습일에서 제외(effectiveStudyDays 축소) → generateDetailedPlans 가 남은 요일로 재분배해 **마감이 뒤로 밀림**. 이것이 "시간표를 어떻게 바꿔야 할지"의 구체 답.
- A(휴가)는 일시적 → 보강/이월. C(외출)는 상시 → 계획 자체 재구성. 둘은 별개 축.

## 비목표

- 외출을 슬롯이 아닌 분 단위로 정밀 재분배(부분 손실) — 이번엔 슬롯 과반 규칙으로 단순화.
- 외출 자체 CRUD 변경(기존 상세시트 관리 유지).

## 검증

- `lib/away-impact.ts` 순수함수 하네스: 오후 외출(14~16시, 월)이 소방학(오후·월수금)의 월요일을 잃은 학습일로 잡고, 재생성 시 주 3일→2일·마감 밀림 확인.
- 라이브: 실원생에 외출 세팅 후 권고/미리보기 렌더(적용은 시드/임시).

## 미결(확인)

- 슬롯 "과반 겹침" 임계 — 슬롯 교시 절반 초과 겹침이면 손실. OK?
- 적용 시 회독(reviewPasses)까지 재생성할지 — 1회독만 vs 전체. 제안: 기존 generateDetailedPlans 동작(회독 포함) 그대로.
