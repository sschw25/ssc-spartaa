# 상담 라이프사이클 완성 — 설계 (2026-06-30)

## 배경

2026-06-30에 상담 예약 시스템(센터별 시간표·이번주+다음주 캘린더·자동수락)을 새로 만들었다.
신청→자동수락→슬롯점유까지는 탄탄하나, **예약 앞뒤(예약 전 리마인드 / 상담 후 처리)가 비어 있다.**

빈 곳:
- **리마인더 없음** — 노쇼 방어 장치 0. 메시지 알림 시스템은 있으나 연결 안 됨.
- **`done`/노쇼 처리 모호** — 상태값 `done`은 있으나 *누가 언제 어떻게* 완료처리하는지 불명, 노쇼 미구분.
- **상담 결과 기록 단절** — `ConsultationLog`(상담 노트, `consultation_logs` JSONB)가 이미 있는데 새로 만든 `ConsultationBooking`(슬롯 예약)과 완전히 끊겨 있음.
- **담당자 휴무/출장 차단 불가** — `lib/consultation-schedule.ts`의 `lastSlot`이 코드 하드코딩.
- **이력·통계 전무** — 학생별 상담 히스토리, 센터별 노쇼율 부재.

## 목표

상담의 전체 흐름을 데이터로 완성한다:

```
예약 → [리마인더] → 상담 → [완료/노쇼 처리] → [결과 기록] → 다음 진도
                                    ↑
                          [담당자 휴무 차단]은 예약 단계 입력 제어
```

## 핵심 결정

### 아키텍처: 마이그레이션 제로 (접근 A 채택)
상담 시스템은 의도적으로 무마이그레이션으로 지어졌다(슬롯 = `app_settings` 키 `consultation_bookings:{campus}`,
상담 노트 = 학생 `consultation_logs` JSONB). 본 설계도 동일 원칙을 따른다 — 신규 Supabase 테이블/ALTER 없음.
센터 규모(3개·학생 수백)에서 메모리 집계로 충분하다.

### 노쇼 정책: 기록만 (추적용)
노쇼는 상태로 기록하고 통계·이력에만 반영한다. 패널티(재예약 제한·벌점 연동) 없음.
단 데이터 모델은 `resolvedBy` 등 확장 여지를 남긴다.

### 리마인더 채널: 인앱 (다음 접속 시 노출)
카톡/문자 등 외부 푸시 인프라 없음. 리마인더는 학생 알림 레코드(SeatAlert와 동일 채널) +
리포트 상담 탭 배너로 한정한다.

### 상담↔결과 연결: 완료폼 + 자동 다이제스트 (접근 B)
"그날 무엇이 바뀌었나"의 재료(처리된 변경신청·새 학습노트·과목/다음상담일 변경·승인 휴가)는
대부분 이미 타임스탬프가 찍힌 이벤트로 존재한다. 완료 처리 시 이 다이제스트를 자동으로 미리 채운
노트 폼을 띄우고, 담당자가 마저 작성해 저장하면 기존 `ConsultationLog`로 생성 + 예약에 하드 연결한다.
전체 변경 저널(접근 C)은 침습적이라 현 단계에서 제외하되, 다이제스트가 후일 changeLog를 읽도록 확장 가능.

## 설계

### 단계 1 · 담당자 휴무 차단 (먼저 — 2~4의 슬롯 데이터 정확성 전제)

**데이터**
- 신규 원장 키 `consultation_blackouts:{campus}` = `BlackoutEntry[]`
  - `BlackoutEntry = { date: string(YYYY-MM-DD), scope: 'fullday' | string[](막을 슬롯 HH:MM), reason?: string }`

**로직 (`lib/consultation-schedule.ts`)**
- `slotsForDay` / `getBookableCalendar`가 차단을 차감해 노출.
- 기존 하드코딩 `lastSlot`은 기본값으로 유지하고, blackout이 그 위에 덮어씀(추가 제한만, 완화 아님).
- `getBookableCalendar` / `buildDaySlotGrid` 시그니처에 `blackouts` 인자 추가(순수함수 유지).

**저장 (`lib/store.ts`)**
- `getConsultationBlackouts(campus)` / `setConsultationBlackouts(campus, entries)`.

**관리자 UI (`app/admin/consultation-bookings/page.tsx`)**
- 날짜/슬롯 클릭 → "막기 / 풀기" 토글 + 사유 입력.

**API**
- `app/api/admin/consultation-bookings` (또는 신규 하위 경로): blackout GET/PUT. 권한 = campus_admin(자기센터)/master(전체).

### 단계 2 · 완료/노쇼 처리

**데이터 (`lib/types/student.ts` `ConsultationBooking`)**
- `status`에 `noshow` 추가 → `'booked' | 'cancelled' | 'done' | 'noshow'`.
- `resolvedBy?: string` 추가. `resolvedAt?`(기존) 재사용.

