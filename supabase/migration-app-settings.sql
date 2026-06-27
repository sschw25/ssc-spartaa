-- 전역 설정 테이블 (2026-06-27) — 쿠폰 미션 설정(/admin/missions) 저장용.
-- 미실행 시: 미션 설정 읽기는 기본값으로 동작하지만, 설정 저장 시 에러가 난다.
-- Supabase SQL Editor에서 1회 실행.

create table if not exists app_settings (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
