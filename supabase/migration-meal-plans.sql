-- 도시락 신청 기능 마이그레이션 (2026-06-29)
-- ⚠️ 운영 DB에 직접 실행 필요.
--    studentToRow 가 meal_orders 컬럼을 항상 upsert 하므로, 미실행 시 PGRST204
--    ("Could not find the 'meal_orders' column")로 모든 학생 저장(출결/진도/상담/인박스 승인 포함)이 깨진다.

-- 1) 도시락 신청 라운드 마스터 (주차별·센터별)
create table if not exists meal_plans (
  id           text primary key,
  week_start   date not null,                             -- 해당 주 월요일
  meals        jsonb not null default '["lunch"]'::jsonb, -- ['lunch'] | ['lunch','dinner']
  campus       text,                                      -- 없으면 전체 센터
  deadline     timestamptz,                               -- 신청 마감 일시
  lunch_price  integer,                                   -- 점심 단가(정산)
  dinner_price integer,                                   -- 저녁 단가(정산)
  closed_days  jsonb not null default '[]'::jsonb,        -- 휴무 요일(['mon',...]) — 신청·표·정산 제외
  created_at   timestamptz not null default now(),
  notified_at  timestamptz
);

create index if not exists idx_meal_plans_week on meal_plans (week_start desc);
-- 이미 meal_plans 가 있던 경우 컬럼 보강
alter table meal_plans add column if not exists closed_days jsonb not null default '[]'::jsonb;

-- 2) 학생별 도시락 신청 (요일×끼니 selections + 마감후 추가신청)
alter table students add column if not exists meal_orders jsonb not null default '[]'::jsonb;
