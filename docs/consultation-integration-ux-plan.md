최종 보고서를 작성하겠습니다. 재료(기능 매핑·아이디어 풀·3라운드 합의 문서)를 종합해 실행가능한 형태로 정리합니다.

---

# 최종 보고서 — 상담 예약을 축으로 한 기능 연동·UI/UX 증진 설계

작성: PM / 대상: 경영진 · 개발팀 / 기준일: 2026-07-01 / 코드 실측 기반 (회의 라운드 1~3 계승)

---

## 1. 요약 (Executive Summary)

- **상담 예약은 이미 견고한 백엔드를 가졌지만(모든 쓰기 경로에 blackout 재검증), "화면과 연동"에서 새고 있다.** 라이프사이클 이벤트(생성·취소·관리자 시간변경 제안·완료/노쇼)가 학생 알림함과 단절돼 있고, 진도·휴가·OT·모의고사·결석순위 같은 "왜 상담인지"를 만드는 데이터가 예약 화면으로 흐르지 않는다.
- **가장 큰 간극은 두 가지다.** (1) 핵심 표면인 `consultation-booking-panel.tsx`가 `.glass` 유틸 사용 0건 — 6라운드 내내 만질 판이 Liquid Glass가 전혀 아니다. (2) `submitBooking`/`sendReschedule`가 성공·실패 무관 무조건 `refresh()` — 네트워크 실패 시 학생이 고른 date/slot이 통째로 증발하는 **확정 실버그**.
- **연동 기회의 대부분은 신규 인프라 없이 성립한다.** blackout 검증 파이프라인·`grantOtAttendance` 멱등 grant 헬퍼·`createConsultationReminderAlert` SeatAlert 버스·`buildAbsenceRanking` 순수함수·검증 내장 admin 예약 엔드포인트가 모두 재사용 가능하며, **거의 전 항목이 마이그레이션 0**(JSONB 필드 확장으로 회피).
- **학생 접점을 관리자 자동화보다 앞세운다.** 노쇼 1순위 원인은 "내가 안 잡았는데 확정됨"(대리/자동 예약 출처 미표기)이므로, 예약완료 카드 source 분기와 낙관적 복구를 최우선에 둔다.
- **낙인 차단은 UX가 아니라 제품 생존이다.** 학생에게 점수/위험도 절대 비노출, 관리자 내부 reason ≠ 학생 표시 문구를 순수함수 레이어로 구조적으로 분리한다.

---

## 2. 상담 기능을 축으로 한 타기능 스마트 연동 설계

각 연동은 **[무엇을 / 왜 / 어떻게 / 연결기능 / 필요 데이터·마이그레이션 / 노력·임팩트]** 로 기술한다. 회의에서 로직 본체는 "정합성/자동화 트랙"으로 이월됐고 이 보고서는 화면 산출물을 포함해 전체 설계를 종합한다.

### 연동 1 — 승인휴가·OT 충돌 가드 (blackout 원칙의 대칭 확장) 【A1】

| 항목 | 내용 |
|---|---|
| **무엇을** | 상담 예약 date+slot이 그날 승인된 fullday/병가/해당 반차 교시 또는 학생 campus의 OT일과 겹치면 차단하거나 확인 요구 |
| **왜** | `app/api/student/consultation-booking/route.ts`에 leave 참조가 **0건** — "오후반차 승인일 오후 상담" 같은 모순·고아 예약이 무방비. 상담은 이미 blackout을 모든 쓰기경로에 거는데 leave/OT만 비대칭 |
| **어떻게** | POST와 PATCH(action=request/approve) 세 경로에서 `getBookableCalendar` 재호출 지점 옆에 `approvedLeavesOn(student,date)` + `leaveKindCoversPeriod`를 조회. `CONSULTATION_SLOT_TIMES`(HH:MM)를 교시 idx로 매핑(오전<11, 오후 11~17, 야간≥18)해 겹치면 409. leave/OT를 blackouts 인자와 동일 패턴의 "파생 blackout"으로 주입 |
| **연결기능** | 휴가/반차/휴식권/병가, OT 이벤트, 통합 캘린더 |
| **데이터·마이그레이션** | `lib/leave-blocks.ts` 순수함수 재사용. **마이그레이션 0** |
| **노력·임팩트** | **M / High** — 신규 검증 인프라 없이 기존 검증축에 파생 차단만 주입. consult-check 게이트 필수 |

