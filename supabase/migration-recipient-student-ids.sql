-- OT·모의고사 명시 수신자 목록 (2026-07-08)
-- ⚠️ 운영 DB에 직접 실행 필요.
--   - 알림 발송 시 관리자가 체크한 학생 id 목록(recipientStudentIds)을 저장한다.
--   - 정의되면(비어있지 않으면) 그 학생에게만 노출, 미정의/빈 배열이면 기존 target_exam_types 직렬 매칭으로 폴백.
--   - 컬럼 형식은 sibling 컬럼(mock_exams.target_exam_types, campus_events.target_student_ids)과 동일한 jsonb 배열.
--   - 미실행 시 알림 발송 PATCH에서 recipient_student_ids upsert가 PGRST204로 실패한다.

alter table mock_exams add column if not exists recipient_student_ids jsonb not null default '[]'::jsonb;
alter table ot_events  add column if not exists recipient_student_ids jsonb not null default '[]'::jsonb;
