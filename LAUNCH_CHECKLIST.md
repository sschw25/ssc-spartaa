# 출시 전 최종 점검 체크리스트 — 반영 결과 & 잔여 과제

> 브랜치 `refactor/pre-launch-review`. 진단은 [REVIEW_REPORT.md](REVIEW_REPORT.md) 참조.
> 검증 게이트: `tsc --noEmit` 0 에러 · `next build` 통과(타입 게이트 ON) · 앱 화면 금지색 grep 0 · dev 프리뷰 핵심 흐름 콘솔 에러 0.

---

## ✅ 반영 완료 (검증됨)

### P0 — 보안 / 데이터 손실 / 무음 피드백
- [x] **공유 리포트 IDOR 차단** — 토큰 없는 `audience=parent` 직접 접근을 `canViewStudent`(관리자/본인)만 허용.
  익명 접근은 401. `app/api/report/[id]/route.ts`. **런타임 검증**: 익명 요청 → `HTTP 401`.
- [x] **공유 비밀번호 우회 차단** — `sharePasswordHash` 없으면 통과가 아니라 거부(403). 같은 파일.
- [x] **학생 세션 쿠키 HMAC 서명** — `student-session`에 평문 id 대신 `id.HMAC` 저장·검증.
  쿠키 위조로 타 학생 사칭 불가. `lib/auth.ts`(`signStudentSession`/`getStudentSessionId`), 로그인 라우트.
  레거시 평문 쿠키는 거부(재로그인 필요). `STUDENT_SESSION_SECRET` 미설정 시 `ADMIN_SESSION_SECRET` 폴백.
- [x] **sonner Toaster 전역 마운트** — `app/layout.tsx`. **검증**: DOM에 알림 region 존재. 이제 모든 성공/실패 토스트 표시.
- [x] **학부모 공유 비밀번호 보존** — `studentToRow`에서 `share_*` 컬럼 제거(upsert가 누락 컬럼 보존).
  어드민 저장이 학부모 비밀번호를 null로 덮어쓰던 데이터 손실 제거. `lib/supabase.ts`.
- [x] **specialNote 오버로드 해소** — 어드민 메모는 `noteText`만 편집·머지, 리워드/뽀모도로 JSON 봉투 보존.
  `extractAdminNote`/`mergeAdminNote`. `components/admin/student-detail-sheet.tsx`.
- [x] **suggestions 인증 우회 차단** — 세션 필수, `body/query.studentId` 폴백 제거. `app/api/student/suggestions/route.ts`.
- [x] **Suspense 경계** — `/report/[id]`를 `<Suspense>`로 래핑. **build 검증**: 라우트 `ƒ Dynamic` 정상 생성.
- [x] **빌드 타입 게이트 ON** — `next.config.mjs` `ignoreBuildErrors: false`. **build 검증**: 통과.

### 🐞 E2E 중 발견·수정한 실재 버그
- [x] **학부모 비밀번호 게이트 작동 불능** — `use-report-state` early-return 객체에 `shareTokenParam`·
  `setSharePasswordError`가 누락돼(`as any`가 가림) 공유 링크가 **영구 로딩**에 빠지고 비밀번호 입력창이
  뜨지 않던 버그. 반환에 두 값 추가. **검증**: `?token=…` 접속 시 "리포트 비밀번호" 게이트 정상 렌더.

### P1 — 런타임 버그 / 권한 / 색상 / 검증 / a11y
- [x] **currentSubjectText 미반환** — 훅 return에 추가, 홈 '지금 할 공부' 카드 공백 해소.
- [x] **학부모에 학생 전용 요청 폼 노출** — `execution-plan-tab` 요청 패널을 `{isStudentReport && …}`로 게이트.
- [x] **PIN 입력** — `type=number`→`text inputMode=numeric autoComplete=one-time-code`. **검증**: 속성 반영 확인.
- [x] **금지색 제거** — 출결/키오스크 '복귀' indigo→blue, 휴가 by-date '야간' violet→emerald. **검증**: 앱 화면 grep 0.
- [x] **입력 검증 클램프** — 뽀모도로 분 1~120, 수면시간 0~24, 오답태그 엔트리 50개·값 정규화. 리워드 어뷰징/오버포스팅 차단.
- [x] **위험 액션 확인** — 성적 삭제, 교재·인강 삭제(진도·계획·회독 연쇄 삭제 경고)에 confirm.
- [x] **키보드 포커스 가시성** — `globals.css` 전역 `:focus-visible` 링(outline-none 요소도 보강).

