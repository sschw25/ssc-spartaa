export interface AwaySchedule {
  awayTime: string;      // "HH:MM"
  returnTime?: string;   // "HH:MM", 미복귀 시 생략
  days: number[];        // [] = 매일, [0]=일 [1]=월 [2]=화 [3]=수 [4]=목 [5]=금 [6]=토
  dayMode?: 'sun0' | 'mon0'; // 요일 숫자 기준. 기존 데이터에는 없을 수 있음.
  until: string;         // 'forever' 또는 'YYYY-MM-DD'
}

// 보강 이월 — 휴가로 생긴 이번 주 보강을 다음 주로 이월(쿠폰 소모). append-only 오버레이.
export interface MakeupCarryover {
  id: string;
  createdAt: string;        // ISO
  weekKey: string;          // 이월 출발 주(월요일 YYYY-MM-DD, KST)
  nextWeekKey: string;      // 이월 도착 주(다음 주 월요일)
  subjectId: string;
  subjectName: string;
  materialId: string;
  materialType: 'book' | 'lecture';
  materialTitle: string;
  amount: number;           // 이월 보강량(단위 수)
  unit: string;             // 'p' | '강' 등
  leaveDate: string;        // 사유가 된 휴가일 YYYY-MM-DD
  leaveType: string;        // morning/afternoon/night/fullday...
  couponCost: number;       // 소모 쿠폰(3)
}

// 정기외출 반영 계획조정 통지 — 관리자 적용 시 append, 학생 홈 알림으로 노출.
export interface AwayReplanNotice {
  id: string;
  appliedAt: string;        // ISO
  subjectName: string;
  materialTitle: string;
  summary: string;          // "주 3일→2일 · 마감 7-30→8-06" 등 diff
}

export interface DetailedPlan {
  id: string;
  materialId: string;      // 대상 교재/인강 ID
  weekNumber: number;      // 주차 (1, 2, 3...)
  passNumber?: number;     // 회독 번호 (1회독, 2회독, 3회독 등)
  startDate: string;       // 주차 시작일 (YYYY-MM-DD)
  endDate: string;         // 주차 종료일 (YYYY-MM-DD)
  targetAmount: number;    // 이번 주 목표량 (페이지 또는 강의 수)
  dailyAmount?: number;    // 과목 학습 요일 기준 일일 학습량
  rangeText: string;       // 범위 설명 (예: "1p ~ 40p" 또는 "1강 ~ 8강")
  periodType?: 'deadline'; // 기간 목표 창(모드 B). undefined = 매일 시간표(daily). 하위호환.
  periodWeeks?: number;    // 해당 기간 목표 plan 이 덮는 주수. 주차별 분할 후에는 보통 1.
  isCompleted: boolean;    // 완료 여부
  actualAmount?: number;   // 실제 학습량 (완료 시 입력 / 버킷 모드는 기간 누적 진행량)
  dailyCompletions?: Record<string, {
    isCompleted: boolean;
    actualAmount?: number;
    completedAt?: string;
  }>;                      // 날짜별 오늘 할 일 완료 상태 (YYYY-MM-DD)
}

export interface ReviewPassSetting {
  passNumber: 2 | 3;
  days: number;            // 해당 회독 완료까지 필요한 소요일
}

// 오답노트 문제 기록 — 학생이 직접 입력한 오답/문제(타이핑·사진). 자료(교재) 단위로 누적.
// subjects jsonb 에 통째 저장(마이그레이션 불필요). 사진은 비공개 버킷 경로만 저장하고 조회 시 서명 URL 발급.
export interface WrongNote {
  id: string;
  text?: string;              // 타이핑한 문제/오답 내용
  imagePath?: string;         // 비공개 스토리지 경로(서명 URL로 조회). 없으면 텍스트 전용.
  tags?: string[];            // 오답 사유 태그 키(calculation_error 등)
  createdAt: string;          // 작성 시각(ISO)
  resolvedAt?: string;        // 관리자 확인 시각(ISO). 없으면 미확인.
}

export interface BookProgress {
  id: string;
  title: string;
  totalPages: number;
  currentPage: number;
  targetDate?: string;     // 완독 목표일 (YYYY-MM-DD)
  updatedAt: string;
  category?: '기본' | '문제풀이' | '요약강의' | string; // 학습 자료 유형 분류
  unit?: string;           // 개편 추가: 학습 단위 (예: '페이지', '회')
  // 자료별 학습 요일 — 요일 단일 소스. 미설정(undefined)이면 기본 월~토.
  // getMaterialStudyDays(_, material) 가 단일 진입점.
  studyDays?: Array<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'>;
  // 자율학습(selfPaced) 자료의 학생 지정 시간대 — 시간표 노출 결정용. 미설정('')이면 시간표 제외(홈 그룹만).
  // 'morning'|'afternoon'|'night'=블록, 'p0'~'p8'=특정 교시(p8=심야). selfPaced 자료에만 의미. 마이그레이션 불필요(JSON).
  studySlot?: string;
  // 관리자 지정 자료별 학습 시간대 — 과목(studyTime) 대신 자료 단위로 시간표에 배치한다.
  // 우선순위: 학생 studySlot(자율) > 자료 studyTime(관리자) > 과목 studyTime(레거시 폴백). 마이그레이션 불필요(JSON).
  // 값: 'morning'|'afternoon'|'night'=블록, ''=미지정, 'p0'~'p8'=특정 교시, 't:HH:MM-HH:MM'=시:분 직접지정(겹치는 교시에 스냅).
  studyTime?: string;

