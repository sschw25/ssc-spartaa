# 요일 설정을 자료(교재/강의) 단위로 단일화

날짜: 2026-07-07

## 배경

학습 요일(studyDays)이 **과목 단위**(`SubjectProgress.studyDays`)와 **자료 단위**
(`BookProgress.studyDays` / `LectureProgress.studyDays`) 두 곳에 존재한다. 자료별 요일은
2026-07-06에 추가됐고, 자료에 개별 요일이 없으면 과목 요일로 폴백하는 구조였다
(`getMaterialStudyDays(subjectDays, materialDays)`).

요구사항: **과목별 요일 설정은 없애고, 각 강의/교재별로만 요일을 설정한다.** 요일의 단일
소스를 자료 단위로 확정한다.

## 결정 사항

- 기존 과목 요일 데이터: **폴백 제거**. 단, 리셋 방지를 위해 자료로 **내려쓰기(down-copy)** 후
  과목 요일을 비운다.
- 내려쓰기 실행: **일괄 스크립트**(전체 학생 1회성).

## 변경 범위

### 1. 마이그레이션 스크립트 — `scripts/migrate-material-study-days.ts`
- `getStudents()`로 전체 로드. 각 `subject`의 각 `book`/`lecture`에 대해:
  - 자료 `studyDays`가 비어 있으면(undefined/빈 배열) `subject.studyDays`를 복사해 채운다.
  - 이후 `subject.studyDays`를 `[]`로 비운다.
- 변경된 학생만 `saveStudent()`. `--dry-run`으로 미리보기 지원.
- env 로드는 `scripts/check-progress.ts` 패턴 재사용.
- 롤아웃: **스크립트 먼저 실행 → 코드 배포**(또는 동시). 코드만 먼저 나가면 자료 요일 없는
  기존 학생이 잠시 월~토 기본으로 보일 수 있음.

### 2. 폴백 로직 제거 — `lib/progress-plan.ts`
- `getMaterialStudyDays<T>(subjectStudyDays, materialStudyDays)`의 **첫 인자를 무시**하도록
  본문만 수정: 자료 요일이 있으면 그대로, 없으면 `undefined`(→ `getActiveStudyDays` 기본 월~토).
- 호출부 ~25곳은 시그니처 유지로 그대로 컴파일된다(인자 무시). 폴백은 이 한 곳에서 사라진다.

### 3. 관리자 UI
- `components/admin/detail-tabs/progress-tab.tsx`
  - 과목 카드 "요일별 계획" 7일 토글 블록(≈890–916행) 제거.
  - `MaterialStudyDayPicker` 라벨 `과목 기본` → `기본(월~토)`.
  - 미사용이 되는 `handleToggleSubjectStudyDay` 구조분해 제거.
- `components/admin/student-detail-sheet.tsx`
  - `handleToggleSubjectStudyDay` 정의 제거(또는 미사용 정리).
  - 과목 요일 텍스트 표시(≈2795행) 제거.

### 4. 데이터 모델 — `lib/types/student.ts`
- `SubjectProgress.studyDays`는 필드 유지(상담 텍스트 파서·하위호환) + **deprecated 주석**.
  계획 계산에서는 미사용.

## 명시적 비범위(out of scope)

- `applyStudyScheduleFromConsultation`(상담 텍스트 → 과목 시간대·요일 일괄 설정 파서):
  `subject.studyDays`를 쓰지만 상담용 시간표 관심사이고, 폴백 제거 후 계획 계산에 영향 없음(무해).
  이번 변경에서 손대지 않는다. `studyTime`(오전/오후/야간)은 계속 유효.

## 검증

- `tsc`/lint 회귀 없음.
- 마이그레이션 `--dry-run` 출력으로 down-copy 대상 확인.
- 자료 요일이 계획·시간표·리포트에 반영되는지(폴백 없이) 확인은 사용자 최종 검증.
