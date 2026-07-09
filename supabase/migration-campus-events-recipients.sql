-- 참여 미션(캠퍼스 행사) 명시 수신자 목록 (2026-07-09)
-- ⚠️ 운영 DB에 직접 실행 필요.
--   - 참여 미션 학생 알림을 "고른 학생에게만" 발송할 때 체크한 학생 id 목록(recipientStudentIds)을 저장한다.
--   - 정의되면(비어있지 않으면) 그 학생에게만 노출/응답 가능, 미정의/빈 배열이면 기존 campus/target_student_ids 로 폴백.
--   - 컬럼 형식은 sibling 컬럼(campus_events.target_student_ids, mock_exams.recipient_student_ids)과 동일한 jsonb 배열.
--   - 미실행 시 알림 발송 PATCH에서 recipient_student_ids upsert가 PGRST204로 실패한다.

alter table campus_events add column if not exists recipient_student_ids jsonb not null default '[]'::jsonb;
