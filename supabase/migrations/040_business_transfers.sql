-- Migration 040: Business Transfer / Ownership Transition
-- Tracks dealership ownership transfers between DealerWyze accounts.
-- Data stays in-place (same org_id); only the dealer_admin profile changes.

CREATE TABLE IF NOT EXISTS business_transfers (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID        NOT NULL REFERENCES organizations(id),
  initiated_by      UUID        NOT NULL,   -- profile.id of current dealer_admin
  new_owner_email   TEXT        NOT NULL,
  new_owner_user_id UUID        NULL,       -- filled when new owner claims the token
  transfer_token    TEXT        NOT NULL UNIQUE,
  token_expires_at  TIMESTAMPTZ NOT NULL,
  status            TEXT        NOT NULL DEFAULT 'pending_claim'
                      CHECK (status IN (
                        'pending_claim',    -- token generated, waiting for new owner to click link
                        'pending_approval', -- new owner claimed, waiting for SuperAdmin
                        'completed',        -- transfer executed
                        'cancelled',        -- cancelled by either party or SuperAdmin
                        'expired'           -- token TTL passed without claim
                      )),
  notes             TEXT        NULL,
  data_snapshot     JSONB       NULL,       -- {customers, vehicles, bhph_active, bhph_balance, templates}
  approved_by       UUID        NULL,
  approved_at       TIMESTAMPTZ NULL,
  completed_at      TIMESTAMPTZ NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup by token (only relevant for pending_claim rows)
CREATE INDEX idx_business_transfers_token
  ON business_transfers (transfer_token)
  WHERE status = 'pending_claim';

-- Admin dashboard: pending items sorted newest first
CREATE INDEX idx_business_transfers_pending
  ON business_transfers (created_at DESC)
  WHERE status IN ('pending_claim', 'pending_approval');

-- Enforce: only one active transfer per org at a time (application-level check uses this)
CREATE INDEX idx_business_transfers_org_active
  ON business_transfers (org_id)
  WHERE status NOT IN ('completed', 'cancelled', 'expired');

-- RLS: SuperAdmin reads all; dealer_admin reads their own org's transfers
ALTER TABLE business_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "superadmin_all_transfers"
  ON business_transfers FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM platform_superusers WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "dealer_admin_own_org_transfers"
  ON business_transfers FOR SELECT
  USING (
    org_id = public.get_org_id()
  );
