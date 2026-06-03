-- Migration 222: Add income support to receipts and ledger_transactions
-- Additive only — all existing rows default to 'expense', no data affected.

-- ── receipts: income fields ────────────────────────────────────────────────────
ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS entry_type TEXT NOT NULL DEFAULT 'expense'
    CHECK (entry_type IN ('expense', 'income')),
  ADD COLUMN IF NOT EXISTS payer TEXT,
  ADD COLUMN IF NOT EXISTS check_number TEXT,
  ADD COLUMN IF NOT EXISTS payment_method TEXT
    CHECK (payment_method IN ('check', 'cashiers_check', 'cash', 'wire', 'zelle', 'venmo', 'ach', 'card', 'other')),
  ADD COLUMN IF NOT EXISTS reference_number TEXT;

CREATE INDEX IF NOT EXISTS receipts_user_entry_type
  ON receipts (user_id, entry_type, created_at DESC);

-- ── ledger_transactions: income fields ────────────────────────────────────────
ALTER TABLE ledger_transactions
  ADD COLUMN IF NOT EXISTS entry_type TEXT NOT NULL DEFAULT 'expense'
    CHECK (entry_type IN ('expense', 'income')),
  ADD COLUMN IF NOT EXISTS payer TEXT;

CREATE INDEX IF NOT EXISTS ledger_user_entry_type
  ON ledger_transactions (user_id, entry_type, date DESC);
