-- 모의고사·OT 일정 센터별 구분: campus 컬럼 추가
-- ⚠️ 운영 DB에 직접 실행 필요. 미실행 시 saveMockExam/saveOtEvent 의 upsert가
--    'campus' 컬럼을 항상 포함하므로 모든 모의고사/OT 일정 저장이 깨진다.

alter table mock_exams add column if not exists campus text;
alter table ot_events  add column if not exists campus text;
