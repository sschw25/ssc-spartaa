-- mock_exams.notified_at 컬럼 보강 (2026-06-28)
-- 증상: 모의고사 일정 등록/알림이 "Could not find the 'notified_at' column" 으로 500.
-- 원인: 기존 mock_exams 테이블에 notified_at 컬럼이 없음(초기 마이그레이션의 ALTER 미실행).
-- Supabase SQL Editor에서 1회 실행.

alter table mock_exams add column if not exists notified_at timestamptz;
