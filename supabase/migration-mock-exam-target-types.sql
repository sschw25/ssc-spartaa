-- mock_exams.target_exam_types 컬럼 보강
-- 대상 목표시험 유형([] = 전체)을 저장해 학생 모의고사 노출/응답 범위를 제한한다.
alter table mock_exams add column if not exists target_exam_types jsonb not null default '[]'::jsonb;