### 연동 2 — 상담 참석(done) 쿠폰 미션 + 노쇼 패널티 【C1】

| 항목 | 내용 |
|---|---|
| **무엇을** | 상담 완료(done) 시 쿠폰 자동지급, noshow는 미지급(또는 벌점 후보) |
| **왜** | done/noshow가 쿠폰·미션과 전혀 연동되지 않아 참석 인센티브가 없다. 노쇼율을 게이미피케이션으로 견인 |
| **어떻게** | `admin/consultation-bookings/page.tsx:247`(status='done' 전이, resolvedAt 세팅부)에서 `grantOtAttendance`와 동일 패턴의 `grantConsultationAttendance(student, bookingId)` 호출. `rewards_log` periodKey `CONSULT:${bookingId}`로 멱등 지급. 신규 MissionId `consultation_attendance`를 `getActiveMissionConfig` 게이트에 편입 |
| **연결기능** | 쿠폰·미션·정산·리워드, 벌점·상점 |
| **데이터·마이그레이션** | `lib/mission-engine.ts:229/247` 헬퍼(student만 변형·쿠폰수 반환) + rewards_log 멱등. **마이그레이션 0** (specialNote 봉투) |
| **노력·임팩트** | **M / High** — 지급을 이미 blackout 검증이 걸린 "완료 마감" 단일 쓰기경로에만 두어 우회 지급경로 없음(consult-check 준수). mission-check 게이트 |

### 연동 3 — 예약 라이프사이클 양방향 알림 (특히 admin reschedule 제안) 【A2 / E2 / E3】

| 항목 | 내용 |
|---|---|
| **무엇을** | 예약 생성/취소/변경요청/extra/관리자 시간변경 제안 각 전이를 학생 알림함(SeatAlert) + 관리자 인박스 이벤트로 양방향화 |
| **왜** | 현재 D-1 리마인더만 학생 방향으로 존재. 특히 `reschedule.by='admin'` 제안 시 PATCH가 SeatAlert를 발행하지 않아 학생이 상담 패널을 직접 열어야만 인지 → 놓침 → 데드 제안·노쇼 |
| **어떻게** | `createConsultationReminderAlert`(store.ts:705) 복제로 `createConsultationEventAlert`. `patchConsultationBooking` **성공 응답 뒤** SeatAlert 발행(롤백 시 유령 알림 방지), dedupeId=`creschedule_{id}`. SeatAlert에 `kind`/`link` JSONB 필드 추가로 출결/리마인더/상담변경 구분. 관리자 역방향은 `/admin/inbox`가 이미 수집하는 leaveRequests/meal_add 패턴 재사용 |
| **연결기능** | 메시지·알림·스레드, 출결판, 통합 캘린더 |
| **데이터·마이그레이션** | SeatAlert JSONB 필드 확장, 폴백 규칙 `sourceKind ?? (requestedBy ? 'human' : undefined)`. **마이그레이션 0** |
| **노력·임팩트** | **S~M / High** — 검증된 알림 버스 재사용. 자동화 상태가시성 0순위 인프라 |

### 연동 4 — 결석·이탈 순위 → 원클릭 상담 잡기 【A3 / D1】

