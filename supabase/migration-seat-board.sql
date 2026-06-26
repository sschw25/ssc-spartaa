-- SSC 스파르타 좌석 현황판 마이그레이션
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하세요.

-- 1. 학생 테이블에 좌석 번호 컬럼 추가
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS seat_number integer;

-- 2. 좌석 현황 상태 테이블
--    date: KST 날짜 (YYYY-MM-DD), seat_key: '1'~'39' 또는 'free-1'~'free-8'
--    status: 'normal' | 'lounge' | 'away' | 'unclear' | 'packing' | 'present' | 'absent'
CREATE TABLE IF NOT EXISTS seat_statuses (
  date        text    NOT NULL,
  seat_key    text    NOT NULL,
  status      text    NOT NULL DEFAULT 'normal',
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (date, seat_key)
);

-- 30일 이상 된 과거 기록 자동 정리 (선택 — 필요 시 cron으로 실행)
-- DELETE FROM seat_statuses WHERE date < (current_date - interval '30 days')::text;
