-- Migration 223: Add category_type to receipt_categories
-- Separates income categories from expense categories.
-- All existing categories default to 'expense'.

ALTER TABLE receipt_categories
  ADD COLUMN IF NOT EXISTS category_type TEXT NOT NULL DEFAULT 'expense'
    CHECK (category_type IN ('expense', 'income'));

-- Drop old unique constraint (user_id, name) and re-add including category_type
-- so the same name can exist for both income and expense if needed.
ALTER TABLE receipt_categories
  DROP CONSTRAINT IF EXISTS receipt_categories_user_id_name_key;

ALTER TABLE receipt_categories
  ADD CONSTRAINT receipt_categories_user_type_name_key
    UNIQUE (user_id, category_type, name);

CREATE INDEX IF NOT EXISTS receipt_categories_user_type
  ON receipt_categories (user_id, category_type, sort_order);
