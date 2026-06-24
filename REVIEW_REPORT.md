# SSC 스파르타 — 출시 전 최종 점검 리뷰 보고서

> 20개 전문 렌즈 멀티에이전트 리뷰(11개 렌즈 응답, 104개 고유 findings) + 코드 직접 검증.
> 작성: 출시 전 점검 / 브랜치 `refactor/pre-launch-review`. 기준선: `tsc --noEmit` 0 에러.

## 요약

가장 시급한 것은 **보안·데이터 손실·전역 무음 피드백** 클러스터다. 기능 완성도는 높으나,
공유 리포트 접근제어가 사실상 열려 있고(IDOR), 어드민이 학생을 저장할 때마다 학부모 공유
비밀번호가 지워지며, sonner 토스트가 전역에서 한 번도 마운트되지 않아 모든 성공/실패 피드백이
조용히 사라진다. 이 셋은 출시 차단(P0)이다.

| 등급 | 정의 | 건수(대표) |
|---|---|---|
| **P0** | 출시 차단 — 보안/데이터손실/빌드실패/무음 핵심 피드백 | 9 |
| **P1** | 출시 전 강력 권장 — 명확한 결함/위반/마찰 | 다수 |
| **P2/P3** | 구조 개선·일관성·정리 | 다수 |

검증 표기: ✅ 코드로 직접 확인 / ◐ 강한 정황(해피패스는 안전하나 방어 필요).

---

## P0 — 출시 차단 (반드시 수정)

### P0-1. 공유 리포트 IDOR — 토큰/비밀번호 없이 PII 노출 ✅
`app/api/report/[id]/route.ts:116-124`
- `?audience=parent`(기본값)로 **토큰·세션 없이** 요청하면 line 126으로 떨어져 마스킹된 학생
  전체(이름·연락처·소견·상담로그·성적)를 반환. 주석이 "세션 없는 비로그인 학부모 접근 허용"으로
  의도된 구멍. 학생 id만 알면 누구나 PII 조회 → share-token+비밀번호 체계가 무의미.
- **수정**: 토큰 없는 parent 접근도 기본 차단. 토큰 없으면 `canViewStudent`(관리자/본인)만 허용,
  공개 공유는 유효 token+비밀번호 경로로만. [S]

### P0-2. 공유 비밀번호 우회 — hash 없으면 무검사 통과 ✅◐
`app/api/report/[id]/route.ts:77-87`
- 비밀번호 비교가 `if (student.sharePasswordHash)` 안에서만 수행. hash가 falsy면 임의 pw로 통과.
  share-token 생성은 항상 hash를 넣어 해피패스는 안전하나, 레거시/부분저장 데이터에서 무방비.
- **수정**: `if (!hash || !compare(pw,hash)) return 403` — "hash 없음 = 인증 실패". [S]

### P0-3. 학생 세션 쿠키 미서명 — 타 학생 사칭 ✅
`app/api/student/auth/login/route.ts:60` · `lib/auth.ts:11-13`
- `student-session` 쿠키에 학생 id를 **평문** 저장, `getStudentSessionId`가 무검증 신뢰.
  로그인한 학생이 devtools로 쿠키 값을 다른 id로 바꾸면 그 학생으로 완전 사칭(리포트·진도·성적).
- **수정**: 쿠키 값을 `id.HMAC-SHA256(id, SECRET)`로 서명 발급, 읽을 때 서명 검증 후 id 도출. [M]

### P0-4. sonner Toaster 전역 미마운트 — 모든 토스트 무음 ✅
`app/layout.tsx` (그리고 `app/admin/layout.tsx`)
- 어느 레이아웃에도 `<Toaster/>`가 없음. 그런데 `toast.*` 호출은 앱 전반(뽀모도로 6곳,
  student-detail-sheet 82곳, dashboard 등 16+파일). 학생이 50분 완주 후 저장 실패해도, 어드민이
  저장/삭제해도 **성공·실패 피드백이 전혀 안 뜸**.
- **수정**: 루트 레이아웃에 `<Toaster richColors />` 1회 마운트. [S]

### P0-5. 전체-행 upsert가 학부모 공유 비밀번호를 삭제 ✅
`lib/supabase.ts:101` (`studentToRow`) · `app/api/admin/students/[id]/route.ts`
- GET은 `sharePasswordHash`를 응답에서 제거 → 클라가 그 객체를 spread해 PUT → `studentToRow`가
  `share_password: sharePasswordHash || null`을 **항상** 페이로드에 포함 → null로 덮어씀.
  즉 어드민이 학생을 한 번이라도 저장하면 기존 학부모 링크 비밀번호가 소멸.
