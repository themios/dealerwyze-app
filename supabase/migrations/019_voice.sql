-- 019_voice.sql
-- Voice Agent: calls ledger, org quota columns, org_settings hours/cell, helpers

-- Voice calls ledger
CREATE TABLE IF NOT EXISTS voice_calls (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id            UUID NOT NULL REFERENCES organizations(id),
  call_sid          TEXT NOT NULL UNIQUE,
  recording_sid     TEXT,
  recording_url     TEXT,
  from_number       TEXT NOT NULL,
  to_number         TEXT NOT NULL,
  duration_seconds  INTEGER,
  transcript        TEXT,
  summary_json      JSONB,
  status            TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress','dealer_answered','completed','failed','too_short')),
  customer_id       UUID REFERENCES customers(id) ON DELETE SET NULL,
  activity_id       UUID REFERENCES activities(id) ON DELETE SET NULL,
  task_id           UUID REFERENCES tasks(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Voice quota columns on organizations
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS voice_minutes_quota   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_voice_seconds INTEGER NOT NULL DEFAULT 0;

-- Business hours + dealer cell in org_settings
ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS voice_business_hours_start TEXT DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS voice_business_hours_end   TEXT DEFAULT '19:00',
  ADD COLUMN IF NOT EXISTS dealer_cell_number         TEXT;

-- RLS
ALTER TABLE voice_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "voice_calls_org_access" ON voice_calls
  FOR ALL USING (org_id::text = auth.uid()::text);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_voice_calls_org_created
  ON voice_calls(org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_voice_calls_customer
  ON voice_calls(customer_id) WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_voice_calls_status
  ON voice_calls(status);

-- Voice usage increment (atomic, avoids race conditions)
CREATE OR REPLACE FUNCTION increment_voice_usage(p_org_id UUID, p_seconds INTEGER)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE organizations
  SET monthly_voice_seconds = monthly_voice_seconds + p_seconds
  WHERE id = p_org_id;
END;
$$;
