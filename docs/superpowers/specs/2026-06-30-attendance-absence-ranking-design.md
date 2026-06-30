# 출결판 지능화 — 이탈·결석 순위 대시보드 설계 (2026-06-30)

## 배경

출결판(`/admin/seat-board`)은 **수기 점검 도구**다(사용자 확정 원칙): 등원 사실로 '출석'을 자동으로 채우지 않고, 관리자가 자리를 보고 비어 있으면 교시 셀에 X(`seat_statuses` status `absent`)를 직접 남긴다. 이 수기 X가 `seat_statuses` 테이블에 `(date, seat_key)`로 **날짜별 보존**되고 있다(과거치 존재). 그러나 이 누적 데이터를 관리자가 추이로 볼 방법이 없다.

## 목표

누적된 수기 X 데이터로 **상습 이탈/결석자 순위**를 보여주는 읽기 전용 뷰를 만든다. 수기 점검 원칙을 깨지 않는다(쓰기·자동출석 없음, 분석만).

## 핵심 결정

### 데이터 정의
- **원천**: `seat_statuses` 중 수기 결석 마크 — status `absent`(교시 셀 amber X). 8교시 일괄(전 교시 X / `A`/idx 0~6 일괄)도 포함하되, 정확한 저장 status·키 형태는 seat-board 쓰기 로직(`app/admin/seat-board/page.tsx`)과 대조해 구현 시 확정한다. **교시 키(`{studentId}:{0~7}`)만** 집계, 휴대폰 키(`{studentId}:phone_{D|E|N}`)는 제외(다른 신호).
- **이탈 vs 결석 분류**((학생, 날짜) 단위, 정당사유 제외 후 남은 수기 X 기준):
  - **결석일** = ① 그날 등원 세션 없음 + 수기 X(아예 안 옴), **또는** ② 그날이 일괄 X(전 운영교시 X / 8교시 일괄)로 채워짐 — 등원 여부와 무관하게 하루종일 자리비움으로 본다.
  - **이탈일** = 그날 등원 세션 있음 + **부분** 수기 X(일괄 아님) → "왔는데 일부 자리 비움".
  - 한 (학생, 날짜)는 결석일 **또는** 이탈일 중 하나로만 카운트(결석 우선).
- **정당 사유 제외(2겹)**:
  1. 승인 휴가의 파랑 X는 렌더 시 계산이라 `seat_statuses`에 저장되지 않음 → 기본적으로 순위에 미포함.
  2. 안전장치: 수기 X라도 그 (학생, 날짜, 교시idx)가 승인 휴가(반차/휴식/개인사정/병가)가 덮는 교시면 **총계에서 제외**. 기존 seat-board의 `leaveBlockKind`/`leaveKindCoversPeriod`/`approvedLeavesOn` 로직을 공유 모듈로 추출해 재사용. (제외 후 남은 X가 없으면 그 날은 카운트 안 함.)
- **집계 단위**: **일수**. 같은 날 여러 교시 X여도 1일. **정렬 = 결석일수 내림차순(1순위) → 이탈일수 내림차순(2순위)** → 동률 시 총 X 마크 수 → 이름. 부가 표시: 총 X 마크 수, 최근 발생일.

> **일괄 X 판정**: 그날 (정당사유 제외 후) 수기 X가 그 (센터, 요일)의 운영 교시 전부를 덮으면 일괄로 본다. 운영 교시 수는 seat-board 교시 구성(또는 idx 0~6 전체)을 기준으로 구현 시 확정.

### 아키텍처
서버 집계 + 기존 페이지 내 탭(접근 A). 센터 규모에선 온디맨드 서버 집계로 충분(전용 테이블/크론 불필요).

### 위치
신규 페이지가 아니라 기존 **출결 상세 표(`/admin/attendance`)** 안에 탭/섹션으로 추가.

## 설계

### 컴포넌트 (각 단일 책임)

**1. `lib/leave-blocks.ts` (신규 — 공유 순수 모듈, 추출 리팩터)**
- `app/admin/seat-board/page.tsx`에서 `leaveBlockKind(leave)`, `leaveKindCoversPeriod(kind, idx)`, `approvedLeavesOn(student, date)`, `LeaveBlockKind` 타입을 그대로 이동.
- 추가 헬퍼: `isPeriodCoveredByApprovedLeave(student, date, idx): boolean` = `approvedLeavesOn(student, date).some(l => leaveKindCoversPeriod(leaveBlockKind(l), idx))`.
- `seat-board/page.tsx`는 이 모듈에서 import하도록 수정(동작 보존 — 함수 본문 변경 없음). `student-detail-sheet.tsx`도 동일 함수를 자체 정의하고 있으면 이 모듈로 통일(중복 제거).

