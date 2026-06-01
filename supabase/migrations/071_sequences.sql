-- sequences: org-owned named cadences per channel
CREATE TABLE IF NOT EXISTS sequences (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  name       text not null,
  channel    text not null check (channel in ('sms', 'email')),
  auto_mode  text not null default 'manual' check (auto_mode in ('manual', 'semi_auto', 'full_auto')),
  created_at timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS idx_sequences_org_id on sequences(org_id);
ALTER TABLE sequences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sequences_org" ON sequences;
CREATE POLICY "sequences_org" on sequences
  using (org_id = public.get_org_id())
  with check (org_id = public.get_org_id());

-- sequence_steps: ordered steps with day offset + send hour
CREATE TABLE IF NOT EXISTS sequence_steps (
  id          uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references sequences(id) on delete cascade,
  sort_order  int  not null default 0,
  day_offset  int  not null default 0,
  send_hour   int  not null default 9 check (send_hour >= 0 and send_hour <= 23),
  template_id uuid references templates(id) on delete set null,
  created_at  timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS idx_sequence_steps_seq_id on sequence_steps(sequence_id);
ALTER TABLE sequence_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sequence_steps_org" ON sequence_steps;
CREATE POLICY "sequence_steps_org" on sequence_steps
  using (
    sequence_id in (select id from sequences where org_id = public.get_org_id())
  )
  with check (
    sequence_id in (select id from sequences where org_id = public.get_org_id())
  );

-- customer_sequences: enrollment tracking per lead
CREATE TABLE IF NOT EXISTS customer_sequences (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references customers(id) on delete cascade,
  sequence_id  uuid not null references sequences(id) on delete cascade,
  org_id       uuid not null,
  status       text not null default 'active'
                 check (status in ('active', 'paused', 'completed', 'cancelled')),
  enrolled_at  timestamptz not null default now(),
  completed_at timestamptz,
  created_at   timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS idx_cseq_customer_id on customer_sequences(customer_id);
CREATE INDEX IF NOT EXISTS idx_cseq_sequence_id on customer_sequences(sequence_id);
CREATE INDEX IF NOT EXISTS idx_cseq_active on customer_sequences(status) where status = 'active';
ALTER TABLE customer_sequences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "customer_sequences_org" ON customer_sequences;
CREATE POLICY "customer_sequences_org" on customer_sequences
  using (org_id = public.get_org_id())
  with check (org_id = public.get_org_id());

-- unsubscribe columns on customers
alter table customers
  add column if not exists unsubscribe_sms   boolean not null default false,
  add column if not exists unsubscribe_email boolean not null default false,
  add column if not exists unsubscribed_at   timestamptz;

-- customer_sequence_id FK on activities for cron auto-fire
ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS customer_sequence_id uuid REFERENCES customer_sequences(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_activities_customer_sequence_id on activities(customer_sequence_id)
  WHERE customer_sequence_id IS NOT NULL;
