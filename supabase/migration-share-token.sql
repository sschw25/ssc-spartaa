-- 학부모 공유 리포트 토큰/만료/비밀번호 컬럼.
-- lib/supabase.ts(rowToStudent 매핑)와 share-token 라우트가 이미 이 컬럼을 쓰지만 SQL 정의가 없었음.
-- 운영 DB에 1회 실행 필요.
alter table students add column if not exists share_token text;
alter table students add column if not exists share_token_expires_at timestamptz;
alter table students add column if not exists share_password text;
