create table platform_content_config (
  id                        uuid primary key default gen_random_uuid(),
  marketing_org_id          uuid references organizations(id) on delete set null,
  default_platforms         text[] not null default '{instagram,tiktok}',
  weekly_generator_enabled  boolean not null default false,
  weekly_generator_day      int  not null default 0
                              check (weekly_generator_day between 0 and 6),
  weekly_generator_hour_utc int  not null default 15
                              check (weekly_generator_hour_utc between 0 and 23),
  default_content_themes    text[] not null default '{lead_follow_up,platform_spotlight}',
  ai_brand_voice_prompt     text,
  tavily_categories         text[] not null default '{automotive,crm,dealer}',
  posts_per_week            int  not null default 7,
  updated_at                timestamptz not null default now(),
  updated_by                uuid references profiles(id) on delete set null
);
insert into platform_content_config (id) values (gen_random_uuid());