**2. `lib/absence-stats.ts` (신규 — 순수 집계)**
- 입력: seat_status 마크 행 배열(`{date, seatKey, status}`), 등원일 집합(`Set<"studentId|date">`), 학생 배열(id→{name, campus, leaveRequests}).
- 처리: 교시 키만 파싱(`seatKey.split(':')` → studentId + idx, `phone_` 제외), status가 결석 마크인 행만, `isPeriodCoveredByApprovedLeave`로 정당사유 제외, (학생, 날짜)별로 이탈/결석 1일 분류·중복제거.
- 출력: `AbsenceRankRow[] = { studentId, name, campus, absentDays(결석), leftDays(이탈·자리비움), totalMarks, lastDate }` — **absentDays desc → leftDays desc → totalMarks desc → 이름** 순 정렬. (이탈=leftDays로 명명, `leaveDays`는 휴가와 혼동되어 사용 안 함.)
- 순수함수 → `scripts/verify-*.mts`로 단위 검증.

**3. 조회 (lib/store 또는 엔드포인트 내)**
- seat_statuses 범위 조회: `date BETWEEN from AND to`, 결석 status만. (기존 `app/api/admin/seat-status/route.ts`의 supabase/local 분기 패턴 재사용 — 신규 함수 `getSeatAbsenceMarks(from, to)` 권장.)
- 등원일 집합: `study_sessions`에서 `date BETWEEN from AND to`의 `(student_id, date)` distinct → `Set`. (신규 `getAttendedDays(from, to): Promise<Set<string>>`, 기존 `getStudyMinutesByStudent` 패턴 참고.)

**4. API `GET /api/admin/attendance/absence-ranking?from=&to=&campus=`**
- 인증: 관리자 세션. 권한: campus_admin=자기 센터만, master(`all`)=전체(`?campus`로 단일 센터 필터 허용).
- from/to 검증(YYYY-MM-DD), 누락 시 기본 = 이번 달 1일~오늘(KST).
- 조회 3종 → `buildAbsenceRanking` 호출 → 센터 스코프 필터 → 정렬된 배열 반환 `{ success, rows, from, to }`.

**5. UI — `/admin/attendance` 내 탭/섹션 "이탈·결석 순위"**
- 기간 프리셋: 이번주 / 이번달(기본) / 지난 30일 (+ from/to 직접 선택 가능하면 추가, 선택).
- 표(결석 1순위 정렬): 순위 · 학생명(센터) · **결석일수** · **이탈일수** · 총 X · 최근발생일. 행 클릭 → 기존 학생 상세 시트.
- 상단 한 줄 요약: 기간/대상 인원/총 이탈일·결석일.
- 색: 이탈=amber, 결석=rose 계열(의미색). 보라/인디고 금지. iOS26 글래스.

**6. 네비** — 기존 출결 상세 표 진입점 유지(별도 네비 추가 없음, 탭으로 도달).

## 데이터 흐름

```
seat_statuses(범위, absent)  ┐
study_sessions(범위)→등원일집합 ├→ buildAbsenceRanking(휴가제외·이탈/결석분류·일수집계) → 순위표
students(이름·센터·휴가)        ┘
```

## 에러 처리
- 조회 실패 시 빈 순위 + 안내(throw 대신 graceful). 잘못된 날짜 형식 400. 권한 없으면 403.
- seat_key 파싱 실패 행은 skip(로그 없이). 매칭되는 학생 없으면 그 마크는 제외.

## 검증
- 순수 집계 단위테스트(`scripts/verify-absence-stats.mts`): seat_key 파싱, 휴가 덮인 교시 제외, 이탈/결석 분류(세션 유무), 같은 날 다교시 1일 처리, 정렬.
- `lib/leave-blocks.ts` 추출 후 기존 seat-board 동작 회귀 없음 확인(tsc + build, 함수 본문 무변경).
- API E2E(격리 local-json): seat_statuses + 세션 시드 → 분류 정확.
- tsc + build. 시각 확인은 사용자 몫(iOS26).

## 영향 받는 파일
- `lib/leave-blocks.ts` — 신규(추출)
- `lib/absence-stats.ts` — 신규(순수 집계)
- `lib/store.ts` — `getSeatAbsenceMarks`/`getAttendedDays` 조회 헬퍼(또는 supabase.ts에)
- `app/api/admin/attendance/absence-ranking/route.ts` — 신규
- `app/admin/seat-board/page.tsx` — leave-blocks import로 교체(리팩터)
- `components/admin/student-detail-sheet.tsx` — 중복 휴가로직 있으면 통일
- `app/admin/attendance/page.tsx` (출결 상세 표) — 순위 탭 추가

## 범위 밖 (YAGNI)
- 학부모 알림(별도 사이클)
- 센터 요약 카드·요일×교시 히트맵·추이 차트(이번엔 순위 하나)
- 휴대폰 미제출 통계
- 야간 사전집계 크론