- **수정**: 공유 컬럼(`share_token`/`share_token_expires_at`/`share_password`)을 `studentToRow`에서
  제외. 이 컬럼들은 share-token 라우트의 `patchSupabaseToken`이 전담(이미 직접 update). [M]

### P0-6. specialNote 컬럼 오버로드 — 어드민 메모가 리워드 JSON 파괴 ✅◐
`components/admin/detail-tabs/info-tab.tsx:286` · `lib/rewards-service.ts` · `app/api/student/pomodoro/route.ts`
- `specialNote`가 (a) 학생 리워드/뽀모도로 JSON 상태와 (b) 어드민 평문 메모 두 용도로 충돌.
  어드민 메모 textarea가 원시 JSON을 그대로 바인딩 → 어드민이 메모 저장 시 학생의 뽀모도로/리워드/
  체크리스트 상태가 평문으로 덮여 소멸. 어드민에겐 JSON이 그대로 노출.
- **수정(단기)**: 어드민 메모를 `noteObj.noteText`에 read/merge로 저장하도록 양쪽 경로 일치.
  **(근본)** 리워드 상태를 별도 JSONB 컬럼으로 분리. [L]

### P0-7. student/suggestions 인증 우회 — 비로그인 임의 학생 쓰기/삭제 ✅
`app/api/student/suggestions/route.ts:14-18, 51-55`
- 다른 모든 student/* 라우트는 세션 없으면 401인데, 이 라우트만 `sessionStudentId || body.studentId`로
  폴백. 비로그인 사용자가 studentId만 알면 임의 학생 consultationLogs에 건의 삽입/삭제 가능(IDOR).
- **수정**: 세션 필수로 통일, body/query의 studentId 폴백 제거. studentId는 세션에서만 유도. [S]

### P0-8. useSearchParams Suspense 경계 부재 — 프로덕션 빌드 차단 위험 ✅◐
`app/report/[id]/page.tsx` · `hooks/use-report-state.ts:72`
- 훅이 `useSearchParams()`를 호출하는데 리포트 페이지가 `<Suspense>`로 감싸지 않음. Next 16에서
  `next build` 시 정적 생성 단계 에러 가능. dev는 통과하나 배포 빌드가 막힐 수 있음.
- **수정**: 페이지를 외부 default(=`<Suspense>` 래퍼) + 내부 본문으로 분리. attend/consultation 패턴 동일. [S]

### P0-9. typescript.ignoreBuildErrors — 타입 회귀가 프로덕션 유입 ✅
`next.config.mjs:4`
- 빌드에서 타입 검사를 끈 상태. God 훅/시트 분해 리팩터 중 타입 회귀가 빌드에서 안 걸러짐.
- **수정**: CI에 `tsc --noEmit` 게이트 추가(현재 0 에러). 출시 전 ignoreBuildErrors 해제 검토. [S]

---

## P1 — 출시 전 강력 권장

### 보안·검증
- **이름 기반 로그인 공격면**(`student/auth/login:35,71-96`): 이름+약한 비번(최소 4자) 무차별 대입 용이.
  login_id 전용화 또는 8자+정책. [M]
- **레이트리밋 적용 협소**(`lib/rate-limit.ts`): login 2 + attend 1에만. 인증된 변이 라우트(grades/leave/
  requests/progress/pomodoro/checklist) 무보호. 주요 변이 라우트에 학생ID/IP 키 추가. [M]
- **clientIp가 x-forwarded-for 맹신**(`rate-limit.ts:26-30`): 헤더 위조로 레이트리밋 우회. 신뢰 프록시
  헤더만 사용. [S]
- **입력 상한 부재**: 뽀모도로 minutes 상한 없음→리워드 어뷰징(`pomodoro/route.ts:45`), checklist
  sleepHours 범위 미검증(`checklist/route.ts`), incorrectTags 오버포스팅(`progress/route.ts:120`). 클램프/검증. [S]
- **admin requests/leave 응답에 sharePasswordHash 미마스킹**(`requests/route.ts:227`): GET과 정책 불일치. [S]
- **세션 쿠키 sameSite=lax**: 상태변경 API CSRF 여지. strict 또는 Origin 검증. [S]

### 런타임 버그·데이터 정합성
- **currentSubjectText 미반환 → 홈 카드 공백**(`use-report-state.ts:943` 계산하나 return 누락,
  page.tsx:88/263에서 사용). return에 추가. [S] ✅
- **진도/플랜 완료 저장 실패 무음**(`use-report-state.ts:522-549` catch noop): toast.error/롤백. [M]
- **뽀모도로 완료 비정상 응답 시 타이머 0에 멈춤**(`pomodoro-timer-modal.tsx:166-189`): else 피드백. [S]
- **전체-행 upsert 낙관적 잠금 부재**(`supabase.ts:161`): 동시 쓰기 last-write-wins로 유실. updated_at
  기반 낙관적 잠금/부분 update. [L]
- **leave_coupons 비원자적 증감**(`rewards-service.ts:119`), **수동출결 delete+insert 비원자적**
  (`store.ts:134`), **checkIn 중복 세션 방어 부재**(`supabase.ts:251`). RPC/유니크 인덱스로 원자화. [M]

### 학부모/학생 분리(권한·UX)
- **학부모 화면에 학생 전용 '학습 요청' 폼 노출·작동**(`execution-plan-tab.tsx:181`): `{isStudentReport && …}`
  게이트. [S]
- **학부모 목차에 없는 탭이 본문엔 노출**(`use-report-state.ts:1282`): timetable/execution-plan 위계 불일치. [M]
- **PIN 입력 type=number**(`report/[id]/page.tsx:142`): `type=text inputMode=numeric autoComplete=one-time-code`. [S]

### 색상(AGENTS.md 위반)
- **인디고 — 출결 '복귀'**(`attend/page.tsx:219-220`) + **키오스크 return**(`kiosk/page.tsx:323,337,344`):
  4계열로 치환(두 파일 동시, 복귀=정보 파랑 또는 완료 emerald 통일). [S] ✅
- **violet — 휴가 by-date '야간'**(`leave/by-date/page.tsx:469,476`): 금지색 제거. [S] ✅
- **#F56300 의미 충돌**(`leaderboard-card.tsx`): amber(주의)가 성취 강조에도 쓰임 → 성취는 emerald/파랑. [M]
- **amber 표기 혼용**(`dashboard:903…`): #F56300/amber-*/orange-* 혼재 → 단일 토큰. [M]

