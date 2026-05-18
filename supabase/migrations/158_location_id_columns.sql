-- customers: which location is handling this lead
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES dealer_locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS location_source TEXT CHECK (
    location_source IN ('inbound_sms', 'email_parsed', 'vehicle', 'manual', 'auto_single')
  );

CREATE INDEX idx_customers_location_id ON customers(location_id);

-- profiles: which location this staff member belongs to
-- NULL = owner/admin (global access)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES dealer_locations(id) ON DELETE SET NULL;

CREATE INDEX idx_profiles_location_id ON profiles(location_id);
