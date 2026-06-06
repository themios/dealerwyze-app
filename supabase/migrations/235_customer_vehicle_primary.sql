-- Add primary vehicle tracking to customer_vehicles
-- Allows agents to explicitly set which vehicle is primary
-- and which vehicles are preferred for outreach

ALTER TABLE customer_vehicles ADD COLUMN is_primary BOOLEAN DEFAULT FALSE;
ALTER TABLE customer_vehicles ADD COLUMN is_preferred BOOLEAN DEFAULT FALSE;

-- Ensure only one primary vehicle per customer
CREATE UNIQUE INDEX idx_customer_vehicles_one_primary
  ON customer_vehicles (customer_id)
  WHERE is_primary = TRUE;

-- Support for marking multiple preferred vehicles
CREATE INDEX idx_customer_vehicles_preferred
  ON customer_vehicles (customer_id, is_preferred);