  // 개편 추가: 교재별 학습 목표 및 세부 계획
  // selfPaced = 자율 입력(목표 분량·계획 없음). 학생이 그날 한 만큼 누적 입력만 한다(뒤처짐/마감 판정 제외).
  goalType?: 'weeks' | 'weeklyAmount' | 'dailyAmount' | 'deadlineWeeks' | 'selfPaced';
  goalValue?: number;
  goalDescription?: string;
  estimatedMinutesPerUnit?: number; // 단위당 예상 소요 시간 (분)
  solvedQuestions?: number;
  incorrectTags?: Record<string, number>;
  reviewPasses?: ReviewPassSetting[]; // 2회독/3회독 계획 설정
  // 학생이 지정한 자료 색상(팔레트 key 또는 '#RRGGBB'). 시간표·캘린더·홈 등 어디서나 이 색으로 표시.
  // 미설정이면 자료 id 해시로 안정적 기본색을 파생(getMaterialColor). 학생 소유·마이그레이션 불필요(JSON).
  color?: string;
  wrongNotes?: WrongNote[]; // 학생이 입력한 오답 문제(타이핑·사진). 관리자 대시보드 리뷰용. 마이그레이션 불필요(JSON).
  detailedPlans?: DetailedPlan[];
  inputLog?: string[]; // 진도 입력한 날(KST YYYY-MM-DD), 중복제거·최근 120일 캡 — 히트맵용
  reviewLog?: Record<string, number>; // 날짜별 복습 시간(분). 자료 단위 단일 소스(계획/자율 공통). 마이그레이션 불필요(JSON).
  // 학생이 셀프서비스로 입력한 예상 총량 여부 — true 면 total(totalPages)이 학생 예측치(관리자 정식 확정 전).
  // 관리자 전체저장 병합 제외(STUDENT_OWNED_MATERIAL_FIELDS 미포함) → 관리자가 정식 총량 지정 시 예측을 덮어쓴다. 마이그레이션 불필요(JSON).
  totalIsEstimate?: boolean;
  // ── 주말 보강 원장(makeup ledger) ── 마이그레이션 불필요(subjects jsonb에 통째 저장).
  makeupOwed?: number;     // 누적 보강 발생량(승인 시 스냅샷 가산). remaining = max(0, owed-done).
  makeupDone?: number;     // 이번 주 보강 완료량(학생 입력, makeupWeekKey 주 스코프).
  makeupWeekKey?: string;  // makeupDone 이 속한 주(월요일 YYYY-MM-DD). 주 바뀌면 done 0 리셋(주간 정산).
  makeupHistory?: Array<{ leaveDate: string; leaveType: string; amount: number }>; // 발생 근거(표시용, 레거시).
  // 시작점 조정 감사 로그 — 학생이 오늘 시작점(current)을 옮긴 기록. 최근 30개 캡.
  // auto=true(자동 승인 즉시 반영)만 하루 누적 자동승인 한도 계산에 쓴다. 마이그레이션 불필요(JSON).
  adjustLog?: Array<{ date: string; from: number; to: number; auto: boolean; reason?: string }>;
}

export interface LectureProgress {
  id: string;
  name: string;
  totalLectures: number;
  completedLectures: number;
  targetDate?: string;     // 완강 목표일 (YYYY-MM-DD)
  updatedAt: string;
  category?: '기본' | '문제풀이' | '요약강의' | string; // 학습 자료 유형 분류
  // 자료별 학습 요일 — 요일 단일 소스. 미설정(undefined)이면 기본 월~토.
  studyDays?: Array<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'>;
  // 자율학습(selfPaced) 자료의 학생 지정 시간대 — 시간표 노출 결정용. 미설정('')이면 시간표 제외(홈 그룹만).
  // 'morning'|'afternoon'|'night'=블록, 'p0'~'p8'=특정 교시(p8=심야). selfPaced 자료에만 의미. 마이그레이션 불필요(JSON).
  studySlot?: string;
  // 관리자 지정 자료별 학습 시간대 — 과목(studyTime) 대신 자료 단위로 시간표에 배치한다.
  // 우선순위: 학생 studySlot(자율) > 자료 studyTime(관리자) > 과목 studyTime(레거시 폴백). 마이그레이션 불필요(JSON).
  // 값: 'morning'|'afternoon'|'night'=블록, ''=미지정, 'p0'~'p8'=특정 교시, 't:HH:MM-HH:MM'=시:분 직접지정(겹치는 교시에 스냅).
  studyTime?: string;

  // 개편 추가: 인강별 학습 목표 및 세부 계획
  // selfPaced = 자율 입력(목표 분량·계획 없음).
  goalType?: 'weeks' | 'weeklyAmount' | 'dailyAmount' | 'deadlineWeeks' | 'selfPaced';
  goalValue?: number;
  goalDescription?: string;
  estimatedMinutesPerUnit?: number; // 단위당 예상 소요 시간 (분)
  speedMultiplier?: number;          // 개별 인강 배속 설정 (예: 1.2, 1.5 등)
  reviewPasses?: ReviewPassSetting[]; // 2회독/3회독 계획 설정
  // 학생이 지정한 자료 색상(팔레트 key 또는 '#RRGGBB'). 시간표·캘린더·홈 등 어디서나 이 색으로 표시.
  // 미설정이면 자료 id 해시로 안정적 기본색을 파생(getMaterialColor). 학생 소유·마이그레이션 불필요(JSON).
  color?: string;
  detailedPlans?: DetailedPlan[];
  inputLog?: string[]; // 진도 입력한 날(KST YYYY-MM-DD), 중복제거·최근 120일 캡 — 히트맵용
  reviewLog?: Record<string, number>; // 날짜별 복습 시간(분). 자료 단위 단일 소스(계획/자율 공통). 마이그레이션 불필요(JSON).
  // 학생이 셀프서비스로 입력한 예상 총량 여부 — true 면 total(totalLectures)이 학생 예측치(관리자 정식 확정 전).
  // 관리자 전체저장 병합 제외(STUDENT_OWNED_MATERIAL_FIELDS 미포함) → 관리자가 정식 총량 지정 시 예측을 덮어쓴다. 마이그레이션 불필요(JSON).
  totalIsEstimate?: boolean;
  // ── 주말 보강 원장(makeup ledger) ── 마이그레이션 불필요(subjects jsonb에 통째 저장).
  makeupOwed?: number;     // 누적 보강 발생량(승인 시 스냅샷 가산). remaining = max(0, owed-done).
  makeupDone?: number;     // 이번 주 보강 완료량(학생 입력, makeupWeekKey 주 스코프).
  makeupWeekKey?: string;  // makeupDone 이 속한 주(월요일 YYYY-MM-DD). 주 바뀌면 done 0 리셋(주간 정산).
  makeupHistory?: Array<{ leaveDate: string; leaveType: string; amount: number }>; // 발생 근거(표시용, 레거시).
  // 시작점 조정 감사 로그 — 학생이 오늘 시작점(current)을 옮긴 기록. 최근 30개 캡.
  // auto=true(자동 승인 즉시 반영)만 하루 누적 자동승인 한도 계산에 쓴다. 마이그레이션 불필요(JSON).
  adjustLog?: Array<{ date: string; from: number; to: number; auto: boolean; reason?: string }>;
}

