# UX 개선 4종: 부분 갱신 · 미션 탭 통합 · 부드러운 전환 · 초기 로딩 체감 단축

날짜: 2026-07-02 · 브랜치: worktree-ux-refresh-transitions (base: feature/mission-recommendations 13df4e6)

## 배경 (사용자 요청)

1. 수정/저장할 때 화면 전체가 새로고침되는 느낌 → 그 부분만 갱신되게.
2. 학생 미션이 별도 라우트(/student/missions)로 빠짐 → 다른 기능처럼 리포트 탭으로. 쿠폰 미션도 미션으로 통합.
3. 학생/관리자 페이지 전환이 툭툭 끊김 → 부드럽게.
4. 로그인 후 첫 로딩이 김 → 체감 단축.

## 원인 진단

1. **전체 새로고침 체감**: 관리자 페이지들이 `{loading ? <전체 스피너> : <콘텐츠>}` 패턴. 저장 후
   `await loadXxx()` 재호출·window focus 리스너가 `setLoading(true)`를 켜서 화면 전체가 스피너로
   갈아엎어짐 (consultation:822, seat-board:1469, inbox:958 등 17곳).
2. **미션 분리**: /student/missions 가 독립 풀스크린 라우트. 리포트에는 별도로 '쿠폰 미션' 탭
   (MissionsCard)이 존재. MissionsHub는 이미 MissionsCard를 내부 포함.
3. **전환 끊김**: 관리자 라우트 전환마다 각 페이지가 자체 인증확인(빈 화면) → 전체 fetch → 스피너.
   전환 애니메이션 없음.
4. **첫 로딩**: /api/report/[id] 가 전 학생 로드(getStudents, 벤치마크용) + 순공통계 + 상담예약을
   전부 끝내야 응답 → 클라이언트는 그 전까지 전체 스피너. 리포트 첫 화면에 불필요한
   /api/student/missions 도 초기 fetch에 포함.

## 설계 결정

### 1. 부분 갱신 — "첫 로딩만 스피너, 재조회는 조용히"
각 관리자 페이지의 콘텐츠 스왑 조건을 `loading` → `loading && <데이터 없음>`으로 변경.
데이터가 이미 있으면 화면 유지한 채 백그라운드 재조회(새로고침 아이콘은 계속 회전).
이미 이 패턴인 곳 존재(accounts: `loading && accounts.length === 0`, leaderboard: `loading && !data`).
저장 후 `await load()` 호출부는 그대로 두되 화면이 비지 않게 됨. 레이아웃/디자인 변경 없음.

### 2. 미션 탭 통합
- MissionsHub에 `embedded` prop 추가: 풀스크린 배경/헤더/뒤로가기 제거, 리포트 탭 안에서 렌더.
- 리포트 '쿠폰 미션' 탭(MissionsCard 단독) → '미션' 탭(MissionsHub 전체 = 스트릭+오늘계획+집중포인트+체크리스트+쿠폰미션). 탭 id `student-missions` 유지, 아이콘 Flame.
- 탭 콘텐츠는 첫 활성화 시 마운트(lazy) — 초기 로딩에서 미션 API 제외 (#4에도 기여).
- student-layout의 별도 '미션' 링크(라우트 이동) 제거.
- /student/missions 라우트는 `/report/[id]?audience=student&tab=student-missions` 로 리다이렉트(기존 북마크 호환). use-report-state가 `tab` 쿼리 파라미터로 초기 탭 결정(허용 id 화이트리스트).

### 3. 부드러운 전환
- `app/admin/template.tsx` (+ report 쪽) 추가: 라우트 전환 시 200ms 페이드+살짝 상승 진입 애니메이션. `prefers-reduced-motion` 존중. globals.css(살아있는 유일한 css)에 keyframes.
- 학생 탭 슬라이드는 기존 유지. #1의 조용한 재조회로 관리자 전환 시 스피너 플래시도 감소.

### 4. 초기 로딩 체감
- /api/report/[id] 에 `scope=core|extras` 지원:
  - core: 학생 본문+모의고사+상담예약만 (전학생 벤치마크·순공통계 생략) → 빠른 첫 페인트.
  - extras: materialBenchmarks + studyStats 만.
  - 파라미터 없으면 기존 전체 응답(공유토큰 학부모 경로 등 호환).
- use-report-state: core 도착 즉시 loading 해제·렌더, extras는 백그라운드로 채움(studyStats/벤치마크는 원래 null 허용 설계).
- 전체 경로도 서버에서 상담예약·전학생·통계를 병렬화.
- 학생 로그인 페이지 mount 시 리포트 라우트 번들 prefetch.
- 관리자 dashboard: 인증확인과 학생 로드를 병렬 시작.

## 리스크/한계
- extras 지연 도착 시 순공/랭킹·벤치마크 영역이 잠깐 비어 보임 — 기존에도 실패 시 null 허용이라 UI 깨짐 없음.
- 관리자 silent refresh: 저장 직후 목록이 이전 데이터로 잠깐 보일 수 있으나(수백 ms) 대부분 optimistic 업데이트가 이미 반영.
