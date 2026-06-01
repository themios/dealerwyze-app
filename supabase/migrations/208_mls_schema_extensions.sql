-- Migration 208: MLS schema extensions
-- Add MLS-specific columns to vehicles table
-- Create mls_sync_log table for audit trail

-- Step 0: Add org_id to vehicles table (multi-tenant scoping)
-- Note: vehicles table is from migration 001. RLS is disabled during schema change.
-- org_id is nullable initially; populate via separate migration once org mapping is determined
BEGIN;
ALTER TABLE vehicles DISABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS org_id UUID;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
COMMIT;

-- Step 1: Add MLS columns to vehicles table
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS mls_number TEXT;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS mls_board_id TEXT;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS mls_synced_at TIMESTAMP;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS mls_source TEXT DEFAULT 'bridge';
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS price_history JSONB DEFAULT '[]'::jsonb;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS dom INTEGER;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS listing_status TEXT DEFAULT 'active';

-- Step 2: Create mls_sync_log table (audit trail for syncs)
CREATE TABLE IF NOT EXISTS mls_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  mls_board_id TEXT NOT NULL,
  synced_at TIMESTAMP NOT NULL DEFAULT now(),
  listings_synced INT,
  listings_created INT,
  listings_updated INT,
  errors TEXT,
  status TEXT DEFAULT 'pending'
);

-- Step 3: Add indexes for MLS queries
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_mls_org ON vehicles(mls_number, org_id) WHERE mls_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vehicles_mls_number ON vehicles(mls_number) WHERE mls_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vehicles_mls_board ON vehicles(mls_board_id) WHERE mls_board_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vehicles_mls_synced ON vehicles(mls_synced_at DESC) WHERE mls_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mls_sync_log_agent ON mls_sync_log(agent_id);
CREATE INDEX IF NOT EXISTS idx_mls_sync_log_board ON mls_sync_log(mls_board_id);

-- Backfill columns if mls_sync_log predates this migration shape
ALTER TABLE mls_sync_log ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE mls_sync_log ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE mls_sync_log ADD COLUMN IF NOT EXISTS mls_board_id TEXT;
ALTER TABLE mls_sync_log ADD COLUMN IF NOT EXISTS synced_at TIMESTAMP DEFAULT now();
ALTER TABLE mls_sync_log ADD COLUMN IF NOT EXISTS listings_synced INT;
ALTER TABLE mls_sync_log ADD COLUMN IF NOT EXISTS listings_created INT;
ALTER TABLE mls_sync_log ADD COLUMN IF NOT EXISTS listings_updated INT;
ALTER TABLE mls_sync_log ADD COLUMN IF NOT EXISTS errors TEXT;
ALTER TABLE mls_sync_log ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';

-- Step 4: RLS policy for mls_sync_log (agents can see their own sync logs)
ALTER TABLE mls_sync_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agents_view_own_mls_syncs" ON mls_sync_log;
CREATE POLICY "agents_view_own_mls_syncs" ON mls_sync_log
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "service_role_manage_mls_syncs" ON mls_sync_log;
CREATE POLICY "service_role_manage_mls_syncs" ON mls_sync_log
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Step 5: Create webhook idempotency table (prevents duplicate webhook processing)
CREATE TABLE IF NOT EXISTS webhook_idempotency (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL, -- e.g. 'bridge', 'stripe', 'twilio'
  processed_at TIMESTAMP NOT NULL DEFAULT now(),
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_webhook_idempotency_provider ON webhook_idempotency(provider, processed_at DESC);

-- Clean up old webhook records (older than 30 days)
-- This could be a scheduled job, but for now it's a manual maintenance task
ALTER TABLE webhook_idempotency SET (fillfactor = 80);