export interface ProposedGoal {
  materialId: string;
  materialType: 'book' | 'lecture';
  goalType: 'weeks' | 'weeklyAmount' | 'dailyAmount' | 'deadlineWeeks' | 'selfPaced';
  goalValue: number;
  targetDate?: string;                                    // 학생이 고른 목표 완료일(마감일 지정 모드). 표시·주수 산출 근거.
  studyDays?: Array<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'>; // 학생이 고른 학습 요일(예: 주말 제외). 승인 시 자료 studyDays 로 반영.
  currentProgress?: number;
  proposedWeekNumber?: number;
  proposedRangeText?: string;
  speedMultiplier?: number;
  // 변경 전 현재 상태 (관리자가 before/after 비교에 사용)
  currentGoal?: {
    goalType?: 'weeks' | 'weeklyAmount' | 'dailyAmount' | 'deadlineWeeks' | 'selfPaced';
    goalValue?: number;
    speedMultiplier?: number;
  };
}

// 학생이 직접 "만들어 신청"하는 교재/인강(자료) 추가 제안. requestType==='materialAdd' 전용.
// 관리자 승인(resolved) 시 app/api/admin/students/[id]/requests PATCH 가 selfPaced 자료로 생성한다.
// proposedGoal(기존 자료의 목표 변경)과 별개인 형제 필드 — consultation_logs jsonb 재사용(마이그레이션 불필요).
export interface ProposedMaterial {
  subjectName: string;               // 기존 과목명 또는 신규
  isNewSubject?: boolean;            // 표시용(신규 과목 배지)
  materialType: 'book' | 'lecture';
  title: string;
  total?: number;                    // 학생이 알면(예측 포함). 없으면 자율로 생성
  unit?: string;                     // 교재 단위(p/강/회 등)
  currentProgress?: number;          // 현재까지 한 분량
  studyDays?: Array<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'>;
  studyTime?: string;                // 신청 경로는 블록('morning'|'afternoon'|'night'|'')만 허용(sanitizer가 그 외 버림). 시:분 't:'는 생성 후 자료에서 지정.
  note?: string;                     // 희망 메모
  // 추가하면서 학생이 원하는 학습 방식(선택). 기본(미지정)은 selfPaced(자율).
  // deadlineWeeks/dailyAmount 는 total(총량)이 있어야 승인 시 계획 생성 — 없으면 자율로 폴백.
  goalType?: 'selfPaced' | 'deadlineWeeks' | 'dailyAmount';
  goalValue?: number;                // deadlineWeeks=주수(1~12), dailyAmount=하루 분량
  targetDate?: string;               // 마감일 지정 시 목표 완료일(YYYY-MM-DD, 표시·주수 근거)
  createdMaterialId?: string;        // 승인 시 생성한 자료 id — 재승인(resolved 토글) 시 중복 생성 방지(멱등)
}

// 학생↔관리자 양방향 대화 메시지 (요청/건의/휴가 신청에 누적되는 스레드)
// adminReply(단일 답변)와 별개로 thread[]에 시간순 메시지를 쌓아 재답변/재재답변을 지원.
// consultation_logs / leave_requests JSONB 안에 중첩 저장 — 별도 컬럼/마이그레이션 불필요.
export interface ThreadMessage {
  id: string;
  from: 'student' | 'admin';
  text: string;
  at: string;          // ISO
  author?: string;     // 관리자 이름 (from==='admin'일 때 선택)
}

export interface ConsultationLog {
  id: string;
  date: string;       // 상담일 (YYYY-MM-DD)
  manager: string;    // 상담자
  content: string;    // 상담 내용 (노션 마크다운 형식 등)
  type?: 'learning' | 'life' | 'request' | 'suggestion'; // 학습 상담 / 생활 면담 / 학생 변경 신청 / 건의사항
  // type === 'request' 인 학생 변경 신청 전용 필드 (consultation_logs jsonb 재사용)
  requestType?: 'progress' | 'subject' | 'plan' | 'halfDay' | 'restPass' | 'materialAdd' | 'makeup' | 'etc'; // 신청 분류
  status?: 'pending' | 'resolved';                       // 처리 상태
  acknowledgedAt?: string;                                // 관리자가 확인했지만 아직 완료하지 않은 시각 (ISO)
  createdAt?: string;                                     // 신청 시각 (ISO)
  resolvedAt?: string;                                    // 처리 시각 (ISO)
  adminReply?: string;                                    // 관리자 최신 코멘트 답변 (학생에게 노출, 하위호환)
  repliedAt?: string;                                     // 답변 시각 (ISO)
  thread?: ThreadMessage[];                               // 양방향 재답변 대화 (head=content 이후의 추가 메시지들)
  proposedGoal?: ProposedGoal;                            // 학생 변경 제안 계획 데이터
  proposedMaterial?: ProposedMaterial;                    // 학생 교재/인강 추가 제안 데이터(materialAdd)
  proposedMakeup?: { materialId: string; materialType: 'book' | 'lecture'; done: number }; // 주말 보강 수정 제안(makeup)
}

