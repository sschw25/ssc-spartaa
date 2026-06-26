export interface AwaySchedule {
  awayTime: string;      // "HH:MM"
  returnTime?: string;   // "HH:MM", 미복귀 시 생략
  days: number[];        // [] = 매일, [0]=일 [1]=월 [2]=화 [3]=수 [4]=목 [5]=금 [6]=토
  until: string;         // 'forever' 또는 'YYYY-MM-DD'
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
  isCompleted: boolean;    // 완료 여부
  actualAmount?: number;   // 실제 학습량 (완료 시 입력)
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

export interface BookProgress {
  id: string;
  title: string;
  totalPages: number;
  currentPage: number;
  targetDate?: string;     // 완독 목표일 (YYYY-MM-DD)
  updatedAt: string;
  category?: '기본' | '문제풀이' | '요약강의' | string; // 학습 자료 유형 분류
  unit?: string;           // 개편 추가: 학습 단위 (예: '페이지', '회')
  
  // 개편 추가: 교재별 학습 목표 및 세부 계획
  goalType?: 'weeks' | 'weeklyAmount' | 'dailyAmount';
  goalValue?: number;
  goalDescription?: string;
  estimatedMinutesPerUnit?: number; // 단위당 예상 소요 시간 (분)
  solvedQuestions?: number;
  incorrectTags?: Record<string, number>;
  reviewPasses?: ReviewPassSetting[]; // 2회독/3회독 계획 설정
  detailedPlans?: DetailedPlan[];
}

export interface LectureProgress {
  id: string;
  name: string;
  totalLectures: number;
  completedLectures: number;
  targetDate?: string;     // 완강 목표일 (YYYY-MM-DD)
  updatedAt: string;
  category?: '기본' | '문제풀이' | '요약강의' | string; // 학습 자료 유형 분류

  // 개편 추가: 인강별 학습 목표 및 세부 계획
  goalType?: 'weeks' | 'weeklyAmount' | 'dailyAmount';
  goalValue?: number;
  goalDescription?: string;
  estimatedMinutesPerUnit?: number; // 단위당 예상 소요 시간 (분)
  speedMultiplier?: number;          // 개별 인강 배속 설정 (예: 1.2, 1.5 등)
  reviewPasses?: ReviewPassSetting[]; // 2회독/3회독 계획 설정
  detailedPlans?: DetailedPlan[];
}

export interface ProposedGoal {
  materialId: string;
  materialType: 'book' | 'lecture';
  goalType: 'weeks' | 'weeklyAmount' | 'dailyAmount';
  goalValue: number;
  targetDate?: string;
  proposedWeekNumber?: number;
  proposedRangeText?: string;
  speedMultiplier?: number;
  // 변경 전 현재 상태 (관리자가 before/after 비교에 사용)
  currentGoal?: {
    goalType?: 'weeks' | 'weeklyAmount' | 'dailyAmount';
    goalValue?: number;
    speedMultiplier?: number;
  };
}

export interface ConsultationLog {
  id: string;
  date: string;       // 상담일 (YYYY-MM-DD)
  manager: string;    // 상담자
  content: string;    // 상담 내용 (노션 마크다운 형식 등)
  type?: 'learning' | 'life' | 'request' | 'suggestion'; // 학습 상담 / 생활 면담 / 학생 변경 신청 / 건의사항
  // type === 'request' 인 학생 변경 신청 전용 필드 (consultation_logs jsonb 재사용)
  requestType?: 'progress' | 'subject' | 'plan' | 'halfDay' | 'restPass' | 'etc'; // 신청 분류
  status?: 'pending' | 'resolved';                       // 처리 상태
  createdAt?: string;                                     // 신청 시각 (ISO)
  resolvedAt?: string;                                    // 처리 시각 (ISO)
  adminReply?: string;                                    // 관리자 코멘트 답변 (학생에게 노출)
  repliedAt?: string;                                     // 답변 시각 (ISO)
  proposedGoal?: ProposedGoal;                            // 학생 변경 제안 계획 데이터
}

// 휴가/반차/휴식권/병가 신청 (상담 변경신청과 별개의 전용 구조 — 월 한도/쿠폰 차원 존재)
export type LeaveType = 'morning' | 'afternoon' | 'night' | 'fullday' | 'sick';

export interface LeaveRequest {
  id: string;
  type: LeaveType;        // 오전/오후/야간 반차, 휴식권(하루종일), 병가
  date: string;           // 사용 희망일 (YYYY-MM-DD) — 월 한도 집계 기준
  reason?: string;        // 사유 (옵션 — 병가는 밴드채팅 영수증 증빙 안내)
  status: 'pending' | 'approved' | 'rejected';
  usedCoupon?: boolean;   // 쿠폰으로 추가 신청한 건 (관리자 표시용)
  source?: 'student' | 'admin'; // 신청 주체 (없으면 student)
  urgent?: boolean;       // 전날 18:00시 이후 혹은 당일 오전 급작스러운 긴급 신청 여부
  createdAt: string;      // 신청 시각 (ISO)
  reviewedAt?: string;    // 처리(승인/반려) 시각 (ISO)
  adminReply?: string;    // 관리자 코멘트 (학생에게 노출)
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
  status: 'attending' | 'absent' | 'undecided';
  reason?: string;       // 불참 사유
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
  createdAt: string;
  notifiedAt?: string;   // 알림 발송 시각 (ISO)
}

export interface SubjectProgress {
  id: string;
  name: string;            // 과목명 (국어, 수학, 영어, 탐구 등)
  learningGoal?: string;   // 학습 목표 (과목 대주제 - 옵션)
  studyTime?: 'morning' | 'afternoon' | 'night' | ''; // 주 학습 시간대
  studyDays?: Array<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'>; // 학생용 요일별 시간표
  books: BookProgress[];   // 이 과목 하위의 교재 진도
  lectures: LectureProgress[]; // 이 과목 하위의 강의 진도
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

export interface Student {
  id: string;
  name: string;
  loginId?: string;   // 로그인용 아이디
  passwordHash?: string; // 로그인용 비밀번호 해시
  campus: 'wonju' | 'chuncheon' | 'chungju' | 'etc' | string;
  manager: string;    // 상담자/담당 코치
  contact?: string;   // 목표시험 (구 연락처)
  lifeComment?: string; // 학부모 공유용 생활 관리 코멘트
  studentLifeComment?: string; // 학생 공유용 생활 관리 코멘트
  specialNote?: string; // 내부 관리용 특이사항 (학부모 결과지 비노출)
  nextConsultationDate?: string; // 다음 상담 예정일 (YYYY-MM-DD)
  // 출결 알림 문자 (PII — 학부모/학생용 리포트엔 노출하지 않음)
  parentPhone?: string;
  studentPhone?: string;
  smsTargets?: Array<'parent' | 'student'>;
  expectedArrival?: '08:20' | '09:00'; // 지각 기준(등원 마감) — 학생별 그룹, 기본 08:20
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
  // 정기 외출/빠지는 시간대 목록
  awaySchedules?: AwaySchedule[];
}
