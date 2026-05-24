-- migration 177: platform_plan_quotas
-- Configurable per-plan resource limits. null = unlimited.
create table platform_plan_quotas (
  id                       uuid primary key default gen_random_uuid(),
  plan                     text not null unique
                             check (plan in ('free','trial','starter','growth','pro')),
  max_leads                int,
  max_staff_users          int,
  max_locations            int,
  monthly_sms_limit        int,
  monthly_ai_asks          int,
  video_renders_per_month  int,
  updated_at               timestamptz not null default now(),
  updated_by               uuid references profiles(id) on delete set null
);

insert into platform_plan_quotas
  (plan, max_leads, max_staff_users, max_locations, monthly_sms_limit, monthly_ai_asks, video_renders_per_month)
values
  ('free',    50,   1,    1,    100,  5,    0),
  ('trial',   100,  2,    1,    200,  10,   2),
  ('starter', 500,  3,    2,    1000, 20,   5),
  ('growth',  2000, 5,    5,    5000, 50,   20),
  ('pro',     null, null, null, null, null, null);