// 상담 담당자 휴무/출장으로 특정 날짜(또는 일부 슬롯)를 예약 불가로 막는 차단 항목.
// 센터별 app_settings 키 consultation_blackouts:{campus} 에 JSON 배열로 보관(마이그레이션 불필요).
export interface BlackoutEntry {
  date: string;             // YYYY-MM-DD
  scope: 'fullday' | string[]; // 'fullday'=그날 전체, string[]=막을 슬롯 시각('HH:MM') 목록
  reason?: string;          // 사유(관리자 표시용)
}

// 상담 예약 — 센터별 상담 시간표 슬롯에 학생이 신청(자동 수락). 슬롯 점유는 센터 공유 자원이라
// 상담 시간 변경 제안(reschedule). 한쪽이 새 날짜·시각을 제안하면 상대가 승인/거절한다.
// 예약 본체의 date/slot 은 승인 전까지 그대로 유지(원래 슬롯 점유) → 제안은 비점유.
// 승인 시 본체 date/slot/counselor 를 제안값으로 적용하고 이 필드를 비운다. 거절·취소 시 그냥 비운다.
export interface ConsultationReschedule {
  by: 'student' | 'admin';   // 제안 주체 — 상대가 승인 권한을 가진다.
  date: string;              // 제안 날짜 (YYYY-MM-DD)
  slot: string;              // 제안 시각 'HH:MM'
  weekday?: 'mon' | 'tue' | 'wed' | 'thu' | 'fri';
  counselor?: string;        // 제안 날짜의 담당자(요일 기준 산출)
  reason?: string;           // 제안 메시지(옵션)
  requestedAt: string;       // 제안 시각 (ISO)
  requestedBy?: string;      // 관리자 제안 시 username(감사용)
}

// app_settings 예약 원장(consultation_bookings:{campus})에 보관하고, 리포트 API가 학생 본인 예약만 추려 전달한다.
// kind='regular' 은 정규 슬롯 예약(슬롯 점유), kind='extra' 는 만석/긴급 시 추가신청(슬롯 미점유, 관리자 처리).
export interface ConsultationBooking {
  id: string;             // cbk_${ts}_${rand}
  studentId: string;
  studentName: string;
  campus: string;         // wonju | chuncheon | chungju
  date: string;           // 예약일 (YYYY-MM-DD) — extra 는 비어있을 수 있음
  weekday?: 'mon' | 'tue' | 'wed' | 'thu' | 'fri';
  slot: string;           // 시작 시각 'HH:MM' — extra 는 ''(미지정) 가능
  counselor: string;      // 담당자 라벨(부원장/센터장/매니저)
  kind: 'regular' | 'extra'; // 정규 슬롯 / 추가·긴급 신청
  status: 'booked' | 'cancelled' | 'done' | 'noshow'; // 예약중/취소/완료/노쇼
  reason?: string;        // 추가·긴급 신청 사유 등
  source: 'student' | 'admin'; // 신청 주체
  createdAt: string;      // 신청 시각 (ISO)
  cancelledAt?: string;   // 취소 시각 (ISO)
  cancelledBy?: 'student' | 'admin' | 'system'; // 취소 주체 — 학생 본인 취소는 알림 제외, 관리자/시스템(휴무·출장) 취소만 학생 알림
  resolvedAt?: string;    // extra 처리/상담 완료 시각 (ISO)
  resolvedBy?: string;     // 완료/노쇼 처리한 관리자(username)
  logId?: string;          // 완료 시 생성된 ConsultationLog id(결과 노트 하드 연결)
  adminReply?: string;    // 관리자 코멘트(추가신청 처리 회신 등)
  reschedule?: ConsultationReschedule; // 대기 중인 시간 변경 제안(없으면 변경 진행 중 아님)
}

// 자리이동 신청 — 학생이 배치도에서 빈자리를 골라 신청, 관리자 승인 시 좌석번호 이동.
// 센터별 app_settings 원장(seat_move_requests:{campus})에 보관. studentName 은 관리자
// 화면 표시용이며 학생용 API 응답에는 절대 포함하지 않는다(익명 배치도 원칙).
export interface SeatMoveRequest {
  id: string;               // smv_${ts}_${rand}
  studentId: string;
  studentName: string;
  campus: string;           // wonju | chuncheon | chungju
  fromSeat: number | null;  // 신청 시점 좌석 (표시용 스냅샷)
  toSeat: number;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;        // ISO
  processedAt?: string;     // 승인/거절 시각 (ISO)
  rejectReason?: string;
}

// 휴가/반차/휴식권/병가 신청 (상담 변경신청과 별개의 전용 구조 — 월 한도/쿠폰 차원 존재)
export type LeaveType = 'morning' | 'afternoon' | 'night' | 'fullday' | 'personal_halfday' | 'personal_fullday' | 'sick';