| 항목 | 내용 |
|---|---|
| **무엇을** | `/admin/attendance` 이탈·결석 순위에서 문제 학생 발견 → 상담 예약을 화면 이동 없이 완결. 임계 초과 시 학생에게 자동 상담 유도 알림 |
| **왜** | 순위표 행은 학생 상세 시트만 열 뿐 후속 조치(상담·경고)가 화면 이동으로 끊긴다. 결석이 쌓여도 상담과 연결 안 됨 |
| **어떻게** | `POST /api/admin/consultation-bookings`(body {studentId,date,slot})가 이미 blackout·slot·중복·센터권한을 전부 검증 → studentId만 넘겨 재사용. **버블링 트랩 회피: `<tr>` 통클릭(attendance/page.tsx:791-806) 때문에 행에 버튼 넣지 말고, at-risk면 '⚠ 주의' 칩(amber, 정보표시 only)만 행에 두고 '상담 잡기' CTA는 이미 열리는 상세 시트의 상담 탭에 배치.** `buildAbsenceRanking`의 absentDays/leftDays가 임계 초과 시 SeatAlert push. reason은 N3 분리 레이어 통과 |
| **연결기능** | 출결판/이탈·결석 순위, 메시지·알림, 벌점 |
| **데이터·마이그레이션** | `buildAbsenceRanking` 순수함수 + 검증 내장 엔드포인트. **마이그레이션 0** |
| **노력·임팩트** | **S~M / High** — 재사용만으로 성립. 확정 시 연동 3 통지 필수. seatboard-check 게이트 |

### 연동 5 — OT·모의고사 날짜를 상담 blackout 소스로 자동 파생 【B-계열】

| 항목 | 내용 |
|---|---|
| **무엇을** | 학생 campus의 `OtEvent.date`·`MockExam.date`를 `BlackoutEntry`(consultation_blackouts:{campus})로 파생 → 시험일/OT일 상담 슬롯 자동 제외. 통합 캘린더엔 미래 상담(booked)·Blackout 오버레이 추가 |
| **왜** | OT·시험 당일 상담이 겹쳐도 서로 모름. 통합 캘린더는 consultationLogs(과거 완료)만 읽고 미래 예약·Blackout은 미표시라 충돌 감지 불가 |
| **어떻게** | `getBookableCalendar`/`availableSlotsForDate`가 이미 blackouts를 전 쓰기경로에서 검증 → date만 blackout 목록에 합류. `/admin/calendar`의 `activitiesByDate`에 ConsultationBooking(booked)을 '상담예약'(emerald) 카테고리·BlackoutEntry를 '상담마감' 오버레이로 추가 |
| **연결기능** | OT 이벤트, 모의고사, 통합 캘린더 |
| **데이터·마이그레이션** | 죽어있던 date 필드를 차단 소스로 승격. **마이그레이션 0** |
| **노력·임팩트** | **M / Med** — 새 검증로직 불필요, 데이터 소스만 합류 |

### 연동 6 — 진도 behind → subjectContext 프리필 예약 + whyConsultation 정렬

| 항목 | 내용 |
|---|---|
| **무엇을** | 진도 behind/최대 shortage 자료 옆 '이 과목 상담 예약' 딥링크 + 예약에 subjectContext 스냅샷 저장 |
| **왜** | whyConsultation이 '가장 늦게 끝나는 계획' 하나만 안내 → 정작 뒤처진 자료가 아닌 종료일 먼 자료를 사유로 제시. 진도 status(behind)와 예약 사이 데이터 연결 없음 |
| **어떻게** | `getManagedProgressItems`(progress-plan.ts)의 shortage/status를 whyConsultation에 병기(**표시 톤만; shortage 소스 교체는 데이터 트랙으로 이월** — 진도 단일소스 stale 위험). subject-progress-tab behind 배지 옆 clinic-booking 딥링크 |
| **연결기능** | 학생 리포트·진도, 모의고사, 메시지·알림 |
| **데이터·마이그레이션** | subjectContext JSONB 저장·POST 스키마 변경은 **UI 스코프 밖**(별 트랙) |
| **노력·임팩트** | **M~L / Med** — UI 라운드는 톤/카피만, 컨텍스트 저장은 후속 |

### 연동 7 — 리마인더 크론 통합 + 데드 reschedule 자동 만료 【E5】

