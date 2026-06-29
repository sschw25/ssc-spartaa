-- 쿠폰 리워드 교환/지급 내역: reward_redemptions 컬럼 추가
-- ⚠️ 운영 DB에 직접 실행 필요. 미실행 시 studentToRow 가 reward_redemptions 를 항상
--    upsert 하므로 모든 학생 저장(출결/진도/상담/쿠폰 포함)이 깨진다.

alter table students add column if not exists reward_redemptions jsonb not null default '[]'::jsonb;
