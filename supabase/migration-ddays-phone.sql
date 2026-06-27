-- 누락 컬럼 보강 마이그레이션 (2026-06-26)
--
-- 증상: 모든 학생 저장(승인/반려, 쿠폰 조정, 상담/진도 저장 등)이 500 에러.
--   서버 로그: "Could not find the 'ddays' column of 'students' in the schema cache" (PGRST204)
-- 원인: studentToRow(lib/supabase.ts)가 phone_submissions / ddays 컬럼을 항상 upsert 하는데
--   해당 컬럼 ALTER가 운영 DB에 실행되지 않음. upsert는 전체 row를 한 번에 쓰므로
--   컬럼 하나만 없어도 모든 학생 저장이 깨진다.
-- 조치: 아래 SQL을 Supabase SQL Editor에서 1회 실행.

alter table students add column if not exists phone_submissions jsonb not null default '[]'::jsonb;
alter table students add column if not exists ddays jsonb not null default '[]'::jsonb;