| 항목 | 내용 |
|---|---|
| **무엇을** | `/api/admin/consultation/remind` 크론에 (a) 과거화된 reschedule 제안 자동 폐기·재알림, (b) 그날 승인휴가(fullday/병가) 시 리마인더 억제, (c) OT D-1/D-3 미응답 재알림 합류 |
| **왜** | reschedule 제안이 과거화돼도 자동 폐기 없음(과거 방어는 생성 시점만). 상담엔 리마인더가 있으나 OT엔 없는 비대칭 |
| **어떻게** | 이미 도는 tomorrowKst 멱등 순회에 sweep 얹기. `patchConsultationBooking(reschedule:undefined)` 폐기 경로 존재. 만료 시 조용히 사라지지 말고 카드에 '응답 기한 지나 자동 취소됨' 흔적 1줄(V4) |
| **연결기능** | 상담, 메시지·알림, OT, 쿠폰·미션 |
| **데이터·마이그레이션** | 단일 CRON_SECRET 크론 재사용. **마이그레이션 0** |
| **노력·임팩트** | **S~M / Low~Med** — 로직 본체는 자동화 트랙 이월, UI는 만료 흔적 표시만 |

### 연동 8 — 온보딩·키오스크 → 첫 상담 예약 넛지 퍼널

| 항목 | 내용 |
|---|---|
| **무엇을** | 온보딩 완료 훅에서 첫 상담 미예약 학생에게 추천 슬롯 프리필 넛지, welcome 캐러셀 'requests' 단계에 예약 딥링크, 키오스크 done 화면에 '임박 상담 D-일' 배지 |
| **왜** | `onboardedAt`이 1회성으로 소모됨. 키오스크 done 화면은 등록만료·성적미입력만 안내 |
| **어떻게** | `POST /api/student/onboarding`(markStudentOnboarded 멱등) 완료 훅 재사용. `processAttendance` 페이로드 배지 슬롯 확장. enrollStartDate+N일 슬롯 프리필 |
| **연결기능** | 학생 온보딩, 키오스크, 쿠폰·미션 |
| **데이터·마이그레이션** | onboardedAt 신호 재사용. **마이그레이션 0** |
| **노력·임팩트** | **M / Med** — 후순위 퍼널 완성 |

---

## 3. UI/UX 증진안 — 화면별 개선 + iOS26 Glass 일관성 원칙

### 3.0 관통 헌장 (라운드 3 확정, 5대 경계)

1. **주제는 화면이다 (backend out)** — UI 표면이 있는 것만 다루고 자동화 로직은 이월
2. **표면부터 규칙 준수 (Glass first)** — "건드리는 카드만 .glass" 점진 교체, 빅뱅 금지, glass-check 머지 게이트
3. **정보 예산 상한 (밀도 봉쇄)** — 카드당 1차 표시 3요소 + 접기, 색 단독 금지→아이콘/텍스트 이중부호화
4. **모바일이 실사용처** — 터치타깃 44px·폰트 11px 하한, verify-live 375px 실측
5. **낙인 구조적 차단** — 학생에게 점수/위험도 절대 비노출, 내부 reason ≠ 학생 문구

### 3.1 상담 패널 (`consultation-booking-panel.tsx`) — 최대 간극