export interface LeaveRequest {
  id: string;
  type: LeaveType;        // 오전/오후/야간 반차, 휴식권(하루종일), 병가
  slot?: 'morning' | 'afternoon' | 'night' | 'fullday'; // 개인사정 반차·병가의 시간대 선택
  date: string;           // 사용 희망일 (YYYY-MM-DD) — 월 한도 집계 기준
  reason?: string;        // 사유 (옵션 — 병가는 신청 후 영수증 사진 첨부 안내)
  status: 'pending' | 'approved' | 'rejected';
  autoApproved?: boolean; // 반차 잔여/추가권으로 신청 즉시 자동 승인된 건 — 학생에게 '자동 승인' 배지로 표시
  usedCoupon?: boolean;   // 쿠폰으로 추가 신청한 건 (관리자 표시용)
  usedCredit?: boolean;   // 쿠폰 교환 '추가권'(반차권/휴식권)을 소모한 신청 — 기본 월한도와 별도 집계
  source?: 'student' | 'admin'; // 신청 주체 (없으면 student)
  urgent?: boolean;       // 전날 18:00시 이후 혹은 당일 오전 급작스러운 긴급 신청 여부
  createdAt: string;      // 신청 시각 (ISO)
  reviewedAt?: string;    // 처리(승인/반려) 시각 (ISO)
  acknowledgedAt?: string;// 관리자가 확인했지만 아직 승인/반려하지 않은 시각 (ISO)
  adminReply?: string;    // 관리자 최신 코멘트 (학생에게 노출, 하위호환)
  repliedAt?: string;     // 답변 시각 (ISO) — 승인/반려(reviewedAt)와 별개로 답변만 새로 달려도 갱신
  thread?: ThreadMessage[];// 양방향 재답변 대화 (head=reason 이후의 추가 메시지들)
  reappealedAt?: string;  // 반려 후 학생이 재승인 요청한 시각 (ISO) — 인박스에 '재요청'으로 표시
  reappealReason?: string;// 재승인 요청 시 학생이 추가한 메시지
  makeupAccruedAt?: string;// 이 휴가로 주말 보강 원장에 가산 완료한 시각 (ISO) — 멱등 플래그(재가산 금지)
  // ── 사진 증빙 (병가/개인사정 반차·휴식) ──
  proofPath?: string;      // 비공개 Storage(leave-proofs) 내 경로(key). 관리자 확인 시 즉시 삭제 → 값 제거.
  proofUploadedAt?: string;// 증빙 업로드 시각 (ISO)
}

// 주말 보강 발생 알림 1건 — 휴가 승인 시 발생한 자료별 보강량을 묶어 학생 홈 알림으로 노출.
// 별도 컬럼 없이 student_state(jsonb)에 makeupNotices 로 보관(makeupCarryovers 패턴과 동일) — 마이그레이션 불필요.
export interface MakeupNotice {
  id: string;
  createdAt: string;      // ISO
  items: Array<{ subjectName: string; materialTitle: string; amount: number; unit: string }>;
}

// 쿠폰 리워드 교환 내역 — 쿠폰을 반차권/휴식권/상품권/플래너로 교환
export type RewardType = 'halfday' | 'restpass' | 'voucher' | 'planner';

export interface RewardRedemption {
  id: string;
  type: RewardType;       // halfday(반차권) / restpass(휴식권) / voucher(상품권) / planner(플래너)
  cost: number;           // 차감(예정) 쿠폰 수
  // requested: 학생 교환 신청(쿠폰 미차감, 관리자 승인 대기) / pending: 승인됨·물품 지급대기 /
  // fulfilled: 지급완료 / rejected: 반려(미차감)
  status: 'requested' | 'pending' | 'fulfilled' | 'rejected';
  source?: 'student' | 'admin'; // 신청 주체 (학생 신청형 vs 관리자 직접 교환)
  createdAt: string;      // 신청/교환 시각 (ISO)
  approvedAt?: string;    // 관리자 승인(쿠폰 차감) 시각 (ISO)
  fulfilledAt?: string;   // 지급완료 시각 (ISO)
  voucherCode?: string;   // 상품권 번호
  note?: string;          // 플래너 지급일/메모 등
  handledBy?: string;     // 처리 관리자
}

// 학생 휴대폰 제출 방식 신청 (소지 / 임시보관함)
export interface PhoneSubmission {
  id: string;
  date: string;                       // YYYY-MM-DD
  type: 'keep' | 'locker';            // 소지 | 임시보관함
  reason?: string;                    // 소지 사유
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  reviewedAt?: string;
  adminReply?: string;
}

export interface SaturdayLateExcuse {
  id: string;
  date: string;           // 토요일 날짜 (YYYY-MM-DD)
  status: 'pending' | 'submitted' | 'excused' | 'unexcused_late';
  requestedAt: string;    // 관리자가 증빙요청을 보낸 시각 (ISO)
  reason?: string;        // 학생이 입력한 회신 사유
  submittedAt?: string;   // 학생이 회신을 제출한 시각 (ISO)
  resolvedAt?: string;    // 관리자가 승인/벌점처리 완료한 시각 (ISO)
  demeritPoint?: number;  // 단순 지각 처리 시 부여된 벌점
}

export interface GradeItem {
  id: string;
  testName: string;   // 시험명 (예: 6월 모평, 3주차 주간테스트)
  subject: string;    // 과목 (예: 국어, 영어, 수학)
  score: number;      // 점수
  date: string;       // 시험일 (YYYY-MM-DD)
  source?: 'student' | 'admin'; // 입력 주체 (학생 직접 입력 여부 — 미지정은 관리자 입력으로 간주)
}

// 벌점/상점 내역 — 관리자 부여, 학생 리포트에 노출
export interface PenaltyRecord {
  id: string;
  date: string;         // 부여일 (YYYY-MM-DD)
  points: number;       // 양수로 저장, 의미는 type으로 구분
  reason: string;       // 사유
  type: 'penalty' | 'bonus'; // 벌점 / 상점(차감)
  awardedBy: string;    // 부여 관리자
  createdAt: string;    // ISO
}

// 관리자 발송 SMS 이력
export interface SmsLog {
  id: string;
  sentAt: string;       // ISO
  message: string;
  targets: Array<'parent' | 'student'>;
  sentCount: number;
  sentBy: string;
}

// 모의고사별 학생 참여 상태
export interface MockExamParticipation {
  examId: string;
  status: 'attending' | 'absent' | 'undecided' | 'absent_requested';
  reason?: string;       // 불참 사유 (불참 신청 시 필수)
  score?: number;        // 총점 (학생 직접 입력)
  subjectScores?: Record<string, number>; // 과목별 점수 { 국어: 90, 수학: 85, ... }
  updatedAt: string;
  respondedBy?: 'student' | 'admin';
}

