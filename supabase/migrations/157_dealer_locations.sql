CREATE TABLE IF NOT EXISTS dealer_locations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  address         TEXT,
  phone           TEXT,
  inventory_url   TEXT,
  sms_number      TEXT,           -- future: Twilio number for this location
  email_from_name TEXT,           -- future: email sender name override
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_dealer_locations_org_id ON dealer_locations(org_id);
CREATE INDEX idx_dealer_locations_org_active ON dealer_locations(org_id, is_active);

ALTER TABLE dealer_locations ENABLE ROW LEVEL SECURITY;

-- Org members can read their own locations
CREATE POLICY "dealer_locations_select" ON dealer_locations
  FOR SELECT USING (org_id = get_org_id());

-- Only dealer_admin/admin can write
CREATE POLICY "dealer_locations_insert" ON dealer_locations
  FOR INSERT WITH CHECK (org_id = get_org_id());

CREATE POLICY "dealer_locations_update" ON dealer_locations
  FOR UPDATE USING (org_id = get_org_id());

CREATE POLICY "dealer_locations_delete" ON dealer_locations
  FOR DELETE USING (org_id = get_org_id());