| # | 개선 | 근거(코드 실측) | effort |
|---|---|---|---|
| **G1** | **Glass 마이그레이션 (건드리는 카드만)** — `#0071E3`/`bg-white`/`border-slate` 하드코딩(33~115, 36건)을 `.glass`/`.glass-capsule`+의미색 토큰으로. 예약완료=emerald·관리자제안=sky·학생요청대기=amber 유지, 배경만 반투명. 신규 카드부터 .glass로 짓고 기존 hex는 점진 교체 | `.glass` 사용 **0건** | M |
| **E1** | **예약 실패 낙관적 복구** — 409/마감 → refresh + '누가 먼저 예약했어요' 명시 / 네트워크 실패 → **refresh 억제 + 선택값 보존 + 다시 시도 버튼**. 대안(G5): 서버 멱등 재제출(같은 date/slot 재요청 시 기존 예약 반환) | submit/reschedule가 무조건 refresh → 선택 증발(확정 버그) | S~M |
| **E2** | **예약완료 카드 source 분기** — source==='student'는 emerald 유지, source==='admin'은 출처 pill + '선생님이 잡아준 상담' 안심 문구. 이중부호화(사람=이름칩/자동=텍스트) | `ConsultationBooking.source`(types:156) 데이터 존재, 시각 언어 0 | S~M |
| **N1/N2** | **정보 예산 + 폰트/터치 하한** — 기본 3요소(날짜/시각+담당자+상태배지)+접기, 정보 텍스트 최소 11px(현 9~10px 다수), 탭 요소 44px(현 px-2 py-2 약 32px) | `text-[9px]`/`text-[10px]` 도배(310·358·430·472·550·563) | S~M |
| **M1** | **`<SlotDayGrid>` 컴포넌트 추출** — 예약·reschedule·대리예약 그리드(440~514, 4곳 복붙 450/488/525/567)를 weekGroups/freeSlots/onSelect props 단일 컴포넌트로. E2 배지·E3 라벨·44px를 이 셀에 통합 | 슬롯 피커 사실상 중복 구현 = 드리프트 원천 | S~M |
| **V1** | **예약 상태 타임라인 세그먼트** — reschedule 상태 텍스트 3분기(373·407·427)를 '예약됨→변경협의→확정→완료' 4단계 진행바 1개로 시각화 | 폰에서 세로로 쌓임, 글많음→시각화 레포 규칙 | S~M |
| **V2/V3** | reschedule 시트 '다음 첫 자리로' 프리셋 1탭(`computeOpenDate` 재사용) + 마감 amber 카드에 추가신청 버튼 임베드(막다른 골목 방지) | 3스텝 시트인데 라벨이 '원클릭' 왜곡 | S |

### 3.2 학생 알림함 (`notifications-section.tsx`)

| # | 개선 | effort |
|---|---|---|
| **A2** | admin reschedule 제안 SeatAlert 카드 **3버튼**: '수락' + '이 시간 어려워요'(→openReschedule 재사용, by=student) + '정중 거절'. **거절 시 곧바로 대안 선택 시트 자동 오픈**(막다른 거절 금지 → 데드 제안·노쇼 방지) | S~M |
| **E4** | D-1 리마인더 = 위험라벨 대신 **중립 성장톤 준비 넛지**('내일 {slot} 상담이 있어요') + '변경 요청 열기 1탭'(정직 표기, 원클릭 아님) | S |
| **E3** | 자동 발신(D-1 크론) vs 사람 발신 라벨 구분, SeatAlert 렌더러에 신규 kind 매핑 추가 + 폴백 규칙 | S |

### 3.3 관리자 화면 (`admin/consultation-bookings/page.tsx`, `attendance/page.tsx`)

| # | 개선 | 근거 | effort |
|---|---|---|---|
| **N4** | **타임테이블 셀 밀도 재설계** — 셀엔 '이름+상태색 배경+우상단 출처 도트(내=slate/대리=blue/자동=sky)'만, 완료/노쇼/변경/취소 액션은 클릭 시 여는 **.glass 슬롯 액션 팝오버**로 이동 | 88px 셀에 4~5요소 적층(608-675), text-[9px] 세로깨짐 위험 | M |
| **M1적용** | admin 변경제안 네이티브 `<select>` 2개(751-763)를 `<SlotDayGrid>`로 교체(Glass 일관성) | 학생은 탭 그리드, admin은 브라우저 드롭다운 = 불일치 | (M1 포함) |
| **F1/F2** | 대리/자동 예약 슬롯 sky 테두리 구분(G3: 관리자 전용 sky) + 과반 초과 시 inbox 경고 / reschedule+extra 대기 **통합 뱃지 상단 노출** | extra는 페이지 진입 후에야 대기 노출(411) → 미진입 시 긴급 방치 | S~M |
| **M3** | ranking 테이블(778, 6컬럼 overflow-x-auto) → 모바일 '학생명+결석/이탈 pill+상담잡기' **카드 스택 분기**(hidden md:block / md:hidden) | 버튼 추가 시 가로스크롤 밖으로 밀림 | M |