// 모의고사 일정 마스터 (mock_exams 테이블)
export interface MockExam {
  id: string;
  name: string;          // "6월 모의고사"
  date: string;          // YYYY-MM-DD
  targetExamTypes?: string[]; // 대상 목표시험 유형 ([] = 전체, ['수능','모의고사'] 등)
  recipientStudentIds?: string[]; // 명시 수신자(알림 발송 시 체크된 학생). 정의되면 이 학생에게만 노출, 미정의면 targetExamTypes 폴백
  campus?: string;       // 대상 센터 (wonju/chuncheon/chungju) — 없거나 'all'이면 전체 센터
  createdAt: string;
  notifiedAt?: string;   // 알림 발송 시각 (ISO)
}

export interface DDayEvent {
  id: string;
  title: string;
  date: string;
  createdAt: string;
}

// OT(오리엔테이션/특별 세션) 참여 — 미션 쿠폰 연동
export interface OtParticipation {
  // OT는 필수 참석. 불참은 학생이 사유와 함께 신청(absent_requested) → 관리자 승인 시 absent.
  eventId: string;
  status: 'attending' | 'absent' | 'undecided' | 'absent_requested';
  reason?: string;       // 불참 사유 (불참 신청 시 필수)
  updatedAt: string;
  respondedBy?: 'student' | 'admin';
  rewarded?: boolean;    // 참여 쿠폰 지급 완료 여부 (중복지급 방지 보조 플래그)
}

// OT 일정 마스터 (ot_events 테이블)
// 하나의 OT를 센터별로 다른 날짜로 등록(같은 name, campus·date만 다른 행)하고,
// 각 행에 message를 담아 학생 알림에 함께 노출한다. 학생에게는 사용 날짜 3일 전부터 자동 노출.
export interface OtEvent {
  id: string;
  name: string;          // "신학기 OT"
  date: string;          // YYYY-MM-DD (해당 센터의 OT 날짜)
  message?: string;      // 알림과 함께 보낼 안내 메시지
  targetExamTypes?: string[];
  recipientStudentIds?: string[]; // 명시 수신자(알림 발송 시 체크된 학생). 정의되면 이 학생에게만 노출, 미정의면 targetExamTypes 폴백
  campus?: string;       // 대상 센터 (wonju/chuncheon/chungju) — 없거나 'all'이면 전체 센터
  createdAt: string;
  notifiedAt?: string;   // 알림 발송 시각 (ISO) — 수동 즉시 발송 시. 미설정이어도 D-3부터 자동 노출.
}

// ── 학원 캘린더 일정 & 참여 미션 (campus_events 테이블) ─────────────
// 일반 일정(공지·행사)과 "참여 미션"(대상 선정 → 알림 → 수락 → 행사 후 쿠폰 일괄 지급)을
// 하나의 엔티티로 통합. isMission=true 이면 미션 필드(couponReward/target/notifiedAt 등) 사용.
// general=일반 일정, mission=참여 미션(쿠폰), notice=사진 공지(매일 학원 공지)
export type CampusEventCategory = 'general' | 'mission' | 'notice';

// 학생 응답 모드 — 관리자가 일정 등록 시 선택. 참여 미션(isMission)은 항상 'attendance'로 동작.
//  - none:       알림만 (표시·공지, 응답 없음) — 기본값
//  - attendance: 참석/불참 응답을 받음 (eventParticipations 재사용)
//  - postTask:   행사 종료 후 학생이 제출/확인해야 하는 사후과제 (마감일 + 이동 링크)
export type CampusEventResponseMode = 'none' | 'attendance' | 'postTask';

export interface CampusEvent {
  id: string;
  title: string;            // 일정/미션 이름 (예: "클린데이", "개원기념일 휴무")
  date: string;             // 시작일 YYYY-MM-DD
  endDate?: string;         // 종료일 (다중일 일정, 옵션)
  startTime?: string;       // 시작 시각 HH:MM (옵션)
  endTime?: string;         // 종료 시각 HH:MM (옵션)
  campus?: string;          // 대상 센터 (wonju/chuncheon/chungju) — 없거나 'all'이면 전체 센터
  category: CampusEventCategory;
  memo?: string;            // 안내 메모 (학생 알림에 함께 노출)
  color?: string;           // 캘린더 표시 색 (옵션)
  // ── 사진 공지 전용 (category==='notice') ──
  imageUrl?: string;        // 공지 이미지 공개 URL (Supabase Storage)
  imagePath?: string;       // Storage 내 경로(key) — 삭제/정리용
  // ── 학생 응답 모드 (모든 일정 공통) ──
  responseMode?: CampusEventResponseMode; // 미지정=none. 참여 미션은 값과 무관하게 attendance로 취급.
  postTaskLabel?: string;   // responseMode==='postTask' — 사후 과제 안내 (예: "후기 제출", "성적 입력")
  postTaskDueDate?: string; // 사후 과제 마감일 YYYY-MM-DD (옵션 — 없으면 종료일/시작일 기준)
  postTaskHref?: string;    // 사후 과제 이동 링크 (학생 앱 내 경로 또는 URL, 옵션)
  // ── 참여 미션 전용 (category==='mission') ──
  isMission?: boolean;      // 참여 후 쿠폰을 지급하는 미션 여부
  couponReward?: number;    // 참여자에게 지급할 쿠폰 수
  targetMode?: 'campus' | 'students'; // 대상 선정 방식 (센터 전체 / 특정 인원)
  targetStudentIds?: string[];        // targetMode==='students' 일 때 대상 학생 ID
  // 알림 발송 시 고른 수신 대상. 정의·비어있지않으면 이 학생에게만 노출(응답 가능),
  // 미정의(빈배열)면 campus/targetMode 폴백. (모의고사·OT recipientStudentIds 와 동일 규칙)
  recipientStudentIds?: string[];
  notifiedAt?: string;      // 학생 알림 발송 시각 (ISO)
  rewardedAt?: string;      // 쿠폰 일괄 지급 완료 시각 (ISO)
  createdAt: string;
  createdBy?: string;       // 등록 관리자
}

