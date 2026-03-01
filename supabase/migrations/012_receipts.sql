-- Receipt-to-Ledger: storage bucket, categories, receipts, ledger_transactions, vendor_rules

-- Storage bucket for receipt images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'receipts',
  'receipts',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
) ON CONFLICT (id) DO NOTHING;

-- Storage RLS (API routes use service client, but add for direct access)
DROP POLICY IF EXISTS "receipts_upload" ON storage.objects;
CREATE POLICY "receipts_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "receipts_read" ON storage.objects;
CREATE POLICY "receipts_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "receipts_delete" ON storage.objects;
CREATE POLICY "receipts_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Dealer bookkeeping categories
CREATE TABLE IF NOT EXISTS receipt_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  requires_vehicle BOOLEAN DEFAULT false,
  qb_account_name TEXT,
  is_default BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, name)
);

ALTER TABLE receipt_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_receipt_categories" ON receipt_categories;
CREATE POLICY "users_own_receipt_categories" ON receipt_categories
  FOR ALL USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS receipt_categories_user ON receipt_categories(user_id, sort_order);

-- Receipts table (raw captures, status lifecycle)
CREATE TABLE IF NOT EXISTS receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path TEXT,
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'draft_ready', 'posted', 'failed')),
  vendor_raw TEXT,
  vendor_norm TEXT,
  receipt_date DATE,
  location_raw TEXT,
  subtotal NUMERIC(10,2),
  tax NUMERIC(10,2),
  total NUMERIC(10,2),
  currency TEXT DEFAULT 'USD',
  payment_hint TEXT,
  ai_json JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_receipts" ON receipts;
CREATE POLICY "users_own_receipts" ON receipts
  FOR ALL USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS receipts_user_status ON receipts(user_id, status, created_at DESC);

-- Ledger transactions (posted bookkeeping entries)
CREATE TABLE IF NOT EXISTS ledger_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receipt_id UUID REFERENCES receipts(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  vendor_norm TEXT,
  amount_total NUMERIC(10,2),
  tax NUMERIC(10,2),
  category_id UUID REFERENCES receipt_categories(id) ON DELETE SET NULL,
  memo TEXT,
  vehicle_id UUID,
  tags TEXT[],
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('draft', 'posted')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ledger_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_ledger" ON ledger_transactions;
CREATE POLICY "users_own_ledger" ON ledger_transactions
  FOR ALL USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS ledger_user_date ON ledger_transactions(user_id, date DESC);

-- Vendor rules (learned auto-categorization per vendor)
CREATE TABLE IF NOT EXISTS vendor_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vendor_norm TEXT NOT NULL,
  category_id UUID REFERENCES receipt_categories(id) ON DELETE CASCADE,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, vendor_norm)
);

ALTER TABLE vendor_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_vendor_rules" ON vendor_rules;
CREATE POLICY "users_own_vendor_rules" ON vendor_rules
  FOR ALL USING (user_id = auth.uid());

-- Seed 12 default dealer categories for all existing users
INSERT INTO receipt_categories (user_id, name, requires_vehicle, is_default, sort_order)
SELECT
  u.id,
  c.name,
  c.requires_vehicle,
  true,
  c.sort_order
FROM auth.users u
CROSS JOIN (VALUES
  ('Recon: Parts',            true,  1),
  ('Recon: Labor / Mechanic', true,  2),
  ('Fuel',                    false, 3),
  ('Advertising & Leads',     false, 4),
  ('Auction & Fees',          false, 5),
  ('DMV / Registration / Title', false, 6),
  ('Insurance',               false, 7),
  ('Software / Subscriptions', false, 8),
  ('Office / Supplies',       false, 9),
  ('Towing / Transport',      false, 10),
  ('Utilities & Facilities',  false, 11),
  ('Miscellaneous',           false, 12)
) AS c(name, requires_vehicle, sort_order)
ON CONFLICT (user_id, name) DO NOTHING;
