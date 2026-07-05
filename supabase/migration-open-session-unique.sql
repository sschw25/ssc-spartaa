-- SSC 등하원 open 세션 중복 방지 마이그레이션
-- 운영 DB에 1회 실행 필요 — Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하세요.
--
-- 배경: 이중 체크인 레이스가 발생하면 한 학생에게 check_out IS NULL 인 세션이
-- 2건 이상 남을 수 있다. 코드(getOpenSessionSupabase)는 최신 1건을 쓰도록 방어했지만,
-- 근본 차단을 위해 "학생당 열린 세션 최대 1건"을 DB 부분 유니크 인덱스로 강제한다.

-- 1. 기존 중복 open 세션 정리 (인덱스 생성 전에 반드시 실행)
--    학생별로 가장 최근 check_in 1건만 열린 채로 두고, 나머지는 auto-sweep 과 동일하게
--    minutes 없이 닫는다(순공시간 오염 방지).
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY student_id ORDER BY check_in DESC) AS rn
  FROM study_sessions
  WHERE check_out IS NULL
)
UPDATE study_sessions s
SET check_out = now(),
    minutes = NULL,
    source = 'dedupe-cleanup'
FROM ranked r
WHERE s.id = r.id
  AND r.rn > 1;

-- 2. 부분 유니크 인덱스: 학생당 open 세션(check_out IS NULL) 1건만 허용
CREATE UNIQUE INDEX IF NOT EXISTS study_sessions_one_open_per_student
  ON study_sessions (student_id)
  WHERE check_out IS NULL;
