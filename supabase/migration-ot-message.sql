-- OT 알림과 함께 보낼 안내 메시지 컬럼 (#1)
-- 운영 DB에 직접 실행. 미실행 시 OT 저장 시 message 컬럼 누락으로 실패할 수 있음.
alter table ot_events add column if not exists message text;