### 정리
- [x] **중첩 복사본 디렉터리 제거** — `ssc-spartaa-main/`(210파일·32MB, git 추적) 삭제. import 0건 확인 후 `git rm`.
- [x] 임시 점검 로그/산출물 정리.

---

## ✅ 결정됨
- [x] **마케팅 페이지 보라/인디고 = 유지** — `components/ssc/*`(brain-science, comparison-section)의 다크테마
  브랜드 그라데이션은 의미색 KPI가 아닌 **장식**이므로 그대로 둔다(사용자 결정, 2026-06).
  AGENTS.md 색상 규칙은 앱 화면(admin/attend/report)에만 적용 — 앱 화면은 금지색 0 확인됨.
  ※ 출시 전 금지색 grep은 `components/ssc` 제외하고 돌릴 것.

---

## ⏭ 잔여 과제 (미반영 — 위험/범위로 분리, 우선순위순)

대규모 구조분해·메모이제이션은 회귀 위험이 커(이번에 진행 중 리팩터가 실제 버그를 유입한 정황 확인),
막판 일괄 적용 대신 별도 PR로 프리뷰 게이트하에 진행 권장.

### 출시 직후 우선
- [ ] **God 훅 메모이제이션** — `use-report-state.ts` 무거운 파생값 `useMemo`, 핸들러 `useCallback`,
  30초 출결 폴링과 시계 tick 분리. 6개 탭 전체 리렌더 제거. [L·고위험]
- [ ] **lazy 로딩** — recharts(성적탭)·PomodoroTimer·어드민 `StudentDetailSheet`를 `next/dynamic`,
  비활성 탭은 조건부 마운트. 리포트/어드민 초기 번들 축소. [M]
- [ ] **student/* 라우트 try/catch 통일** — store 예외 시 `{success:false}` JSON으로 표준화. [M]
- [ ] **공유 비밀번호 무차별 대입 방어** — token+IP 단위 rate-limit, 변이 라우트 전반으로 rate-limit 확대. [M]
- [ ] **clientIp 신뢰 경계** — `x-forwarded-for` 맹신 제거(신뢰 프록시 헤더만). [S]

### 데이터 계층 (DB 마이그레이션 동반 — 별도 작업)
- [ ] 전체-행 upsert 낙관적 잠금(updated_at/version), leave_coupons 원자적 증감(RPC),
  수동출결 delete+insert 원자화, 열린 세션 부분 유니크 인덱스. [L]
- [ ] `saveSharedMaterial` `.or()` 필터 인젝션(분리 쿼리/이스케이프), 순공 합계 SQL group by(1000행 절단 방지). [S~M]

### 구조 / 타입 / a11y
- [ ] God 파일 분해: `student-detail-sheet`(4300줄, useState 96개)→도메인 훅, `progress-tab`(1789줄)→하위 컴포넌트,
  `use-report-state` 반환 타입 명시(`as any` 제거 → 누락 키를 빌드가 차단). [L]
- [ ] `detail-sheet-context` `[key:string]:any` 제거. [M]
- [ ] a11y: execution-plan 폼 `label htmlFor` 연결, pomodoro 클릭 span→button,
  커스텀 드롭다운/잠금 오버레이 Esc·포커스 트랩. [S~M]
- [ ] `app/`에 `loading.tsx`/`error.tsx`/`not-found.tsx`, 어드민 서버사이드 게이트(middleware). [M]
- [ ] `#F56300`(amber) 성취/경고 의미 충돌 분리, amber-*/orange-*/#F56300 표기 단일화. [M]
- [ ] 클라 API 응답 런타임 검증(zod), `rowToStudent(r:any)` 정규화. [M]
- [ ] 잔여 정리: 루트 `test-*.js`·스크린샷, `styles/globals.css`(죽은 파일), 서울 날짜 유틸 3중복 단일화,
  `tsconfig exclude`를 `scripts/**/*.js`로 좁히기. [S]

---

## 출시 전 최종 확인 명령
```
npx tsc --noEmit         # 0 에러
npm run build            # 통과(타입 게이트 ON)
grep -rE "purple|indigo|violet|862bf7|-(450|650|750|850)" app components  # 앱 화면 0 (마케팅 결정 후)
# dev 프리뷰: 학부모 토큰 링크→비밀번호 게이트, 학생 로그인, 어드민 저장 토스트, 키오스크 출결
```
