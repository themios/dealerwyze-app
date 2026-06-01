-- Migration 208: Buyer Criteria & Matching
-- Enables agents to save buyer search criteria and automatically match new listings

create table if not exists buyer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  buyer_name TEXT NOT NULL,
  bedrooms_min INT,
  bedrooms_max INT,
  bathrooms_min FLOAT,
  bathrooms_max FLOAT,
  price_min INT, -- in dollars
  price_max INT,
  sqft_min INT,
  sqft_max INT,
  location TEXT, -- e.g., "West Pasadena" or city/zip (forgiving substring match)
  year_built_min INT,
  year_built_max INT,
  property_type TEXT, -- 'any' | 'single_family' | 'condo' | 'townhouse' | 'multi_family'
  hoa_allowed BOOLEAN DEFAULT true,
  notes TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),

  CONSTRAINT valid_bedrooms CHECK (bedrooms_min IS NULL OR bedrooms_max IS NULL OR bedrooms_min <= bedrooms_max),
  CONSTRAINT valid_bathrooms CHECK (bathrooms_min IS NULL OR bathrooms_max IS NULL OR bathrooms_min <= bathrooms_max),
  CONSTRAINT valid_price CHECK (price_min IS NULL OR price_max IS NULL OR price_min <= price_max),
  CONSTRAINT valid_sqft CHECK (sqft_min IS NULL OR sqft_max IS NULL OR sqft_min <= sqft_max),
  CONSTRAINT valid_year_built CHECK (year_built_min IS NULL OR year_built_max IS NULL OR year_built_min <= year_built_max)
);

create table if not exists matched_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_profile_id UUID NOT NULL REFERENCES buyer_profiles(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  matched_at TIMESTAMP NOT NULL DEFAULT now(),
  agent_notified_at TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'new', -- new | notified | sent | reviewed | ignored | closed
  created_at TIMESTAMP NOT NULL DEFAULT now(),

  CONSTRAINT valid_status CHECK (status IN ('new', 'notified', 'sent', 'reviewed', 'ignored', 'closed'))
);

-- Unique index: each buyer profile matches each listing once
CREATE UNIQUE INDEX IF NOT EXISTS idx_matched_opportunities_unique
  ON matched_opportunities(buyer_profile_id, listing_id);

CREATE INDEX IF NOT EXISTS idx_buyer_profiles_agent ON buyer_profiles(agent_id);
CREATE INDEX IF NOT EXISTS idx_buyer_profiles_org ON buyer_profiles(org_id);
CREATE INDEX IF NOT EXISTS idx_buyer_profiles_active ON buyer_profiles(active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_matched_opportunities_status ON matched_opportunities(status);
CREATE INDEX IF NOT EXISTS idx_matched_opportunities_buyer ON matched_opportunities(buyer_profile_id);
CREATE INDEX IF NOT EXISTS idx_matched_opportunities_listing ON matched_opportunities(listing_id);
CREATE INDEX IF NOT EXISTS idx_matched_opportunities_created ON matched_opportunities(created_at DESC);

-- RLS Policies
ALTER TABLE buyer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE matched_opportunities ENABLE ROW LEVEL SECURITY;

-- Agents can view their own buyer profiles
DROP POLICY IF EXISTS buyer_profiles_select_own
 ON buyer_profiles;
CREATE POLICY buyer_profiles_select_own
  ON buyer_profiles FOR SELECT
  USING (auth.uid() = agent_id);

-- Agents can create buyer profiles in their org
DROP POLICY IF EXISTS buyer_profiles_insert_own
 ON buyer_profiles;
CREATE POLICY buyer_profiles_insert_own
  ON buyer_profiles FOR INSERT
  WITH CHECK (auth.uid() = agent_id AND org_id IN (
    SELECT org_id FROM profiles WHERE id = auth.uid()
  ));

-- Agents can update their own buyer profiles
DROP POLICY IF EXISTS buyer_profiles_update_own
 ON buyer_profiles;
CREATE POLICY buyer_profiles_update_own
  ON buyer_profiles FOR UPDATE
  USING (auth.uid() = agent_id)
  WITH CHECK (auth.uid() = agent_id);

-- Agents can delete their own buyer profiles
DROP POLICY IF EXISTS buyer_profiles_delete_own
 ON buyer_profiles;
CREATE POLICY buyer_profiles_delete_own
  ON buyer_profiles FOR DELETE
  USING (auth.uid() = agent_id);

-- Agents can view matched opportunities for their buyer profiles
DROP POLICY IF EXISTS matched_opportunities_select_own ON matched_opportunities;
CREATE POLICY matched_opportunities_select_own
  ON matched_opportunities FOR SELECT
  USING (buyer_profile_id IN (
    SELECT id FROM buyer_profiles WHERE agent_id = auth.uid()
  ));

-- Agents can create matched opportunities via cron/API
DROP POLICY IF EXISTS matched_opportunities_insert_own ON matched_opportunities;
CREATE POLICY matched_opportunities_insert_own
  ON matched_opportunities FOR INSERT
  WITH CHECK (buyer_profile_id IN (
    SELECT id FROM buyer_profiles WHERE agent_id = auth.uid()
  ));

-- Agents can update matched opportunities status
DROP POLICY IF EXISTS matched_opportunities_update_own ON matched_opportunities;
CREATE POLICY matched_opportunities_update_own
  ON matched_opportunities FOR UPDATE
  USING (buyer_profile_id IN (
    SELECT id FROM buyer_profiles WHERE agent_id = auth.uid()
  ))
  WITH CHECK (buyer_profile_id IN (
    SELECT id FROM buyer_profiles WHERE agent_id = auth.uid()
  ));

-- Service role can manage via cron (matching engine)
DROP POLICY IF EXISTS buyer_profiles_service_all
 ON buyer_profiles;
CREATE POLICY buyer_profiles_service_all
  ON buyer_profiles FOR ALL
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS matched_opportunities_service_all ON matched_opportunities;
CREATE POLICY matched_opportunities_service_all
  ON matched_opportunities FOR ALL
  USING (auth.role() = 'service_role');