### 3.4 색 규약 (Glass 대칭 방어)

| # | 결정 |
|---|---|
| **G2** | `CONSULT_SIGNAL_COLORS` 상수맵 신설. 현 충돌: **rose=결석∩확정노쇼**, amber=이탈∩학생요청대기, emerald=확정, sky=admin제안 → **여유색 없음**. at-risk 배지=**amber+테두리+아이콘 이중부호화**(rose 금지 — '이미 노쇼' vs '노쇼 위험' 혼동 회피). 색 단독 금지 |
| **G3** | **sky 단일의미 확정** — 관리자 화면=sky(자동/대리 슬롯), 학생 화면=무채색 테두리+텍스트칩. 부원장이 이미 blue+Star(325,468,543)라 학생 화면 sky 추가 시 blue/sky 인접 혼동 |
| **N3** | 순수함수 `studentFacingConsultReason(internalReason, kind)` — 관리자 내부 사유('결석 5회')를 학생용 중립 성장톤 1문장으로 변환. 저장 스키마 불변(표시시점 파생), 감사로그엔 원문 유지 |

---

## 4. 우선순위 매트릭스 (임팩트 × 노력)

회의 우선순위와 각 항목 effort/impact를 PM이 종합. **P0=즉시 착수, P1=Phase 2, P2=Phase 3 이후.**

| 우선 | 항목 | 노력 | 임팩트 | 배치 근거 |
|---|---|---|---|---|
| **P0** | **G1 상담 패널 Glass 마이그레이션(건드리는 카드만)** | M | High | 주제와 코드 현실의 최대 간극. 신규 카드가 얹히는 판. 안 정하면 hex 더 뿌림 |
| **P0** | **E1/G5 낙관적 복구** | S~M | High | 확정 실버그(선택 증발). 서버 변경 최소, 5인 전원 즉시 착수 지지 |
| **P0** | **E2 예약완료 카드 source 분기** | S~M | High | 대리/자동 예약 혼란=노쇼 1순위. 데이터 존재 |
| **P0** | **G2/G3 색 규약** | S | High | rose/sky 포화. 상수맵 없으면 A3 배지가 규약 깸 |
| **P1** | **N1/N2 정보 예산·폰트/터치 하한** | S~M | High | 라벨 대량 추가 라운드의 전제조건. 9px 지옥·미스탭 방지 |
| **P1** | **M1 `<SlotDayGrid>` 추출** | S~M | High | 4곳 복붙 드리프트 원천. 배지·모바일·Glass가 한 곳에서 |
| **P1** | **A1 휴가/OT 충돌 가드** | M | High | 모순·고아 예약 원천 차단. blackout 원칙 대칭 |
| **P1** | **A2/N3 3버튼 카드 + reason 분리** | S~M | High | 낙인 자동화 차단. 거절→재제안 체인이 노쇼 실감소 |
| **P1** | **A3 순위→상세시트 상담 탭 대리예약 + M3 모바일** | S~M / M | High | 감지·실행 양끝단 실코드 존재. 버블링 트랩 회피 |
| **P2** | **C1 done 쿠폰 + 노쇼 패널티** | M | High | 참석 인센티브화. mission-check 필요 |
| **P2** | **N4 admin 셀 밀도 + F1/F2** | M / S~M | Med | 88px 셀 포화 흡수. 자동/대리 슬롯 잠식 감지 |
| **P2** | **연동5 OT·모고 blackout + 통합 캘린더 오버레이** | M | Med | 소스 레벨 충돌 방지 |
| **P2** | **E3·E4·V1~V4 발신라벨·넛지·시각화** | S | Low~Med | 봇구분·낙인방지·글다발 시각화. 저위험 위생 |
| **P3(이월)** | 연동6 진도 subjectContext, 연동7 크론 sweep 본체, 연동8 온보딩 퍼널, whyConsultation 소스 교체 | — | — | 데이터/자동화 트랙 |

