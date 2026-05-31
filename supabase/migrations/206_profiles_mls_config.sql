-- Migration 206: Add MLS configuration fields to profiles
-- Allows agents to store their MLS board, license, and Bridge API credentials

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS mls_board_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bridge_agent_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bridge_api_key TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS mls_license_number TEXT;

-- Index for finding agents with MLS config
CREATE INDEX idx_profiles_mls_board ON profiles(mls_board_id) WHERE mls_board_id IS NOT NULL;