// 학생 본인이 캘린더에 직접 작성하는 개인 일정 (수험 스케줄러).
// 별도 컬럼 없이 student_state(jsonb).personalSchedule 에 보관 — 마이그레이션 불필요.
export interface PersonalScheduleItem {
  id: string;
  date: string;        // YYYY-MM-DD
  title: string;
  memo?: string;
  createdAt: string;   // ISO
}

// 학생별 참여 미션 응답 (Student.eventParticipations JSONB)
export interface EventParticipation {
  eventId: string;
  status: 'accepted' | 'declined'; // 무응답은 기록 없음
  respondedAt: string;
  respondedBy?: 'student' | 'admin';
  rewarded?: boolean;       // 쿠폰 지급 완료 여부
}

// 도시락 신청 — 센터별 주간(월~금) 라운드. 센터마다 점심만/점심+저녁.
export type MealKind = 'lunch' | 'dinner';
export type MealDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri';

// 마스터: 주차별·센터별 신청 라운드 (meal_plans 테이블)
export interface MealPlan {
  id: string;
  weekStart: string;        // 해당 주 월요일 YYYY-MM-DD
  meals: MealKind[];        // ['lunch'] 또는 ['lunch','dinner']
  campus?: string;          // 대상 센터 (없거나 'all'이면 전체 센터)
  deadline?: string;        // 신청 마감 일시 (ISO) — 이후 학생 직접 신청 잠금
  lunchPrice?: number;      // 점심 단가 (정산용)
  dinnerPrice?: number;     // 저녁 단가 (정산용)
  closedDays?: MealDay[];   // 휴무 요일 (공휴일/학원 휴무) — 신청·표·정산에서 제외
  createdAt: string;
  notifiedAt?: string;      // 알림 발송 시각 (ISO)
}

// 마감 후 추가 신청 (관리자 승인 대기) — 승인 시 selections 에 반영
export interface MealAddRequest {
  id: string;
  day: MealDay;
  meal: MealKind;
  reason?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  reviewedAt?: string;
}

// 학생별 도시락 신청 (Student.mealOrders JSONB)
export interface MealOrder {
  planId: string;
  // 요일별 끼니 신청. 값이 true면 먹음. 키 없으면 미신청.
  selections: Partial<Record<MealDay, { lunch?: boolean; dinner?: boolean }>>;
  updatedAt: string;
  respondedBy?: 'student' | 'admin';
  addRequests?: MealAddRequest[]; // 마감 후 추가 신청 내역
}

export interface SubjectProgress {
  id: string;
  name: string;            // 과목명 (국어, 수학, 영어, 탐구 등)
  learningGoal?: string;   // 학습 목표 (과목 대주제 - 옵션)
  studyTime?: 'morning' | 'afternoon' | 'night' | ''; // 주 학습 시간대
  /** @deprecated 요일은 자료(Book/LectureProgress.studyDays) 단위 단일 소스로 이관됨.
   *  계획/시간표 계산에서 미사용. 상담 텍스트 파서·하위호환 위해 필드만 유지. */
  studyDays?: Array<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'>; // (deprecated)
  books: BookProgress[];   // 이 과목 하위의 교재 진도
  lectures: LectureProgress[]; // 이 과목 하위의 강의 진도
  // 학생이 직접 만든 오답 태그(표시 문자열 그대로 저장, 예: '구조독해'). 기본 4종 뒤에 추가 노출.
  // 과목 단위 최대 12개 · 1~10자. 삭제해도 기존 노트에 저장된 태그 문자열은 건드리지 않는다(라벨 그대로 표시).
  // subjects jsonb 에 통째 저장 — 마이그레이션 불필요(JSON).
  customWrongTags?: string[];
  updatedAt: string;
}

export interface SharedMaterial {
  id: string;
  type: 'book' | 'lecture';
  name: string;            // 교재명 또는 강의명
  subject: string;         // 과목 분류 (국어, 수학, 영어, 탐구 등)
  publisher?: string;      // 출판사 또는 인강 사이트
  author?: string;         // 저자 또는 강사
  totalPagesOrLectures: number; // 총 페이지 수 또는 총 강의 수
  unit?: string;           // 개편 추가: 학습 단위 (예: '페이지', '회')
  createdAt: string;
}

// 학생 셀프 가입신청 (승인 대기). 정식 students 행이 아니라 app_settings 의 대기 목록에 보관하며,
// 관리자가 승인하면 students 행을 생성하고 이 신청은 목록에서 제거한다.
export interface StudentApplication {
  id: string;
  name: string;
  loginId: string;          // 학생이 직접 정한 로그인 아이디 (소문자/영숫자)
  passwordHash: string;     // bcrypt 해시 — 평문은 저장하지 않는다
  studentPhone?: string;
  parentPhone?: string;
  smsTargets?: Array<'parent' | 'student'>;
  contact?: string;         // 목표시험
  campus?: string;          // 희망 캠퍼스 (승인 시 관리자가 확정)
  createdAt: string;
}

export interface Student {
  id: string;
  name: string;
  loginId?: string;   // 로그인용 아이디
  passwordHash?: string; // 로그인용 비밀번호 해시
  campus: 'wonju' | 'chuncheon' | 'chungju' | 'etc' | string;
  manager: string;    // 상담자/담당 코멘터
  contact?: string;   // 목표시험 (구 연락처)
  lifeComment?: string; // 학부모 공유용 생활 관리 코멘트
  studentLifeComment?: string; // 학생 공유용 생활 관리 코멘트
  specialNote?: string; // 내부 관리용 특이사항 (학부모 결과지 비노출)
  nextConsultationDate?: string; // 다음 상담 예정일 (YYYY-MM-DD)
  // 출결 알림 문자 (PII — 학부모/학생용 리포트엔 노출하지 않음)
  parentPhone?: string;
  studentPhone?: string;
  smsTargets?: Array<'parent' | 'student'>;
  expectedArrival?: string; // 지각 기준(등원 마감) HH:MM — 기본 08:20, 수동 커스텀 시각(예: 09:40) 지원
  enrollStartDate?: string;   // 이용 시작일 (YYYY-MM-DD) — 이 날짜 전에는 학생 로그인 차단(활성화 게이트). student_state(jsonb)에 보관해 별도 컬럼/마이그레이션 불필요
  enrollmentEndDate?: string; // 등록(수강) 종료일 (YYYY-MM-DD) — 출결 시 D-3부터 학생에게 안내
  weeklyGradeCheck?: boolean; // 매주 성적 입력 대상 — 이번 주 미입력 시 관리자/학생에게 알림
  seatNumber?: number;          // 지정 좌석 번호 (좌석 현황판 연동)
  shareToken?: string;          // 학부모 리포트 공유 임시 토큰
  shareTokenExpiresAt?: string; // 공유 토큰 만료 시각 (ISO)
  sharePasswordHash?: string;   // 학부모 리포트 접근 비밀번호 bcrypt 해시 (서버 내부 전용 — 클라이언트 응답에서 제외)
  createdAt: string;
  updatedAt: string;
  