**임팩트×노력 4분면 요약**
- **Quick Win (고임팩트·저노력)**: E1, E2, G2/G3, A3, F2, V2/V3 → P0~P1 집중
- **Big Bet (고임팩트·중노력)**: G1, M1, A1, A2, C1 → 계획적 착수
- **Fill-in (저임팩트·저노력)**: E3, E4, V1, V4 → 여력 시
- **회피/이월 (저임팩트·고노력)**: subjectContext 저장, 크론 본체, 온보딩 퍼널

---

## 5. 단계별 로드맵

### Phase 1 — 표면 정합 + 확정 버그 (P0)
**목표: 만질 판을 Glass로 정돈하고, 예약 선택 증발 버그와 출처 혼란을 제거한다.**

| 산출물 | 선행조건 |
|---|---|
| G1: consultation-booking-panel·student-detail-sheet의 건드리는 카드 .glass 전환 | — |
| G2/G3: `CONSULT_SIGNAL_COLORS` 상수맵, at-risk=amber+아이콘, sky 단일의미 | G1(토큰 매핑 확정) |
| E1/G5: submitBooking·sendReschedule·submitExtra 3경로 실패 복구 통일(409 vs 네트워크 분기) 또는 서버 멱등 재제출 | consult-check(재제출 경로 검증) |
| E2: 예약완료 카드 source 분기(3라벨+이중부호화) | G1(카드 Glass), G2(색맵) |

**게이트**: glass-check(G1~G3), consult-check(E1), verify-live 375px

### Phase 2 — 밀도·컴포넌트·정합성 화면 산출물 (P1)
**목표: 라벨 대량 추가에 견디는 정보 예산·모바일 규격을 확보하고, 상담 정합성의 화면을 붙인다.**

| 산출물 | 선행조건 |
|---|---|
| N1/N2: 카드 3요소+접기, 11px/44px 하한 | Phase 1(카드 구조) |
| M1: `<SlotDayGrid>` 추출(booking·reschedule·대리예약 공유), admin `<select>` 폐기 | N2(44px 규격) |
| A1: 휴가/OT 충돌 가드(POST/PATCH 3경로) | consult-check |
| A2/N3: reschedule 3버튼 카드 + `studentFacingConsultReason` 분리 레이어 | Phase 1(알림 카드 Glass), 연동3 SeatAlert kind |
| A3/M3: 순위→상세시트 상담 탭 대리예약 + 모바일 카드리스트 분기 | M1(SlotDayGrid 재사용), seatboard-check |

**게이트**: consult-check(A1/A2/A3), seatboard-check(A3), verify-live 375px(M1/M3/N2)

### Phase 3 — 자동화 표면 + 위생 (P2 이후)
**목표: 쿠폰·blackout 소스·관리자 밀도·시각화를 붙이고 자동화 로직 본체를 트랙에서 합류시킨다.**

| 산출물 | 선행조건 |
|---|---|
| C1: done 쿠폰 + 노쇼 패널티(완료 마감 경로 훅) | mission-check, A3(대리예약 done 경로) |
| N4/F1/F2: admin 셀 밀도 재설계 + 슬롯 가시성 + 대기 통합 뱃지 | M1, G3(sky 단일) |
| 연동5: OT·모고 blackout 파생 + 통합 캘린더 상담/Blackout 오버레이 | A1(blackout 파이프라인), migration-check |
| E3/E4/V1/V4: 발신라벨·D-1 넛지·상태 타임라인·만료 흔적 | Phase 1~2 |
| (이월) 연동6~8 로직 본체, whyConsultation 소스 교체, 크론 sweep | 데이터/자동화 트랙 별도 착수 |

---

## 6. 리스크 · 레포 제약 대응

