-- Migration 076: Customer Retention Suite
-- Apply in Supabase SQL editor

-- ── 1. Customer retention + address fields ────────────────────────────────────
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS birthday          date,
  ADD COLUMN IF NOT EXISTS last_service_date date,
  ADD COLUMN IF NOT EXISTS referred_by       uuid references customers(id) on delete set null,
  ADD COLUMN IF NOT EXISTS referral_source   text,
  ADD COLUMN IF NOT EXISTS address           text,
  ADD COLUMN IF NOT EXISTS city              text,
  ADD COLUMN IF NOT EXISTS state             text;

CREATE INDEX IF NOT EXISTS idx_customers_birthday_month_day
  ON customers (EXTRACT(MONTH FROM birthday), EXTRACT(DAY FROM birthday))
  WHERE birthday IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_last_service_date
  ON customers (last_service_date)
  WHERE last_service_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_referred_by
  ON customers (referred_by)
  WHERE referred_by IS NOT NULL;

-- ── 2. PostGrid API key per dealer ────────────────────────────────────────────
ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS postgrid_api_key text;

-- ── 3. Sequences: retention trigger metadata ──────────────────────────────────
ALTER TABLE sequences
  ADD COLUMN IF NOT EXISTS trigger_type   text
    CHECK (trigger_type IS NULL OR trigger_type IN
      ('manual', 'birthday', 'sale_anniversary', 'service_due', 'post_sale', 'referral_thankyou')),
  ADD COLUMN IF NOT EXISTS trigger_config jsonb;

-- Extend channel check to include 'card'
ALTER TABLE sequences
  DROP CONSTRAINT IF EXISTS sequences_channel_check;
ALTER TABLE sequences
  ADD CONSTRAINT sequences_channel_check
    CHECK (channel IN ('sms', 'email', 'card'));

-- ── 4. customer_sequences: extend channel for card ───────────────────────────
ALTER TABLE customer_sequences
  DROP CONSTRAINT IF EXISTS customer_sequences_channel_check;
ALTER TABLE customer_sequences
  ADD CONSTRAINT customer_sequences_channel_check
    CHECK (channel IS NULL OR channel IN ('email', 'sms', 'card'));

-- ── 5. Retention settings per org ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS retention_settings (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid not null references organizations(id) on delete cascade,
  birthday_sequence_id        uuid references sequences(id) on delete set null,
  anniversary_sequence_id     uuid references sequences(id) on delete set null,
  service_due_sequence_id     uuid references sequences(id) on delete set null,
  post_sale_sequence_id       uuid references sequences(id) on delete set null,
  referral_thankyou_sequence_id uuid references sequences(id) on delete set null,
  -- days before the event to trigger enrollment (0 = on the day)
  birthday_days_before        int not null default 0,
  anniversary_days_before     int not null default 0,
  -- days since last_service_date before triggering service_due
  service_due_days            int not null default 60,
  -- days after sale (customer_vehicles.created_at) before post_sale trigger
  post_sale_delay_days        int not null default 7,
  -- card delivery method preference: 'postgrid' | 'print_and_mail'
  card_delivery_method        text not null default 'print_and_mail'
    check (card_delivery_method in ('postgrid', 'print_and_mail')),
  updated_at                  timestamptz not null default now(),
  UNIQUE (org_id)
);

ALTER TABLE retention_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "retention_settings_org" ON retention_settings;
CREATE POLICY "retention_settings_org" ON retention_settings
  USING (org_id = public.get_org_id())
  WITH CHECK (org_id = public.get_org_id());

-- ── 6. Card mailings log ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS card_mailings (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references organizations(id) on delete cascade,
  customer_id            uuid not null references customers(id) on delete cascade,
  customer_sequence_id   uuid references customer_sequences(id) on delete set null,
  trigger_type           text,
  delivery_method        text not null default 'print_and_mail'
    check (delivery_method in ('postgrid', 'print_and_mail')),
  status                 text not null default 'pending'
    check (status in ('pending', 'print_ready', 'queued', 'mailed', 'delivered', 'failed', 'cancelled')),
  -- PostGrid fields (only used when delivery_method = 'postgrid')
  postgrid_job_id        text unique,
  estimated_delivery     date,
  -- PDF batch fields (only used when delivery_method = 'print_and_mail')
  batch_week             text,   -- ISO week: '2026-W12'
  pdf_url                text,   -- Storage URL of generated PDF
  -- Task created for receptionist to print+mail
  print_task_id          uuid references tasks(id) on delete set null,
  error_msg              text,
  created_at             timestamptz not null default now(),
  mailed_at              timestamptz
);

CREATE INDEX IF NOT EXISTS idx_card_mailings_org_id
  ON card_mailings (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_card_mailings_customer_id
  ON card_mailings (customer_id);
CREATE INDEX IF NOT EXISTS idx_card_mailings_batch_week
  ON card_mailings (org_id, batch_week)
  WHERE batch_week IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_card_mailings_pending
  ON card_mailings (status, delivery_method)
  WHERE status = 'pending';

ALTER TABLE card_mailings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "card_mailings_org" ON card_mailings;
CREATE POLICY "card_mailings_org" ON card_mailings
  USING (org_id = public.get_org_id())
  WITH CHECK (org_id = public.get_org_id());
