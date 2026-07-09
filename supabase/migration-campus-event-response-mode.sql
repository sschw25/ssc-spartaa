-- 캘린더 일정 학생 응답 모드 (2026-07-09)
-- ⚠️ 운영 DB에 직접 실행 필요.
--   관리자가 일정 등록 시 학생 응답 방식을 선택할 수 있게 하는 컬럼.
--   - response_mode: 'none'(알림만·기본) | 'attendance'(참석/불참 응답) | 'postTask'(행사 후 제출/확인)
--   - post_task_*  : response_mode='postTask' 전용 (사후 과제 라벨/마감일/이동 링크)
--   미실행 시 일정 등록/조회에서 해당 컬럼 upsert가 PGRST204로 실패한다.
--   기존 일정은 default 'none'(알림만)으로 동작하므로 하위호환 안전.

alter table campus_events add column if not exists response_mode      text        not null default 'none';
alter table campus_events add column if not exists post_task_label    text;
alter table campus_events add column if not exists post_task_due_date date;
alter table campus_events add column if not exists post_task_href     text;

-- 사진 공지(category='notice') 전용 — 이미지는 Supabase Storage('announcements' 버킷)에 저장하고
-- 여기엔 공개 URL과 삭제용 경로(key)만 보관한다. (이미지 바이너리를 DB에 넣지 않음)
alter table campus_events add column if not exists image_url          text;
alter table campus_events add column if not exists image_path         text;
