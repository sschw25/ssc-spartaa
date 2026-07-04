# 보강 이월(쿠폰) — 설계 문서 (B)

- 날짜: 2026-07-04
- 상태: 설계안 — 구현 착수
- 선행: `2026-07-04-leave-aware-pace-design.md`(A, 배포 완료). A가 "이월 자격 분류"를 데이터로 확정함.

## 목표

휴가로 생긴 이번 주 보강분을, 이번 주에 못 하면 **다음 주로 이월**한다. 단:
- **이월 가능**: `category ∈ {halfday, fullday}`(월2 반차·월1 휴식권, 쿠폰교환분 포함)만.
- **이월 불가**: 병가·개인사정(personal_*/sick) → 무조건 그 주말까지 보강.
- **비용**: 이월 1건당 **쿠폰 3장**(`student.leaveCoupons`에서 차감). 잔액 부족 시 불가.
- **한도**: (학생, 주) 당 **최대 1회**.
- **트리거**: 학생이 리포트에서 즉시 실행(관리자 승인 불필요).

## 핵심 설계 결정: 파괴적 재작성 대신 "이월 오버레이"

계획 창(deadline 주 windows·daily)을 직접 재작성하지 않는다(범위/rangeText 훼손·되돌리기 어려움 위험).
대신 **이월 기록(carryover)을 별도 오버레이**로 저장하고, pace 계산이 이를 반영한다.
사용자 요구("이월된 양은 별도로 보여줘")와도 일치.

### 데이터 모델 (마이그레이션 없음 — student JSONB)

`student.makeupCarryovers?: MakeupCarryover[]`
```
interface MakeupCarryover {
  id: string;
  createdAt: string;        // ISO
  weekKey: string;          // 이월 출발 주 (월요일 YYYY-MM-DD, KST)
  nextWeekKey: string;      // 이월 도착 주 (다음 주 월요일)
  subjectId: string;
  subjectName: string;
  materialId: string;
  materialType: 'book' | 'lecture';
  materialTitle: string;
  amount: number;           // 이월 보강량(단위 수)
  unit: string;             // 'p' | '강' 등
  leaveDate: string;        // 사유가 된 휴가일 YYYY-MM-DD
  leaveType: string;        // morning/afternoon/night/fullday...
  couponCost: number;       // 3
}
```
- 반환 안내문(요구 형식): "{leaveDate}에 쓴 {휴가라벨}으로 {subjectName} {materialTitle} {amount}{unit} 보강 → 다음 주로 이월".

### pace 오버레이

- **주(week) 정의**: KST 월요일~일요일. `weekKeyOf(date)` = 그 주 월요일.
- deadline 주 window 는 이미 주 단위 → `deriveDeadlineGoals`에서 각 목표에:
  - 이번 주 window 로 **나간(out)** carryover amount 만큼 이번 주 기대/보강에서 제외.
  - 이번 주 window 로 **들어온(in)** carryover amount 만큼 이번 주 기대/보강에 가산.
  - 순효과 = `+in − out` 을 targetAmount 오버레이로 적용(표시·todayRecommend·behind 판정에 반영, 원본 plan 불변).
- daily: 마찬가지로 `getMakeupAmount` 계산 시 out 주는 보강에서 빼고, 다음 주가 되면(그 주가 nextWeekKey) 그만큼 보강으로 더한다.
- **멱등/정합**: carryover 는 append-only. 되돌리기는 범위 밖(YAGNI) — 필요 시 관리자 수동.

### API (신규)

`POST /api/student/makeup/carryover` (학생 세션)
- body: `{ subjectId, materialId, materialType, amount, leaveId }`
- 검증(서버):
  1. 세션 학생 == 대상(IDOR 차단).
  2. 해당 휴가가 승인·이월가능 category.
  3. 이번 주 이 학생 carryover 미존재(주당 1회).
  4. `leaveCoupons >= 3`.
  5. amount 가 실제 이번 주 보강량 이내(과다 이월 차단).
- 처리: `leaveCoupons -= 3`, `makeupCarryovers.push(record)`. optimistic locking(기존 저장 패턴) 준수, 부분저장 컬럼 보존.
- 성공 토스트 + 안내문 반환.

### UI (학생 리포트)

- **과목별 진도 탭** 보강 배지 옆:
  - 이월 가능(자격 category + 잔액 3 + 주당 미사용)일 때 **"다음 주로 이월 (이월권 3)"** 버튼 → `useConfirm` → API.
  - 불가 사유별 비활성 안내(잔액부족/이번주 사용함/병가·개인사정 불가).
- **이월 내역 별도 표시**(요구): 홈 또는 과목탭에 "이월됨" 섹션 —
  각 carryover 를 안내문 형식으로. 다음 주가 되면 그 주 보강으로 노출.

## 비목표 (B에서 안 함)

- 이월 취소/롤백 UI(관리자 수동으로 충분).
- C. 정기외출 연동(별도).

## 검증

- 하네스 확장: carryover 있는 학생의 이번 주 목표가 out 만큼 감소, 다음 주가 in 만큼 증가.
- 라이브: 실원생에 이월권 잔액 세팅 후 이월 버튼 → 쿠폰 3 차감·기록·안내문·주당 2번째 차단 확인(읽기전용 검증 우선, 쓰기는 시드/임시).

## 미결(확인)

- "별도 이월권 3장" = leaveCoupons 3 차감(즉시)으로 해석. 만약 '이월권'을 쿠폰으로 먼저 교환(반차권처럼)하는 2단계를 원하면 알려주세요(트리거 '즉시반영'과는 상충).
- amount 기본값 = 이번 주 남은 보강 전량 vs 학생이 부분 지정? → 제안: 전량(단순).