### 접근성(a11y)
- 폼 label-컨트롤 미연결(`execution-plan-tab.tsx:275+`, `home-overview-tab.tsx:182` 체크박스). htmlFor/label. [S]
- 클릭 가능한 span 키보드 불가(`pomodoro-timer-modal.tsx:356`). button/role+tabindex. [S]
- 커스텀 드롭다운 Esc/외부클릭/포커스 관리 부재(`student-layout.tsx:155-295`). [M]
- 전체잠금 오버레이 포커스 트랩 부재(`student-layout.tsx:122`). [M]
- outline-none 후 focus-visible 대체 링 부재(`student-layout.tsx:309,317` + globals.css 전역 부재). [S]
- prefers-reduced-motion 미대응(globals.css). [S]

### 위험 액션·에러 처리
- **성적 삭제 확인 없음**(`grades-tab.tsx:197`), **교재/인강 삭제 확인 없음**(`progress-tab.tsx:1004,1400`):
  AlertDialog/confirm + undo. [S]
- **student/* 라우트 try/catch 부재**(`progress/route.ts` 등): 예외 시 비정형 500. 통일된 에러 셰이프. [M]
- **app/에 loading/error/not-found 전무**: 브랜드 폴백/에러바운더리 추가. [M]

### 성능
- **God 훅 메모이제이션 0**(`use-report-state.ts:768-1406`): weeklyDailyPlans 등 무거운 파생을 매 렌더
  재계산 + 90+ 값/핸들러 매번 새 참조 → 6개 탭 전부 리렌더. 30초 출결 폴링이 전체 재계산 유발.
  useMemo/useCallback. [L]
- **리포트 탭 전체 상시 마운트**(hidden 토글) + **recharts/PomodoroTimer 정적 import**: dynamic + 조건부 마운트. [M]
- **어드민 4311줄 시트가 모든 어드민 페이지에 상시 마운트**(`admin/layout.tsx`): dynamic + open 시에만. [M]
- **대시보드 focus/visibility마다 전 학생 재페치+재연산**(`dashboard:173`): 쓰로틀 + useMemo. [M]

---

## P2/P3 — 구조 개선·정리

### 구조 분해(God 파일)
- `components/admin/student-detail-sheet.tsx` **4311줄/useState 96개** — 도메인 훅으로 분해
  (useProgressEditor/useMaterialSearch/useConsultationDraft/useGradesEditor/useShareSettings). [L]
- `components/admin/detail-tabs/progress-tab.tsx` **1789줄/118KB** — 시트 분해의 복잡도가 그대로 이동.
  SubjectCard/MaterialSearchDropdown/QuickPlanEditor/DetailedPlanTable/ReviewPassSettings로 재분해. [L]
- `detail-sheet-context.tsx:24` **[key:string]:any** 컨텍스트로 ~100개 값 전달 → 타입 사각지대. 명시 타입/도메인 분할. [M]
- `use-report-state.ts` **1406줄 God 훅**, `as any` 반환이 리포트 전체 타입검사 무력화. ReportState 타입 명시. [M]
- 대시보드 5개 지표 카드 인라인 반복 → `<MetricCard/>` 추출. [M]
- `getAnalysisData` ~245줄 인라인 → `lib/analysis.ts` 순수 함수 + useMemo. [M]
- 진도 증감/디바운스 저장이 consultation·시트에 이중 구현 → 공용 훅/순수 함수. [M]
- `learningConsultationPanel` 250줄 render-as-variable → 컴포넌트 승격. [M]

### 데드코드·정리
- **`ssc-spartaa-main/` 중첩 복사본**(32MB/210파일 git 추적): 삭제. 금지색 grep 거짓양성·번들 노이즈 원인. [S] ✅
- 루트 흩어진 `test-*.js`, `*.png`, `*.log`, `screenshot_error.png`: 정리/ignore. [S]
- `styles/globals.css` 죽은 파일(import 안 됨). [S]
- 서울 날짜 유틸 3곳 중복(`supabase.ts`/`rewards-service.ts`/`pomodoro/route.ts`) → 단일화. [S]

### 타입·일관성
- 클라가 API 응답을 무검증 `json.data`로 상태 주입(`use-report-state.ts:282`). 런타임 파서/타입 가드. [M]
- `rowToStudent(r:any)` jsonb 무검증 매핑(`supabase.ts:34`). 정규화/가드. [M]
- `tsconfig exclude`에 `scripts` 추가로 신규 .ts 스크립트 타입검사 누락 → `scripts/**/*.js`로 좁히기. [S]
- API 응답 셰이프/메서드 가드/route segment config 일관성. [S]
- saveSharedMaterial `.or()`에 사용자 입력 보간(필터 인젝션/오매칭)(`supabase.ts:379`). 분리 쿼리/이스케이프. [S]
- 순공 합계 클라이언트 합산(1000행 절단 위험)(`supabase.ts:302`). SQL group by RPC. [M]
- local-json writeDb 비원자적 전체 덮어쓰기(`db.ts:191`). tmp+rename. [M]

---

## 반영 계획(배치) — 공격적 전면 반영

각 배치 후 `tsc --noEmit` + 영향 라우트 dev 프리뷰(콘솔 에러 0)로 회귀 확인.

1. **배치 A — P0 보안/데이터/무음(최우선)**: P0-1~5,7,8 + Toaster. 대부분 S/M·저위험.
2. **배치 B — P1 런타임 버그·권한·색상·a11y·위험액션**: currentSubjectText, 학부모 폼 게이트,
   인디고/violet 치환, 삭제 확인, PIN 입력, 입력 클램프, focus-visible/reduced-motion.
3. **배치 C — 데드코드 정리**: 중첩 디렉터리·루트 스트레이·죽은 CSS 제거.
4. **배치 D — 구조 분해/성능(고위험·고노력)**: God 훅 메모이제이션, dynamic import, 시트/탭 재분해.
   영향범위 명시·프리뷰 게이트하에 진행. 잔여는 후속 과제로 `LAUNCH_CHECKLIST.md`에 기록.

> 데이터 계층 원자성(낙관적 잠금/RPC/유니크 인덱스)은 DB 마이그레이션을 수반해 회귀 위험이 커서,
> 코드 수정과 분리해 마이그레이션 항목으로 별도 정리(출시 후 우선 후속).
