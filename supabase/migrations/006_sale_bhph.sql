-- Customer: add interested_in (what car they want), make phone optional
ALTER TABLE customers ADD COLUMN IF NOT EXISTS interested_in text;
ALTER TABLE customers ALTER COLUMN primary_phone SET DEFAULT '';

-- Vehicle: add sale details
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS sold_price numeric;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS sold_at timestamptz;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS sold_to_customer_id uuid REFERENCES customers(id);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS finance_type text CHECK (finance_type IN ('cash', 'finance', 'bhph'));
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS finance_company text;

-- BHPH payment tracking
CREATE TABLE IF NOT EXISTS bhph_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id),
  customer_id uuid NOT NULL REFERENCES customers(id),
  down_payment numeric DEFAULT 0,
  loan_amount numeric,
  monthly_payment numeric NOT NULL,
  payment_day_of_month int NOT NULL CHECK (payment_day_of_month BETWEEN 1 AND 31),
  next_due_date date NOT NULL,
  total_paid numeric DEFAULT 0,
  status text DEFAULT 'active' CHECK (status IN ('active', 'paid_off', 'defaulted')),
  notes text,
  created_at timestamptz DEFAULT now()
);

-- RLS for bhph_payments (same org pattern)
ALTER TABLE bhph_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_bhph" ON bhph_payments;
CREATE POLICY "org_bhph" ON bhph_payments
  FOR ALL
  USING (user_id = (
    SELECT org_id FROM profiles WHERE id = auth.uid() LIMIT 1
  ));

-- Vehicle archive table
CREATE TABLE IF NOT EXISTS vehicles_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_id text,
  user_id uuid,
  data jsonb NOT NULL,
  archived_at timestamptz DEFAULT now(),
  archive_reason text DEFAULT 'removed_from_inventory'
);

ALTER TABLE vehicles_archive ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_archive" ON vehicles_archive;
CREATE POLICY "org_archive" ON vehicles_archive
  FOR ALL
  USING (user_id = (
    SELECT org_id FROM profiles WHERE id = auth.uid() LIMIT 1
  ));
