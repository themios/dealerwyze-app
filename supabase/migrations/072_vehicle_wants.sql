-- Migration 072: Vehicle Want List
-- Customers who want to be notified when a matching vehicle arrives

-- 1. Add body_style to vehicles table
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS body_style text
    CHECK (body_style IN ('pickup','suv','sedan','coupe','van','minivan','wagon','convertible','hatchback','other'));

-- 2. Create vehicle_wants table
CREATE TABLE IF NOT EXISTS vehicle_wants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id   uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  year_min      int,
  year_max      int,
  make          text,
  model         text,
  body_style    text CHECK (body_style IN ('pickup','suv','sedan','coupe','van','minivan','wagon','convertible','hatchback','other')),
  max_price     numeric(10,2),
  notes         text,
  status        text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','fulfilled','cancelled')),
  fulfilled_vehicle_id uuid REFERENCES vehicles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vehicle_wants_customer_id_idx ON vehicle_wants(customer_id);
CREATE INDEX IF NOT EXISTS vehicle_wants_user_id_status_idx ON vehicle_wants(user_id, status);

-- 3. RLS
ALTER TABLE vehicle_wants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_isolation" ON vehicle_wants;
CREATE POLICY "org_isolation" ON vehicle_wants
  USING (user_id = get_org_id())
  WITH CHECK (user_id = get_org_id());

-- 4. updated_at trigger
CREATE OR REPLACE FUNCTION update_vehicle_wants_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS vehicle_wants_updated_at ON vehicle_wants;
CREATE TRIGGER vehicle_wants_updated_at
  BEFORE UPDATE ON vehicle_wants
  FOR EACH ROW EXECUTE FUNCTION update_vehicle_wants_updated_at();
