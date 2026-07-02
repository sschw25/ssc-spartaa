# 자리이동 신청 (Seat Move Requests) — 설계

2026-07-03. 학생이 좌석 배치도를 보고 빈자리를 골라 이동을 신청하면, 관리자가 출결판에서 승인/거절하고 승인 시 학생의 좌석번호가 실제로 이동하는 기능.

## 요구사항

- 학생이 이동신청 시 출결판(좌석 배치도)을 볼 수 있다.
- 배치도에서 **이름은 절대 보이지 않는다**. 임자 있는 자리는 회색 처리.
- 빈자리를 눌러 신청하면 학원(관리자)이 확인 후 승인하고, 승인 시 그 학생의 좌석번호가 해당 자리로 이동한다.

## 아키텍처

### 저장 (마이그레이션 없음)

상담예약(`consultation_bookings:{campus}`)과 동일 패턴: `app_settings` 키 `seat_move_requests:{campus}`에 JSON 배열, `mutateAppSetting` 낙관적 잠금으로 read-modify-write. 신청은 소량이라 충분하다.

```ts
interface SeatMoveRequest {
  id: string;
  studentId: string;
  studentName: string;      // 관리자 표시용 (학생 API에는 절대 노출 안 함)
  campus: string;           // CampusKey
  fromSeat: number | null;  // 신청 시점 좌석 (표시용)
  toSeat: number;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;        // ISO
  processedAt?: string;
  rejectReason?: string;
}
```

- 학생당 pending 1건 제한. 같은 좌석에 대한 pending 중복 신청 차단(mutate 안에서 재검증 — 상담 'taken' 패턴).
- 처리된(approved/rejected) 건은 학생 상태 표시용으로 유지하되, 쓰기 시 14일 지난 처리 건은 prune.

### API

**학생** (`getStudentSessionId` 인증, `app/api/student/seat-move/route.ts`):
- `GET` → `{ campus, mySeat, occupied: number[], pendingSeats: number[], myRequest }`. 서버에서 캠퍼스 학생들의 좌석번호만 추출(**이름·id 등 PII 미포함**) — 익명화는 서버 책임.
- `POST { toSeat }` → 검증: 캠퍼스 배치도에 존재하는 좌석, 본인 자리 아님, 점유 아님(fresh students 조회), 내 pending 없음, 그 좌석 pending 없음(mutate 내 재검증). rate limit 적용.
- `DELETE ?id=` → 본인 pending 취소. (처리된 건은 `?dismiss=1`로 카드에서 확인 처리(제거).)

**관리자** (`getAdminSession` + `lib/campus-scope` 검증):
- `GET /api/admin/seat-moves?campus=` → 해당 캠퍼스 목록(pending 우선).
- `POST /api/admin/seat-moves/[id]` (body: campus) → 승인: fresh 점유 재검증 → 충돌 시 409 'taken' → `patchStudentProfile`(seat_number 타깃 컬럼 업데이트, 전체 행 upsert 회피) → 원장 status='approved'.
- `DELETE /api/admin/seat-moves/[id]?campus=` → 거절(status='rejected').

승인 순서: 좌석 이동을 먼저, 원장 status는 그 다음. (원장만 approved인데 좌석 미이동인 상태 방지.)

### UI

**학생** — `components/report/seat-move-card.tsx` (자체 fetch, use-report-state 훅 무변경 — early-return 트랩 회피):
- "상담 및 신청" 탭(`consultation-tab.tsx`) 휴가신청 아래에 마운트. `student.campus`가 `CAMPUS_LAYOUTS`에 없으면 렌더 안 함.
- 카드: 현재 내 자리 + 신청 상태(접수중/승인/반려) + "자리 선택하기" 버튼.
- 모달: `CAMPUS_LAYOUTS[campus]` 배치도(페이지 탭 포함) 렌더. 좌석 상태 — 내 자리=파랑, 점유=회색 비활성, 타인 신청중=회색 비활성(점 표시), 빈자리=클릭 가능. 숫자만 표시, 이름 없음.
- 빈자리 클릭 → 선택 확인 → POST → 성공 토스트. `useConfirm` 사용(네이티브 confirm 금지).

**관리자** — `app/admin/seat-board/page.tsx`:
- 캠퍼스 선택 아래 pending 신청 패널: "{이름} · {현재}번 → {희망}번" + 승인/거절 버튼. 승인 성공 시 보드 데이터 리로드. 거절 사유는 선택 입력(usePrompt).

## 대안 검토

1. **consultation_logs 재사용**(기존 학생 신청 경로): 구조화 데이터(toSeat)와 좌석 재검증·자동 이동이 안 맞음 — 기각.
2. **전용 Supabase 테이블**: 마이그레이션 필요, 소량 데이터에 과함 — 기각.
3. **app_settings 캠퍼스별 원장** (채택): 기존 패턴 재사용, 마이그레이션 없음, 낙관적 잠금 확보.

## 에러 처리

- 동시 신청(같은 좌석): mutate 내 재검증으로 후발 신청 'taken' 거부.
- 승인 시점에 좌석이 이미 참: 409 + 관리자 토스트, 원장은 pending 유지.
- 학생 저장 충돌: patchStudentProfile 실패 시 원장 미변경, 500 반환.

## 검증

- `tsc --noEmit`, `next lint`(신규 파일), dev 서버 라이브 검증(학생 모달 렌더·신청·관리자 승인 후 좌석 이동).