**관리자 UI**
- 시간표 그리드(`buildDaySlotGrid` 기반): 슬롯 시각이 지난 `booked` 예약에 "완료 / 노쇼" 버튼 노출.
- 자동 전환 없음 — 수동 확정(출결판 토글 철학과 일관).

**API**
- `PATCH /api/admin/consultation-bookings`: `status` 전이(`booked→done|noshow`) 처리. 단계 1의 slot 캡 검증과 일관.

### 단계 3 · 상담 결과 기록 (완료폼 + 자동 다이제스트)

**자동 다이제스트 (신규 순수모듈 `lib/consultation-digest.ts`)**
- 입력: 상담일 `D`, 학생(`Student`). 출력: 그날 이벤트 요약 항목 리스트.
- 수집 대상:
  - 처리된 변경신청: `consultationLogs` 중 `type==='request' && status==='resolved' && resolvedAt`이 `D`에 해당
  - 처리/승인된 휴가·반차: `leaveRequests` 중 acted(승인/반려) 시각이 `D`에 해당
  - `nextConsultationDate` / `subjects` 변경(가능한 범위 — 타임스탬프 기준)
  - 새로 추가된 교재/인강(`books`/`lectures`의 생성 흐름에 시각이 있으면)
- 날짜 매칭은 KST 기준 동일 일자.

**완료 폼 (단계 2 "완료" 클릭 시)**
- 다이제스트가 미리 채워진 상담 노트 폼 표시 → 담당자가 마저 작성.
- 저장 시 기존 `POST /api/admin/students/[id]/consultation` 경로로 `ConsultationLog`(type `learning`) 생성.
- 생성된 로그 id를 `ConsultationBooking.logId`(신규 필드)에 기록해 예약↔노트 하드 연결.

**학생 노출 (리포트 상담 탭)**
- 타임라인에 `예약 → 결과노트 → 그날 변경사항`이 한 묶음으로 정렬 표시.

### 단계 4 · 리마인더 + 이력/통계

**리마인더**
- 신규 `GET /api/admin/consultation/remind` — `CRON_SECRET` 가드(기존 크론 패턴과 동일).
- `.github/workflows/scheduled-crons.yml`에 스케줄 1줄 추가(예: 매일 KST 저녁) + case 매핑.
- 동작: D-1(내일) `booked` 예약자에게 알림 레코드 생성(SeatAlert와 동일한 학생 알림 채널 재사용). 멱등(같은 날 중복 생성 방지 키).
- 리포트 상담 탭: "내일 14:30 상담" 배너(예약 데이터로 클라이언트 계산 — 백엔드 의존 없음).

**이력/통계 (관리자 화면, 메모리 집계)**
- 센터별: 기간 내 신청수, 완료율, 노쇼율.
- 학생별: 상담 히스토리 타임라인(예약 + 결과노트 + 변경 다이제스트).

## 영향 받는 파일

- `lib/consultation-schedule.ts` — blackout 차감, 시그니처 확장
- `lib/consultation-digest.ts` — 신규(순수)
- `lib/store.ts` — blackout get/set, booking 상태전이 헬퍼
- `lib/types/student.ts` — `ConsultationBooking.status` noshow, `resolvedBy`, `logId`; `BlackoutEntry` 타입
- `app/api/admin/consultation-bookings/route.ts` — blackout, status 전이
- `app/api/admin/consultation/remind/route.ts` — 신규(크론)
- `app/admin/consultation-bookings/page.tsx` — 차단 토글, 완료/노쇼 버튼, 완료 폼, 통계
- `app/api/report/[id]/route.ts` + `components/report/consultation-booking-panel.tsx` — 리마인더 배너, 결과/변경 타임라인
- `.github/workflows/scheduled-crons.yml` — 리마인더 스케줄

## 검증 계획

- **순수로직 단위테스트**: blackout 차감(fullday/슬롯부분), 다이제스트 날짜 매칭(KST 경계), slot 캡 일관성.
- **API E2E** (격리 local-json dev): 완료/노쇼 전이, `logId` 연결, 리마인더 멱등성, 권한(campus_admin vs master).
- `tsc` + 프로덕션 빌드 통과.
- 시각 최종확인(iOS26 글래스)은 사용자 몫.

## 빌드 순서

1 (차단) → 2 (완료/노쇼) → 3 (결과기록) → 4 (리마인더/통계).
단계 1을 먼저 깔아야 2~4의 슬롯 데이터가 정확하다.

## 범위 밖 (YAGNI)

- 외부 푸시(카톡/문자) 연동
- 노쇼 패널티(재예약 제한·벌점 연동)
- 전체 변경 저널(접근 C) — 모든 변경 경로 계측
