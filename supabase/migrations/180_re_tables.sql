-- 180_re_tables.sql
-- Phase 1B: New RE-specific tables.
-- RLS uses org_id directly (unlike customers/activities which use user_id).
-- Tim applies this manually in Supabase SQL editor.

-- Showings (replaces "test drives" for RE vertical)
-- listing_id references vehicles(id) in Option A; column name is future-proof for Option B.
CREATE TABLE IF NOT EXISTS showings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL,
  listing_id      UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  contact_id      UUID REFERENCES customers(id),
  agent_id        UUID REFERENCES profiles(id),
  scheduled_at    TIMESTAMPTZ NOT NULL,
  status          TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','cancelled','no_show')),
  feedback_json   JSONB,  -- {interest_level, price_feedback, objections, notes}
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Transactions (accepted offer through closing)
CREATE TABLE IF NOT EXISTS transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL,
  vehicle_id        UUID REFERENCES vehicles(id),
  buyer_id          UUID REFERENCES customers(id),
  seller_id         UUID REFERENCES customers(id),
  listing_agent_id  UUID REFERENCES profiles(id),
  buyer_agent_id    UUID REFERENCES profiles(id),
  closing_date      DATE,
  closing_price     DECIMAL(12,2),
  commission_pct    DECIMAL(5,2),
  co_broke_pct      DECIMAL(5,2),
  gci_listing       DECIMAL(10,2),
  gci_buyer         DECIMAL(10,2),
  status            TEXT DEFAULT 'pending' CHECK (status IN ('pending','closed','cancelled')),
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- Commission split plans per agent (or office default when agent_id is null)
CREATE TABLE IF NOT EXISTS commission_plans (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL,
  agent_id       UUID REFERENCES profiles(id),
  tier_name      TEXT,
  threshold_gci  DECIMAL(10,2),
  split_pct      DECIMAL(5,2),
  effective_at   DATE,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE showings ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_plans ENABLE ROW LEVEL SECURITY;

-- RLS: org isolation using existing get_org_id() SECURITY DEFINER function
DROP POLICY IF EXISTS showings_org ON showings;
DROP POLICY IF EXISTS transactions_org ON transactions;
DROP POLICY IF EXISTS commission_plans_org ON commission_plans;

CREATE POLICY showings_org ON showings
  USING (org_id = public.get_org_id());

CREATE POLICY transactions_org ON transactions
  USING (org_id = public.get_org_id());

CREATE POLICY commission_plans_org ON commission_plans
  USING (org_id = public.get_org_id());

-- Indexes for common lookups
CREATE INDEX IF NOT EXISTS showings_org_id_idx      ON showings(org_id);
CREATE INDEX IF NOT EXISTS showings_listing_id_idx   ON showings(listing_id);
CREATE INDEX IF NOT EXISTS showings_contact_id_idx   ON showings(contact_id);
CREATE INDEX IF NOT EXISTS transactions_org_id_idx   ON transactions(org_id);
CREATE INDEX IF NOT EXISTS commission_plans_org_idx  ON commission_plans(org_id);
