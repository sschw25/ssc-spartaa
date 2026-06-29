-- 출결판 미착석 알림(관리자 발송) — 학생 페이지 알림으로 누적 노출, 확인 시 dismiss
-- 운영 DB에 1회 실행 필요.
alter table students add column if not exists seat_alerts jsonb not null default '[]'::jsonb;
