-- 학생 활동 상태 분리 (2026-06-27)
-- specialNote(어드민 메모)와 학생 활동 상태(뽀모도로/체크리스트/리워드/알림숨김)를 분리.
-- 미실행 시: studentToRow가 student_state를 항상 upsert하므로 모든 학생 저장이 막힘.
-- 읽기 시 기존 specialNote 봉투와 자동 머지되므로 데이터 손실 없이 점진 이관됨.
-- Supabase SQL Editor에서 1회 실행.

alter table students add column if not exists student_state jsonb not null default '{}'::jsonb;