  // 관계형 데이터 (1:N)
  books: BookProgress[];
  lectures: LectureProgress[];
  consultationLogs: ConsultationLog[];
  grades: GradeItem[];
  // 학생 본인 변경 신청 내역 (리포트 API가 consultation_logs 중 type==='request'만 추려서 전달)
  changeRequests?: ConsultationLog[];
  // 학생 본인 건의사항 내역 (consultation_logs 중 type==='suggestion'만 추려서 전달)
  suggestionRequests?: ConsultationLog[];
  // 휴가/반차/휴식권/병가 신청 내역 (전용 leave_requests jsonb)
  leaveRequests?: LeaveRequest[];
  // 반차 추가 신청용 쿠폰 잔액 (관리자 수동 지급/차감)
  leaveCoupons?: number;
  // 보강 이월 내역 (휴가 보강을 다음 주로 이월 — 쿠폰 소모, append-only 오버레이)
  makeupCarryovers?: MakeupCarryover[];
  // 정기외출 반영 계획조정 통지 (관리자 적용 시 append → 학생 홈 알림)
  awayReplanNotices?: AwayReplanNotice[];
  // 주말 보강 발생 알림 (휴가 승인 시 append → 학생 홈 알림). student_state(jsonb)에 보관.
  makeupNotices?: MakeupNotice[];
  // 쿠폰 리워드 교환/지급 내역
  rewardRedemptions?: RewardRedemption[];
  // 토요 지각 증빙 내역
  saturdayLateExcuses?: SaturdayLateExcuse[];

  // 학생별 과목 설정 및 계획
  subjects?: SubjectProgress[];
  customCategories?: string[];

  // 벌점/상점 내역
  penalties?: PenaltyRecord[];
  // 관리자 발송 SMS 이력
  smsLogs?: SmsLog[];
  // 모의고사 참여 상태
  mockExams?: MockExamParticipation[];
  otEvents?: OtParticipation[];
  // 학원 캘린더 참여 미션 응답 내역
  eventParticipations?: EventParticipation[];
  // 학생 활동 상태(뽀모도로/체크리스트/리워드/알림숨김) — specialNote(어드민 메모)와 분리된 컬럼
  studentState?: Record<string, unknown>;
  // 정기 외출/빠지는 시간대 목록
  awaySchedules?: AwaySchedule[];
  // 휴대폰 제출 방식 신청 내역
  phoneSubmissions?: PhoneSubmission[];
  // D-Day 목록 (학생 개인 설정)
  ddays?: DDayEvent[];
  // 도시락 신청 내역
  mealOrders?: MealOrder[];
  // 출결판 미착석 알림(관리자 발송) — 학생 페이지 알림으로 노출, 확인 시 dismiss
  seatAlerts?: SeatAlert[];
  // 상담 예약 내역 (리포트 API가 app_settings 예약 원장에서 본인 건만 추려 전달 — 학생 컬럼 미저장)
  consultationBookings?: ConsultationBooking[];
  // 최근 관리자/시스템 취소 상담 (리포트 API가 추려 전달 — 학생 알림용, 본인 취소 제외)
  consultationCancellations?: ConsultationBooking[];
  // 쿠폰 지급 내역 (리포트 API가 rewards_log에서 정규화해 전달 — 학생 홈 '쿠폰 지급' 알림/내역용)
  couponGrants?: RewardGrant[];
  // 자리이동 신청 내역 (리포트 API가 app_settings seat_move_requests에서 본인 건만 추려 전달 — 학생 알림 승인/반려용)
  seatMoveRequests?: SeatMoveRequest[];
}

// 쿠폰 지급 1건 (student_state.rewards_log 정규화). 미션 달성/OT/행사 참여로 지급될 때 기록.
export interface RewardGrant {
  missionName: string;   // 지급 사유(미션명 또는 '참여 미션 — 행사명')
  coupons: number;       // 지급 쿠폰 수
  periodKey: string;     // 멱등 키(주 시작일/YYYY-MM/OT:id/EVENT:id) — 지급시각 없을 때 표시 폴백
  grantedAt?: string;    // 실제 지급 시각(ISO). 레거시 항목은 없을 수 있음
}

// 출결판에서 관리자가 "자리에 없음"으로 확인해 학생에게 보낸 알림
export interface SeatAlert {
  id: string;          // 고유 id (학생 페이지 dismiss 식별자로 사용)
  date: string;        // 출결 기준일 (YYYY-MM-DD, KST)
  period: number;      // 교시 인덱스 (0~7)
  periodLabel: string; // 표시용 교시 라벨 ('2', '심야' 등)
  message: string;     // 학생 페이지에 노출할 본문
  createdAt: string;
  createdBy?: string;
}

export interface AdminAccount {
  id: string;
  username: string;
  passwordHash: string;
  campus: 'wonju' | 'chuncheon' | 'chungju' | 'all';
  role: 'super' | 'campus_admin';
  createdAt: string;
  updatedAt: string;
}
