-- SSC 어드민 학습관리 스키마 (Supabase / Postgres)
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하세요.
-- 현재 Student 객체 구조를 거의 1:1로 매핑 (subjects/consultation_logs/grades 는 JSONB).
-- 최상위 books/lectures 는 subjects 에서 파생되므로 저장하지 않음(단일 진실 소스).

create table if not exists students (
  id                     text primary key,
  name                   text not null,
  campus                 text not null default 'wonju',
  manager                text not null default '',
  contact                text not null default '',
  next_consultation_date date,
  speed_multiplier       numeric not null default 1.0,
  life_comment           text not null default '',
  special_note           text not null default '',
  student_life_comment   text not null default '',
  subjects               jsonb not null default '[]'::jsonb,
  consultation_logs      jsonb not null default '[]'::jsonb,
  grades                 jsonb not null default '[]'::jsonb,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists idx_students_campus on students (campus);
create index if not exists idx_students_next_consult on students (next_consultation_date);

create table if not exists shared_materials (
  id                       text primary key,
  type                     text not null,            -- 'book' | 'lecture'
  name                     text not null,
  subject                  text not null default '',
  publisher                text not null default '',
  author                   text not null default '',
  total_pages_or_lectures  integer not null default 0,
  unit                     text not null default '',
  created_at               timestamptz not null default now()
);

create index if not exists idx_shared_materials_type on shared_materials (type);
create index if not exists idx_shared_materials_subject on shared_materials (subject);

-- 서비스 롤 키로만 접근하므로(RLS 미사용) 별도 정책 불필요.
-- 만약 anon 키로 클라이언트 직접 접근을 막고 싶다면 RLS 활성화 권장:
-- alter table students enable row level security;
-- alter table shared_materials enable row level security;
