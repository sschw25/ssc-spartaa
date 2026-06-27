-- OT(특별 세션) 일정+참여 기능 (2026-06-27) — 쿠폰 미션 'OT 참여' 연동.
-- 미실행 시: OT 일정 등록/조회 및 참여 저장이 실패한다.
-- Supabase SQL Editor에서 1회 실행.

-- 1) OT 일정 마스터 테이블
create table if not exists ot_events (
  id                text primary key,
  name              text not null,
  date              date not null,
  target_exam_types jsonb not null default '[]'::jsonb,
  created_at        timestamptz not null default now(),
  notified_at       timestamptz
);
create index if not exists idx_ot_events_date on ot_events (date desc);

-- 2) 학생별 OT 참여 내역 컬럼
alter table students add column if not exists ot_events jsonb not null default '[]'::jsonb;
