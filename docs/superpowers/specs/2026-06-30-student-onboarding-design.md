# 학생 승인 후 첫진입 온보딩 설계 (2026-06-30)

## 배경

학생 셀프 가입신청 → 관리자 승인 → 정식 원생 생성 흐름은 이미 있다(이용 시작일 게이트·출결번호 규칙 포함). 그러나 **승인된 신규생이 처음 로그인했을 때의 경험이 0이다**: `app/student/page.tsx`가 로그인 상태면 곧장 `/report/{id}`로 리다이렉트해, 신규생은 안내 없이 (대개 비어 있는) 리포트에 떨어진다.

## 목표

승인 후 첫 로그인 시 **환영 + 핵심 사용법 가이드**(읽고 닫기)를 보여주는 격리된 온보딩 경험을 만든다. 이후엔 "사용법 다시보기"로 재열람 가능.

## 핵심 결정

- **격리 전용 라우트(B)**: 리포트 페이지(`use-report-state` early-return 트랩으로 깨지기 쉬움)를 건드리지 않고 `/student/welcome` 신규 라우트로 분리.
- **완료 플래그 = `student_state.onboardedAt`**: jsonb(`enrollStartDate`와 동일 패턴) → **마이그레이션 없음**.
- **성격 = 읽고 닫기**: 첫행동 체크리스트·진행률 추적 없음(YAGNI).
- **모의고사 단계 조건부**: `Student.contact`(목표시험, 자유 텍스트)에 `공무원`/`경찰`/`소방`/`수능` 중 하나라도 포함되면 노출. 구조화된 직렬 필드가 없어 substring 매칭이 현실적.

## 설계

### 트리거 & 진입 분기
- **`app/student/page.tsx`**(중앙 진입점): 로그인 상태면 학생 조회 → `student_state.onboardedAt`이 없으면 `/student/welcome`로, 있으면 기존대로 `/report/{id}?audience=student`로.
- **`/student/welcome` 자체 가드**: 세션 없으면 로그인으로. 이미 `onboardedAt` 있고 `?replay=1`이 아니면 리포트로 자동 이동(직접 URL 접근 방어).

### 화면 (`/student/welcome` — 단계형 캐러셀)
- 단계(읽고 닫기, 좌우 이동·진행 점·우상단 [건너뛰기]):
  1. **환영** — 이름·센터·이용 시작일 + 환영 문구.
  2. **출결** — QR로 등/하원 찍는 법, 순공 시간 기록.
  3. **리포트** — 내 진도·성적·순공·랭킹 보는 곳.
  4. **신청·소통** — 휴가/반차·상담 예약·메시지(담당 코멘터).
  5. **도시락** — 주간 도시락 신청.
  6. **쿠폰** — 미션·쿠폰 교환.
  7. **모의고사** — `contact`에 공무원/경찰/소방/수능 포함 시에만 노출(아니면 단계에서 제외, 진행 점도 그에 맞게).
  8. **마무리** — 출결번호 안내 + "시작일부터 이용 가능, 궁금하면 메시지" → **[시작하기]**.
- 스타일: iOS26 글래스. 보라/인디고 금지. 사진 필요한 곳은 placeholder. 글 많은 곳은 시각화 대체 가능(iOS26 유지).

### 완료 처리
- [시작하기] 또는 [건너뛰기] → `POST /api/student/onboarding`(본인 세션) → `student_state.onboardedAt = ISO` → `/report/{id}?audience=student`로 이동.
- 멱등: 이미 설정돼 있어도 안전(덮어쓰기 무해, 또는 기존 값 유지).
- **replay 모드**(`?replay=1`): 단계는 동일하게 보여주되, 닫으면 플래그를 다시 쓰지 않고 리포트로 복귀.

### "사용법 다시보기" 재진입
- 학생 리포트(student audience)의 눈에 띄지 않는 자리(예: 알림/메뉴 영역 또는 하단)에 작은 항목 추가 → `/student/welcome?replay=1` 링크.

### 컴포넌트 (단일 책임)
- `app/student/welcome/page.tsx` — 서버 진입 가드(세션·onboardedAt·replay 분기) + 클라이언트 캐러셀 마운트.
- `components/student/welcome-carousel.tsx` — 단계 캐러셀(프레젠테이션 + 완료 호출). props로 학생 표시값(name/campus/시작일/showMock)을 받음.
- `lib/onboarding.ts` — 순수 헬퍼: `shouldShowMockStep(contact?: string): boolean`(공무원/경찰/소방/수능 substring), `buildWelcomeSteps(...)` 등 단계 구성 순수 로직.
- `app/api/student/onboarding/route.ts` — `POST` 본인 세션 → `markStudentOnboarded`.
- `lib/store.ts` — `markStudentOnboarded(studentId): Promise<...>` (student_state 병합 저장, 기존 student_state 보존).
- `app/student/page.tsx` — 분기 추가(학생 조회 후 onboardedAt 검사).
- 리포트 측 — "사용법 다시보기" 링크 1개 추가(use-report-state early-return/기존 흐름 미변경, 링크만).

## 데이터 흐름
```
첫 로그인 → app/student/page.tsx (onboardedAt 없음) → /student/welcome
  → 캐러셀 [시작하기/건너뛰기] → POST /api/student/onboarding (student_state.onboardedAt set)
  → /report/{id}
이후 로그인 → onboardedAt 있음 → 곧장 /report/{id}
재열람 → 리포트의 '사용법 다시보기' → /student/welcome?replay=1 → 닫으면 리포트(플래그 변화 없음)
```

## 에러 처리
- 학생 조회 실패/세션 없음 → 로그인으로. POST 실패 시 토스트 + 그래도 리포트로 이동(온보딩이 진입을 막지 않음).
- `contact` 없거나 매칭 안 되면 모의고사 단계 자동 생략(에러 아님).

## 검증
- 순수 헬퍼 단위테스트(`scripts/verify-onboarding.mts`): `shouldShowMockStep`(4직렬 substring·미매칭), 단계 구성에서 모의고사 포함/제외.
- API 멱등 E2E(격리 local-json): onboarded 설정→재호출 무해, student_state 다른 키 보존.
- `tsc` + build. 시각·실제 흐름 확인은 사용자 몫(iOS26).

## 영향 받는 파일
- `app/student/welcome/page.tsx` — 신규(가드 + 마운트)
- `components/student/welcome-carousel.tsx` — 신규(캐러셀)
- `lib/onboarding.ts` — 신규(순수 헬퍼)
- `app/api/student/onboarding/route.ts` — 신규(POST)
- `lib/store.ts` — `markStudentOnboarded`
- `app/student/page.tsx` — 진입 분기
- 리포트 측 1곳 — '사용법 다시보기' 링크

## 범위 밖 (YAGNI)
- 첫행동 체크리스트·진행률·게이미피케이션
- OT 자동연결(별도 사이클)·가입폼 개선(별도)
- 신규생 초기설정 마법사(목표·교재 입력) — 별도
