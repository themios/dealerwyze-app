-- supabase/migrations/100_customer_pulse.sql

-- One survey event per customer per trigger
create table if not exists pulse_surveys (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  customer_id     uuid not null references customers(id) on delete cascade,
  assigned_rep_id uuid references profiles(id) on delete set null,
  trigger_type    text not null check (trigger_type in ('sold', 'manual', 'day30', 'day180')),
  token           text not null unique default encode(gen_random_bytes(32), 'base64url'),
  sent_at         timestamptz,
  opened_at       timestamptz,
  completed_at    timestamptz,
  expires_at      timestamptz not null default (now() + interval '30 days'),
  depth_chosen    text check (depth_chosen in ('quick', 'standard', 'full')),
  wants_followup  boolean,
  overall_score   numeric(3,2),
  created_at      timestamptz not null default now()
);

-- One row per question per survey
create table if not exists pulse_responses (
  id           uuid primary key default gen_random_uuid(),
  survey_id    uuid not null references pulse_surveys(id) on delete cascade,
  org_id       uuid not null,
  category     text not null check (category in ('first_contact','rep','vehicle','process','facility','post_sale')),
  question_key text not null,
  score        int not null check (score between 1 and 5),
  comment      text,
  created_at   timestamptz not null default now()
);

-- PDCA improvement actions
create table if not exists pulse_actions (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  category     text not null check (category in ('first_contact','rep','vehicle','process','facility','post_sale')),
  plan_text    text not null,
  assigned_to  uuid references profiles(id) on delete set null,
  due_at       timestamptz,
  status       text not null default 'plan' check (status in ('plan','doing','checking','standardized')),
  score_before numeric(3,2),
  score_after  numeric(3,2),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- org_settings additions
alter table org_settings
  add column if not exists pulse_enabled           boolean not null default false,
  add column if not exists pulse_auto_send_on_sold boolean not null default true,
  add column if not exists pulse_send_day30        boolean not null default true,
  add column if not exists pulse_send_day180       boolean not null default false;

-- profiles additions
alter table profiles
  add column if not exists pulse_score            numeric(3,2),
  add column if not exists pulse_score_updated_at timestamptz;

-- RLS
alter table pulse_surveys   enable row level security;
alter table pulse_responses enable row level security;
alter table pulse_actions   enable row level security;

create policy "pulse_surveys_org"   on pulse_surveys   using (org_id = public.get_org_id());
create policy "pulse_responses_org" on pulse_responses  using (org_id = public.get_org_id());
create policy "pulse_actions_org"   on pulse_actions    using (org_id = public.get_org_id());

-- Indexes
create index if not exists pulse_surveys_org_idx      on pulse_surveys(org_id);
create index if not exists pulse_surveys_customer_idx on pulse_surveys(customer_id);
create index if not exists pulse_surveys_token_idx    on pulse_surveys(token);
create index if not exists pulse_surveys_rep_idx      on pulse_surveys(assigned_rep_id);
create index if not exists pulse_responses_survey_idx on pulse_responses(survey_id);
create index if not exists pulse_responses_org_idx    on pulse_responses(org_id);
create index if not exists pulse_actions_org_idx      on pulse_actions(org_id);
