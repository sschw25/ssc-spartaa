# 학습 벤치마크 (교재·강의 데이터 비교) — 설계 문서

- 작성일: 2026-07-01
- 상태: 승인 대기(스펙 리뷰) → 이후 구현 계획(writing-plans)
- 관련 브랜치: (신규 예정)

## 1. 배경 / 문제

학생들이 같은 교재·강의를 공부하면서 진도, 배속, 소요 기간 등의 데이터가 쌓인다.
그러나 지금은 이 데이터를 **교재/강의 단위로 학생 간 비교**하는 기능이 없다.
(존재하는 비교 기능은 QR 등하원 기반 "순공 시간 랭킹"뿐 — `components/report/leaderboard-card.tsx`, `components/admin/admin-leaderboard.tsx`.)

목표: 같은 교재·강의를 공부한 다른 학생들의 데이터를 **익명 집계 평균**으로 보여줘서

- 이 교재/강의를 하면 보통 진도가 밀렸는지 / 생각보다 빨리 끝냈는지
- 가장 많이 쓴 배속(강의)
- 걸린 기간(달력)
- 몇 월에 많이 들었는지 + **지금 내 속도가 상대적으로 어떤지**

를 관리자와 학생 모두 확인하게 한다. 특히 **늦게 시작한 학생의 효능감**(달력상 늦어도 시작 후 경과 기준으로는 앞설 수 있음)을 지켜주는 것이 핵심.

## 2. 사용자 결정 사항 (확정)

| 항목 | 결정 |
|---|---|
| 집계 대상 필터 | **성실 진행자 포함** (완료자 + 진행중이라도 방치 아닌 학생). 밀려서 방치·장기 미입력만 제외 |
| "걸린 시간" 정의 | **달력 기간**(시작일~완료일, 평균 주수) |
| 상대 속도 / 시즌 | **시작 후 경과 기준 정규화**, **표(table)** 로 제시 |
| 최소 표본 | **4명** (3명 이하 미표시) |
| 캠퍼스 범위 | **전체 학원 통합**(원주·춘천·충주 합산) |
| 톤 | 학생 화면도 **존댓말/격식체** ("너" 등 반말 금지) |

## 3. 데이터 근거 (기존 코드)

모든 필드는 `students.subjects`(JSONB, 단일 소스) 안에 존재. 타입: `lib/types/student.ts`.

- `BookProgress`: `title`, `totalPages`, `currentPage`, `targetDate`, `unit`, `estimatedMinutesPerUnit`, `detailedPlans[]`, `updatedAt`
- `LectureProgress`: `name`, `totalLectures`, `completedLectures`, `targetDate`, `estimatedMinutesPerUnit`, **`speedMultiplier`**, `detailedPlans[]`, `updatedAt`
- `DetailedPlan.dailyCompletions`: `Record<YYYY-MM-DD, { isCompleted, actualAmount?, completedAt? }>` — **완료 날짜의 실제 근거**
- `SharedMaterial`: 공유 자료 DB(`id`, `type`, `name`, `subject`, `publisher`, `author`, `totalPagesOrLectures`). 단, 학생 진도 항목은 이 id로 **연결돼 있지 않고 이름만 복사**됨.
- 진도 상태 판정: `lib/progress-plan.ts` → `getExpectedFromPlans()`(export), 상태 `ahead/on-track/behind`. 재사용.
- 캠퍼스 스코프 유틸: `lib/campus-scope.ts` (기존).

## 4. 집계 대상 필터 — "성실 진행자"

교재/강의별로 각 학생의 항목 `E`가 **아래 둘 다** 만족하면 벤치마크 표본에 포함한다.

1. **실제 시작**: 진도 > 0 (books: `currentPage>0`, lectures: `completedLectures>0`) 또는 완료된 세부계획/일일완료 기록이 1개 이상.
2. **방치 아님**: 100% 완료했거나, **마지막 활동일이 최근 21일 이내**.
   - 마지막 활동일 = `max(모든 dailyCompletions.completedAt, E.updatedAt)`.
   - 21일은 상수로 시작하되 `app_settings` 키(`benchmark_abandon_days`)로 오버라이드 가능하게 둔다(기본 21).

포함 제외 예: 진도 0(등록만), 밀린 채 3주 넘게 미입력(방치).

### 완료자 하위표본

- `completers` = 표본 중 100% 도달한 학생(`currentPage>=totalPages` / `completedLectures>=totalLectures`).
- **걸린 기간·목표일 대비** 지표는 completers만으로 계산(정확도).
- completers < 4 이면 그 두 지표만 숨기고, 나머지 지표는 표본(≥4)이면 표시.

## 5. 동일성 키 (그룹핑)

`materialKey = `type` | 정규화(subject) | 정규화(name)`

- 정규화: `trim` → 소문자 → 연속 공백 1칸 → 흔한 문장부호 제거.
- 학생 항목 이름이 `SharedMaterial`의 name과 정규화 후 정확히 일치하면 그 공유자료를 **표준 표시명**으로 사용.
- 한계(v1 감수): 오타·약칭(예: "수능특강 수학1" vs "수특 수1")은 다른 그룹으로 갈릴 수 있음. 후속에서 공유DB 매핑 강화로 개선.

## 6. 집계 지표

표본(`n`) ≥ 4일 때만 카드 전체를 노출. 각 지표 산출:

| 지표 | 산출 | 대상 |
|---|---|---|
| 학습자 수 / 완료자 수 | 표본·completers 크기 | 전체 |
| 가장 많이 쓴 배속(최빈 + 평균) | `speedMultiplier` 분포 | **강의만** |
| 평균 소요 기간 | mean(완료일 − 시작일), 주 단위 | completers(≥4) |
| 목표일 대비 | mean(완료일 − `targetDate`) → "평균 N일 빨리/늦게" | completers(≥4) |
| 계획 준수 분포 | 앞섬 / 진행중 / 밀림 비율(`progress-plan` 상태) | 전체 표본 |
| 월별 분포 | 시작 월 히스토그램 → "주로 7~8월(62%)" | 전체 표본 |

- **시작일** = 가장 이른 활동일(첫 `detailedPlan.startDate` 또는 가장 이른 `dailyCompletions` 날짜; 없으면 `updatedAt` 폴백).
- **완료일** = 100% 도달일(마지막 완료 기록의 `completedAt`/날짜).

## 7. 시즌 정규화 상대속도 (개인화, 표)

같은 **"시작 후 경과 주차"** 로 정렬해 비교한다. 달력상 늦게 시작해도 시작 후 같은 시점 진도로 상대 위치를 낸다.

계산:
- 학생 시작일 `S`, 오늘까지 경과 주차 `W = floor((today - S)/7) + 1`.
- 표본 각 학생의 "시작 후 W주차 시점 진도%"를 구해 분포 생성 → 학생의 현재 진도% 백분위(상위 X%).
- 완료까지 예상: 표본 평균 소요 기간 − 학생 경과 기간(대략치).

학생 화면 표 예시(존댓말):

| 구분 | 학생님 | 이 강의 학습자들 |
|---|---|---|
| 시작 시기 | 9월 2주차 | 주로 7~8월 (62%) |
| 시작 후 경과 | 3주차 | — |
| 현재 진도 | 45% | 같은 3주차 평균 38% |
| 상대 위치 | 상위 40% | — |
| 완료까지 예상 | 약 5주 뒤 | 평균 8주 소요 |
| 주로 쓴 배속 | 1.5배 | 최빈 1.5배(평균 1.4배) |

- 표 아래 1줄 요약 문구: "9월에 시작해 달력상 늦지만, 시작 후 같은 시점 기준으로는 평균보다 앞서 있습니다." (상황별 문구 분기)
- 관리자 화면: 해당 학생 기준 이 표 + 원본 집계를 함께 표시.

## 8. 배치 위치

- **관리자**: `components/admin/detail-tabs/progress-tab.tsx` 의 교재/강의 **진도 카드 내부**(빠른입력 아님, "입력된 곳")에 접이식 "학습 벤치마크" 섹션.
- **학생**: `components/report/subject-progress-tab.tsx` 의 교재/강의별 "이 교재/강의, 다른 학생들은?" 섹션.

## 9. 아키텍처

- **순수 집계 엔진**: `lib/learning-benchmark.ts` — 입력(전체 학생 배열, materialKey, 선택적 대상 학생 항목) → 출력(집계 지표 + 개인 비교). 부수효과 없음, 단위 테스트 대상.
- **API**: `GET /api/learning-benchmark?type=&subject=&name=&studentId=&materialId=`
  - 서버가 전체 학생 `subjects`를 스캔(전체 학원 통합)해 엔진 호출.
  - `studentId`가 있으면 개인 비교(§7)까지 포함.
  - 관리자용/학생용 인증 분리: 학생 경로는 **본인 studentId만** 허용(IDOR 방지, 기존 리포트 세션 서명 패턴 재사용).
- **성능**: materialKey별 **짧은 TTL 인메모리 캐시(약 10분)**. 데이터 변화가 느려 충분. 후속으로 크론 프리컴퓨트 여지.
- **프라이버시**: 개인 이름 미노출, `n≥4` 게이트, 평균/분포/백분위만.

## 10. 컴포넌트 경계

| 유닛 | 책임 | 의존 |
|---|---|---|
| `lib/learning-benchmark.ts` | 순수 집계·정규화·시즌 비교 계산 | types, progress-plan |
| `app/api/learning-benchmark/route.ts` | 인증·스코프·캐시·엔진 호출 | 엔진, supabase, campus-scope |
| `components/.../BenchmarkSection`(공유) | 카드 UI(집계 + 표), n<4 폴백 | API |
| progress-tab / subject-progress-tab | 배치·데이터 전달 | BenchmarkSection |

## 11. 비목표(YAGNI)

- 크론 프리컴퓨트/전용 테이블(초기엔 인메모리 캐시로 충분).
- 오타·약칭 자동 병합(v1은 이름 정규화까지).
- 캠퍼스별 분리 뷰(전체 통합만).
- 학생 개별 신원 노출/랭킹(익명 집계만).

## 12. 리스크 / 오픈 이슈

- 이름 기반 그룹핑 정확도(오타 분산). → 공유DB 표준명 우선, 후속 개선.
- 완료일/시작일 추정의 불완전성(오래된 데이터에 `completedAt` 없을 수 있음 → `updatedAt`/날짜키 폴백).
- 시즌 정규화의 표본 희소(특정 W주차 데이터 적을 때) → 인접 주차 묶어 완충하거나 "표본 부족" 표기.

## 13. 테스트 관점

- 엔진 단위테스트: 필터(방치/미시작 제외), completers 분리, 최빈 배속, 월분포, 시즌 백분위, n<4 게이트, completers<4 부분 숨김.
- API: IDOR(타 학생 studentId 차단), 캐시 동작, 스코프 전체합산.
