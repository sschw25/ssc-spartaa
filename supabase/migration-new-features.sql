-- SSC 스파르타 신규 기능 마이그레이션 (2026-06)
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하세요.
-- 순서대로 실행하면 멱등합니다 (IF NOT EXISTS 사용).

-- 1. 벌점/상점 내역
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS penalties jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2. 관리자 발송 SMS 이력
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS sms_logs jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 3. 모의고사 참여 상태 (학생별)
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS mock_exams jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 4. 모의고사 일정 마스터 테이블
CREATE TABLE IF NOT EXISTS mock_exams (
  id           text PRIMARY KEY,
  name         text NOT NULL,
  date         date NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  notified_at  timestamptz
);

-- 기존 테이블이 이미 있는 경우 notified_at 컬럼 추가
ALTER TABLE mock_exams
  ADD COLUMN IF NOT EXISTS notified_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_mock_exams_date ON mock_exams (date DESC);
