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
  reviewPasses?: ReviewPassSetting[]; // 2회독/3회독 계획 설정
  detailedPlans?: DetailedPlan[];
}

export interface ConsultationLog {
  id: string;
  date: string;       // 상담일 (YYYY-MM-DD)
  manager: string;    // 상담자
  content: string;    // 상담 내용 (노션 마크다운 형식 등)
  type?: 'learning' | 'life' | 'request'; // 학습 상담 / 생활 면담 / 학생 변경 신청
  // type === 'request' 인 학생 변경 신청 전용 필드 (consultation_logs jsonb 재사용)
  requestType?: 'progress' | 'subject' | 'plan' | 'halfDay' | 'restPass' | 'etc'; // 신청 분류
  status?: 'pending' | 'resolved';                       // 처리 상태
  createdAt?: string;                                     // 신청 시각 (ISO)
  resolvedAt?: string;                                    // 처리 시각 (ISO)
  adminReply?: string;                                    // 관리자 코멘트 답변 (학생에게 노출)
  repliedAt?: string;                                     // 답변 시각 (ISO)
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
  createdAt: string;      // 신청 시각 (ISO)
  reviewedAt?: string;    // 처리(승인/반려) 시각 (ISO)
  adminReply?: string;    // 관리자 코멘트 (학생에게 노출)
}

export interface GradeItem {
  id: string;
  testName: string;   // 시험명 (예: 6월 모평, 3주차 주간테스트)
  subject: string;    // 과목 (예: 국어, 영어, 수학)
  score: number;      // 점수
  date: string;       // 시험일 (YYYY-MM-DD)
  source?: 'student' | 'admin'; // 입력 주체 (학생 직접 입력 여부 — 미지정은 관리자 입력으로 간주)
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
  createdAt: string;
  updatedAt: string;
  
  // 관계형 데이터 (1:N)
  books: BookProgress[];
  lectures: LectureProgress[];
  consultationLogs: ConsultationLog[];
  grades: GradeItem[];
  // 학생 본인 변경 신청 내역 (리포트 API가 consultation_logs 중 type==='request'만 추려서 전달)
  changeRequests?: ConsultationLog[];
  // 휴가/반차/휴식권/병가 신청 내역 (전용 leave_requests jsonb)
  leaveRequests?: LeaveRequest[];
  // 반차 추가 신청용 쿠폰 잔액 (관리자 수동 지급/차감)
  leaveCoupons?: number;

  // 학생별 과목 설정 및 계획
  subjects?: SubjectProgress[];
  customCategories?: string[];
  speedMultiplier?: number; // 속도 가중치 보정 옵션 (기본값: 1.0)
}
