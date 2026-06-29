-- 학원 캘린더 일정 & 참여 미션 (2026-06-29)
-- ⚠️ 운영 DB에 직접 실행 필요.
--   - students.event_participations 가 studentToRow 에 포함되므로, 미실행 시
--     PGRST204(Could not find column 'event_participations')로 모든 학생 저장이 깨진다.
--   - campus_events 테이블 미생성 시 캘린더 일정/미션 저장(upsert)이 500.

-- 1) 학생 컬럼: 참여 미션 응답 내역
alter table students add column if not exists event_participations jsonb not null default '[]'::jsonb;

-- 2) 캘린더 일정 & 참여 미션 마스터
create table if not exists campus_events (
  id                 text primary key,
  title              text not null,
  date               date not null,
  end_date           date,
  start_time         text,
  end_time           text,
  campus             text,
  category           text not null default 'general',
  memo               text,
  color              text,
  is_mission         boolean not null default false,
  coupon_reward      integer,
  target_mode        text,
  target_student_ids jsonb not null default '[]'::jsonb,
  notified_at        timestamptz,
  rewarded_at        timestamptz,
  created_at         timestamptz not null default now(),
  created_by         text
);

create index if not exists idx_campus_events_date on campus_events (date desc);
