-- SSC 어드민 학습관리 스키마 (Supabase / Postgres)
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하세요.
-- 현재 Student 객체 구조를 거의 1:1로 매핑 (subjects/consultation_logs/grades 는 JSONB).
-- 최상위 books/lectures 는 subjects 에서 파생되므로 저장하지 않음(단일 진실 소스).

create table if not exists students (
  id                     text primary key,
  name                   text not null,
  campus                 text not null default 'wonju',
  manager                text not null default '',
  contact                text not null default '',
  next_consultation_date date,
  speed_multiplier       numeric not null default 1.0,
  life_comment           text not null default '',
  special_note           text not null default '',
  student_life_comment   text not null default '',
  subjects               jsonb not null default '[]'::jsonb,
  consultation_logs      jsonb not null default '[]'::jsonb,
  grades                 jsonb not null default '[]'::jsonb,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists idx_students_campus on students (campus);
create index if not exists idx_students_next_consult on students (next_consultation_date);

create table if not exists shared_materials (
  id                       text primary key,
  type                     text not null,            -- 'book' | 'lecture'
  name                     text not null,
  subject                  text not null default '',
  publisher                text not null default '',
  author                   text not null default '',
  total_pages_or_lectures  integer not null default 0,
  unit                     text not null default '',
  created_at               timestamptz not null default now()
);

create index if not exists idx_shared_materials_type on shared_materials (type);
create index if not exists idx_shared_materials_subject on shared_materials (subject);

-- 학생 포털 비밀번호(해시만 저장 — 평문 금지)
alter table students add column if not exists password_hash text;

-- 학생 포털 로그인용 아이디 (고유값)
alter table students add column if not exists login_id text unique;

-- 출결 알림 문자 수신 정보 (PII — 리포트엔 노출 안 함)
alter table students add column if not exists parent_phone text;
alter table students add column if not exists student_phone text;
-- 수신 대상: ["parent"], ["student"], ["parent","student"], [] 중 선택 ([] = 자동 발송 안 함)
alter table students add column if not exists sms_targets jsonb not null default '["parent"]'::jsonb;

-- 지각 기준(등원 마감): '08:20' 또는 '09:00' 그룹
alter table students add column if not exists expected_arrival text not null default '08:20';

-- 등록(수강) 종료일 — 출결 시 D-3부터 학생에게 재등록 안내
alter table students add column if not exists enrollment_end_date date;
-- 매주 성적 입력 대상 — 이번 주 미입력 시 관리자/학생에게 알림
alter table students add column if not exists weekly_grade_check boolean not null default false;

-- 휴가/반차/휴식권/병가 신청 내역 (LeaveRequest[])
alter table students add column if not exists leave_requests jsonb not null default '[]'::jsonb;
-- 반차 추가 신청용 쿠폰 잔액 (관리자 수동 지급/차감)
alter table students add column if not exists leave_coupons integer not null default 0;
-- 쿠폰 리워드 교환/지급 내역 (RewardRedemption[])
alter table students add column if not exists reward_redemptions jsonb not null default '[]'::jsonb;

-- 좌석 현황판 지정 좌석 번호
alter table students add column if not exists seat_number integer;

-- 벌점/상점 내역
alter table students add column if not exists penalties jsonb not null default '[]'::jsonb;

-- 관리자 발송 SMS 이력
alter table students add column if not exists sms_logs jsonb not null default '[]'::jsonb;

-- 학생별 모의고사 참여 상태
alter table students add column if not exists mock_exams jsonb not null default '[]'::jsonb;

-- 토요 지각/결석 증빙 내역
alter table students add column if not exists saturday_late_excuses jsonb not null default '[]'::jsonb;

-- 정기 외출/빠지는 시간대 목록 (awaySchedules)
alter table students add column if not exists away_schedules jsonb not null default '[]'::jsonb;

-- 휴대폰 보관/미제출 내역 (phoneSubmissions)
alter table students add column if not exists phone_submissions jsonb not null default '[]'::jsonb;

-- D-Day(시험/목표일) 멀티셋 (ddays)
alter table students add column if not exists ddays jsonb not null default '[]'::jsonb;

-- OT(특별 세션) 참여 내역 (otEvents)
alter table students add column if not exists ot_events jsonb not null default '[]'::jsonb;

-- 학생 활동 상태(뽀모도로/체크리스트/리워드/알림숨김) — specialNote(어드민 메모)와 분리
alter table students add column if not exists student_state jsonb not null default '{}'::jsonb;

-- 학원 캘린더 참여 미션 응답 내역 (eventParticipations)
alter table students add column if not exists event_participations jsonb not null default '[]'::jsonb;

-- 등하원/순공 세션 (QR 출결)
create table if not exists study_sessions (
  id          text primary key,
  student_id  text not null references students(id) on delete cascade,
  date        date not null,                 -- 로컬 날짜 (YYYY-MM-DD)
  check_in    timestamptz not null,
  check_out   timestamptz,                   -- 퇴실 전이면 null (진행 중)
  minutes     integer,                       -- 퇴실 시 계산된 체류(순공)분. 자동 하원(auto-sweep)은 null 유지
  source      text not null default 'qr',    -- 'qr' | 'manual' | 'auto-sweep'
  created_at  timestamptz not null default now()
);

create index if not exists idx_study_sessions_student on study_sessions (student_id);
create index if not exists idx_study_sessions_date on study_sessions (date);
-- 한 학생이 같은 시점에 '진행 중(미퇴실)' 세션을 중복 생성하지 못하도록 부분 유니크 인덱스
create unique index if not exists idx_study_sessions_open
  on study_sessions (student_id) where check_out is null;

-- 모의고사 일정 마스터
create table if not exists mock_exams (
  id           text primary key,
  name         text not null,
  date         date not null,
  created_at   timestamptz not null default now(),
  notified_at  timestamptz
);

create index if not exists idx_mock_exams_date on mock_exams (date desc);
-- 기존 mock_exams 테이블에 알림 발송 시각 컬럼 보강 (누락 시 일정 저장 실패)
alter table mock_exams add column if not exists notified_at timestamptz;
-- 센터별 모의고사 구분 (없으면 전체 센터)
alter table mock_exams add column if not exists campus text;

-- OT 일정 마스터
create table if not exists ot_events (
  id                text primary key,
  name              text not null,
  date              date not null,
  target_exam_types jsonb not null default '[]'::jsonb,
  created_at        timestamptz not null default now(),
  notified_at       timestamptz
);

create index if not exists idx_ot_events_date on ot_events (date desc);
-- 센터별 OT 구분 (없으면 전체 센터)
alter table ot_events add column if not exists campus text;
-- OT 알림과 함께 보낼 안내 메시지
alter table ot_events add column if not exists message text;

-- 학원 캘린더 일정 & 참여 미션 마스터
-- 일반 일정(공지·행사)과 참여 미션(대상 선정→알림→수락→행사 후 쿠폰 일괄 지급)을 통합.
create table if not exists campus_events (
  id                 text primary key,
  title              text not null,
  date               date not null,                 -- 시작일
  end_date           date,                           -- 종료일(다중일, 옵션)
  start_time         text,                           -- HH:MM (옵션)
  end_time           text,                           -- HH:MM (옵션)
  campus             text,                           -- 없으면 전체 센터
  category           text not null default 'general',-- 'general' | 'mission'
  memo               text,                           -- 안내 메모
  color              text,                           -- 표시 색(옵션)
  is_mission         boolean not null default false, -- 참여 후 쿠폰 지급 미션 여부
  coupon_reward      integer,                        -- 참여자 지급 쿠폰 수
  target_mode        text,                           -- 'campus' | 'students'
  target_student_ids jsonb not null default '[]'::jsonb,
  notified_at        timestamptz,                    -- 학생 알림 발송 시각
  rewarded_at        timestamptz,                    -- 쿠폰 일괄 지급 완료 시각
  created_at         timestamptz not null default now(),
  created_by         text
);

create index if not exists idx_campus_events_date on campus_events (date desc);

-- 도시락 신청 라운드 마스터 (주차별·센터별)
create table if not exists meal_plans (
  id           text primary key,
  week_start   date not null,                       -- 해당 주 월요일
  meals        jsonb not null default '["lunch"]'::jsonb, -- ['lunch'] | ['lunch','dinner']
  campus       text,                                -- 없으면 전체 센터
  deadline     timestamptz,                         -- 신청 마감 일시
  lunch_price  integer,                             -- 점심 단가(정산)
  dinner_price integer,                             -- 저녁 단가(정산)
  closed_days  jsonb not null default '[]'::jsonb,  -- 휴무 요일(['mon',...]) — 신청·표·정산 제외
  created_at   timestamptz not null default now(),
  notified_at  timestamptz
);

create index if not exists idx_meal_plans_week on meal_plans (week_start desc);
-- 기존 meal_plans 테이블 보강 (이미 생성된 경우)
alter table meal_plans add column if not exists closed_days jsonb not null default '[]'::jsonb;

-- 학생별 도시락 신청 (요일×끼니 selections + 마감후 추가신청)
alter table students add column if not exists meal_orders jsonb not null default '[]'::jsonb;

-- 출결판 미착석 알림(관리자 발송) — 학생 페이지 알림으로 노출
alter table students add column if not exists seat_alerts jsonb not null default '[]'::jsonb;

-- 학부모 공유 리포트 토큰/만료/비밀번호 (share-token 라우트 전담)
alter table students add column if not exists share_token text;
alter table students add column if not exists share_token_expires_at timestamptz;
alter table students add column if not exists share_password text;

-- 좌석 현황판 수동 상태
create table if not exists seat_statuses (
  date        text not null,
  seat_key    text not null,
  status      text not null default 'normal',
  updated_at  timestamptz not null default now(),
  primary key (date, seat_key)
);

-- 전역 설정(key/value JSONB) — 쿠폰 미션 설정 등
create table if not exists app_settings (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- 서비스 롤 키로만 접근하므로(RLS 미사용) 별도 정책 불필요.
-- 만약 anon 키로 클라이언트 직접 접근을 막고 싶다면 RLS 활성화 권장:
-- alter table students enable row level security;
-- alter table shared_materials enable row level security;
-- alter table study_sessions enable row level security;