| 제약 | 리스크 | 대응 |
|---|---|---|
| **차단검증(blackout) 모든 쓰기경로 원칙** | 새 예약/충돌 가드가 일부 경로만 걸리면 우회 예약 발생 | A1 휴가/OT 가드를 POST/PATCH(request/approve) **3경로 대칭** 적용. C1 쿠폰 지급은 이미 검증된 '완료 마감' 단일 경로에만 훅(우회 지급 방지). **consult-check를 A1/A2/A3/E1/C1 머지 게이트로 강제** |
| **마이그레이션 정합성** | 코드가 쓰는 컬럼이 migration-*.sql에 없으면 운영 저장이 PGRST204로 전체 깨짐 | 전 연동을 **JSONB 필드 확장으로 설계해 마이그레이션 0** 유지(SeatAlert kind/link, rewards_log, subjectContext). 신규 컬럼 발생 시 **migration-check + 운영 반영 안내 완료 전 머지 금지** |
| **진도 단일소스(subjects)** | whyConsultation을 shortage 최대로 교체 시 진도 파생 로직 변경·stale 위험 | UI 라운드는 **톤/카피만**, shortage 소스 교체는 데이터 트랙으로 분리. 읽는 시점 파생만 허용, 저장 스키마 불변 |
| **저장 정합성(부분저장/optimistic locking)** | 상담·쿠폰·알림이 같은 학생 행을 건드려 다른 컬럼 덮어쓰기 | `patchStudentProgress`/`updateStudentById` 낙관적 락 경유. grant 헬퍼는 student 객체만 변형·저장은 호출부 책임 규약 유지. **integrity-check로 컬럼 보존 검증** |
| **성능(absence-ranking 캐시 없음)** | `buildAbsenceRanking`가 매 요청 전수 계산 → 학생·기간 증가 시 비용 | 순위→상담 연동은 이미 계산된 결과 재사용(추가 계산 없음). 임계 초과 알림은 순위 계산 결과에 얹기. 캐시 도입은 별도 트랙 |
| **iOS26 Glass / 한글 word-break** | 라벨 대량 추가로 9px 라벨 지옥·세로깨짐, .glass 미적용 hex 확산 | N1 정보 예산 상한, N2 11px 하한, 라벨 **whitespace-nowrap/break-keep**. G1 "건드리는 카드만" 점진 교체(빅뱅 회귀 회피). **app/globals.css만 라이브**(죽은 유틸 함정). glass-check 게이트 |
| **버블링 트랩(순위표 `<tr>` 통클릭)** | A3 행에 버튼 넣으면 상세 시트가 같이 튐 | 행엔 정보표시 칩만, CTA는 상세 시트 상담 탭으로 이동(신규 클릭영역 0). 불가피 시 stopPropagation |
| **SeatAlert 렌더러/폴백** | 신규 kind를 렌더러가 모르면 unknown 카드로 깨짐 | E3 폴백 규칙 `sourceKind ?? (requestedBy ? 'human' : undefined)` 명시, 렌더러 매핑 추가를 A2 산출물에 포함 |
| **회의 조기 종료(3라운드)** | 우선순위/로드맵 전용 라운드 미진행 | 본 보고서 4~6장을 PM이 effort/impact·합의 근거로 직접 종합(완료). Phase 게이트에 skill 검증(glass/consult/seatboard/mission/migration/integrity/verify-live) 명문화 |

---

**핵심 메시지:** 상담 백엔드는 이미 견고하다. 승부처는 (1) 만질 판을 Glass로 정돈하고(G1), (2) 확정 버그와 출처 혼란을 없애고(E1·E2), (3) blackout 원칙을 휴가/OT/쿠폰/알림으로 **대칭 확장**하는 것이다. 거의 전 항목이 기존 순수함수·검증 엔드포인트·알림 버스 재사용으로 **마이그레이션 0**에 성립하며, 학생 접점을 관리자 자동화보다 앞세우고 낙인을 구조적으로 차단하는 것이 제품 생존선이다.