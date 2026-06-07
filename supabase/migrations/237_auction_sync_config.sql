-- Create org_auction_sync_config table for Copart and ACV platform integration
CREATE TABLE IF NOT EXISTS org_auction_sync_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,

  -- Master enable/disable
  enabled BOOLEAN DEFAULT false,

  -- Copart platform
  copart_enabled BOOLEAN DEFAULT false,
  copart_api_key TEXT,  -- Should be encrypted via vault.ts
  copart_username TEXT,

  -- ACV Auctions platform
  acv_enabled BOOLEAN DEFAULT false,
  acv_api_key TEXT,     -- Should be encrypted via vault.ts

  -- Sync configuration
  sync_interval_hours INT DEFAULT 6,
  auto_import BOOLEAN DEFAULT true,

  -- Last sync tracking
  last_sync_at TIMESTAMP WITH TIME ZONE,
  last_sync_status TEXT,  -- 'success' | 'failed' | 'partial'
  last_sync_error TEXT,
  last_sync_count INT DEFAULT 0,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add index for org lookup and sync timestamp queries
CREATE INDEX IF NOT EXISTS idx_org_auction_sync_org_id ON org_auction_sync_config(org_id);
CREATE INDEX IF NOT EXISTS idx_org_auction_sync_enabled ON org_auction_sync_config(enabled) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_org_auction_sync_last_sync ON org_auction_sync_config(last_sync_at);

-- Add audit trigger for updated_at
CREATE TRIGGER update_org_auction_sync_config_updated_at
  BEFORE UPDATE ON org_auction_sync_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS: Only org members can read/write their own config
ALTER TABLE org_auction_sync_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their org auction sync config"
  ON org_auction_sync_config FOR SELECT
  USING (auth.uid() IN (
    SELECT user_id FROM user_organizations WHERE org_id = org_auction_sync_config.org_id
  ));

CREATE POLICY "Users can update their org auction sync config"
  ON org_auction_sync_config FOR UPDATE
  USING (auth.uid() IN (
    SELECT user_id FROM user_organizations WHERE org_id = org_auction_sync_config.org_id
  ));

-- Cron/service role can read all (for sync job)
CREATE POLICY "Service role can read all auction sync configs"
  ON org_auction_sync_config FOR SELECT
  USING (auth.role() = 'service_role');
