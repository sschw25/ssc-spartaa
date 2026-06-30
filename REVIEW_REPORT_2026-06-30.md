# 최근 코드리뷰 및 검증 보고서 (2026-06-30)

## 범위

- 기준 커밋: `8e79af3 Merge PR: 출결번호 규칙 + 변경 신청·승인`
- 주요 대상:
  - 학생 가입신청/승인
  - 학생 출결번호 변경 신청
  - 관리자 출결번호 변경 승인/반려
  - 학생 로그인 및 관리자 출결번호 초기화

## 리뷰 결과 및 조치

### 1. 가입 승인 중 부분 실패 위험 수정

- 문제: 가입 승인 API가 학생 row 생성 후 별도 호출로 비밀번호 해시를 저장했다. 해시 저장 실패 시 계정은 생겼지만 로그인 불가 상태가 되고, 신청도 다시 승인하기 어려운 상태가 될 수 있었다.
- 조치:
  - `createStudentWithPasswordHash` 저장소 API를 추가했다.
  - Supabase에서는 `students` insert 시 `password_hash`까지 한 번에 저장한다.
  - 가입신청 제거 실패 시 방금 생성한 학생 row를 보상 삭제하도록 처리했다.
- 관련 파일:
  - `lib/store.ts`
  - `lib/supabase.ts`
  - `app/api/admin/applications/[id]/route.ts`

### 2. 출결번호 변경 승인 원자성 보강

- 문제: 관리자 승인 API가 새 해시 적용과 `studentState.passwordChange` 제거를 분리 처리했다. 중간 실패 시 신청이 계속 남거나 재승인 상태가 꼬일 수 있었다.
- 조치:
  - `approvePendingStudentPasswordChange`를 추가했다.
  - Supabase에서는 `password_hash`, `student_state`, `updated_at`을 하나의 update로 반영하고 낙관적 잠금 충돌을 감지한다.
  - 충돌 시 최대 3회 재시도 후 409 응답을 유지한다.
- 관련 파일:
  - `lib/store.ts`
  - `lib/supabase.ts`
  - `app/api/admin/password-requests/[id]/route.ts`

### 3. 출결번호 규칙 일관성 보강

- 문제: 관리자 수동 초기화 API는 아직 4자 이상 임의 비밀번호를 허용했다.
- 조치:
  - 관리자 초기화도 공통 `validateAttendanceCode`를 사용하도록 변경했다.
  - 숫자 6자리, 학생/학부모 휴대폰 번호와 비중복 규칙을 적용했다.
  - 동명이인 중 동일 출결번호 사용 여부도 새 규칙 기준으로 검사한다.
- 관련 파일:
  - `app/api/admin/students/[id]/password/route.ts`
  - `lib/attendance-code.ts`

### 4. 로그인/변경 신청 입력 호환성 개선

- 문제: 출결번호 입력에 하이픈 등 숫자 외 문자가 섞이면 저장된 6자리 해시와 비교되지 않을 수 있었다.
- 조치:
  - 기존 비밀번호 데이터 호환을 위해 원문 비교를 먼저 수행한다.
  - 원문 비교 실패 시 숫자만 정규화한 출결번호로 한 번 더 비교한다.
  - 학생 로그인 화면 문구를 비밀번호에서 출결번호로 정리했다.
- 관련 파일:
  - `app/api/student/auth/login/route.ts`
  - `app/api/student/password-change-request/route.ts`
  - `app/student/login/page.tsx`
  - `app/student/password-change/page.tsx`

### 5. UI 지침 위반 정리

- 문제: 최근 추가 화면에 `font-bold`, `font-black`, `text-[9px]`, `text-[10px]`가 남아 있었다.
- 조치:
  - 최근 수정 범위의 weight를 `font-semibold`로 정리했다.
  - 9px/10px 텍스트를 11px 이상으로 올렸다.
  - 무효 Tailwind 셰이드 `-450/-650/-750/-850`는 발견되지 않았다.
- 관련 파일:
  - `app/admin/applications/page.tsx`
  - `app/student/login/page.tsx`
  - `app/student/signup/page.tsx`
  - `app/student/password-change/page.tsx`

## 검증 결과

- `npx tsc --noEmit`: 통과
- `npm run build`: 통과
- `npm run lint`: 통과, 기존 경고 369개 유지
- `git diff --check`: 통과
- `rg -n -- '-(450|650|750|850)\b' app components lib hooks styles`: 결과 없음
- 최근 수정 화면 대상 `font-bold/font-black/text-[9px]/text-[10px]` 검색: 결과 없음

## 남은 리스크

- `npm run lint`는 실패하지 않지만 레포 전반에 기존 경고 369개가 남아 있다. 이번 변경 범위 밖의 오래된 React hook 경고, unused 변수, `any` 사용이 대부분이다.
- 가입신청 대기열은 `app_settings` JSON 배열 기반이라 고동시성 승인/신청에는 구조적으로 약하다. 운영 트래픽이 늘면 별도 `student_applications` 테이블로 분리하는 편이 안전하다.
- 기존 학생 중 과거 임의 비밀번호를 쓰는 계정은 로그인 원문 비교로 유지되지만, 관리자 초기화 이후에는 새 6자리 출결번호 정책이 적용된다.
