-- admin_accounts 테이블 생성 SQL
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하세요.

CREATE TABLE IF NOT EXISTS admin_accounts (
  id          TEXT PRIMARY KEY,
  username    TEXT NOT NULL UNIQUE,
  password    TEXT NOT NULL, -- bcryptjs 로 암호화된 비밀번호 해시
  campus      TEXT NOT NULL DEFAULT 'all', -- 'wonju' | 'chuncheon' | 'chungju' | 'all'
  role        TEXT NOT NULL DEFAULT 'campus_admin', -- 'super' | 'campus_admin'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 인덱스 추가 (빠른 조회를 위함)
CREATE INDEX IF NOT EXISTS idx_admin_accounts_username ON admin_accounts (username);
CREATE INDEX IF NOT EXISTS idx_admin_accounts_campus ON admin_accounts (campus);
