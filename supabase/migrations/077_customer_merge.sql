ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS merged_into_customer_id uuid references customers(id) on delete set null,
  ADD COLUMN IF NOT EXISTS merged_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_customers_merged_into
  ON customers (merged_into_customer_id)
  WHERE merged_into_customer_id IS NOT NULL;
