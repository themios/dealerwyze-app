-- Migration 226: Bank statement reconciliation tables
-- Stores uploaded bank statements and their extracted transaction lines,
-- with match tracking against ledger_transactions.

-- ── Bank statements (one per uploaded PDF/CSV) ────────────────────────────────
CREATE TABLE IF NOT EXISTS bank_statements (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bank_name        TEXT,
  account_last4    TEXT,
  statement_start  DATE,
  statement_end    DATE,
  opening_balance  DECIMAL(12,2),
  closing_balance  DECIMAL(12,2),
  storage_path     TEXT,
  status           TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'ready', 'reconciled', 'failed')),
  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE bank_statements ENABLE ROW LEVEL SECURITY;
CREATE POLICY bank_statements_own ON bank_statements
  FOR ALL USING (user_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS bank_statements_user_date
  ON bank_statements (user_id, created_at DESC);

-- ── Bank statement lines (one per transaction row in the statement) ───────────
CREATE TABLE IF NOT EXISTS bank_statement_lines (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id     UUID NOT NULL REFERENCES bank_statements(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  line_date        DATE NOT NULL,
  description      TEXT,
  amount           DECIMAL(12,2) NOT NULL,  -- always positive
  direction        TEXT NOT NULL CHECK (direction IN ('credit', 'debit')),
  balance_after    DECIMAL(12,2),
  match_status     TEXT NOT NULL DEFAULT 'pending'
    CHECK (match_status IN ('matched', 'cleared', 'ignored', 'pending')),
  matched_ledger_id UUID REFERENCES ledger_transactions(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE bank_statement_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY bank_lines_own ON bank_statement_lines
  FOR ALL USING (user_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS bank_lines_statement
  ON bank_statement_lines (statement_id, line_date);
CREATE INDEX IF NOT EXISTS bank_lines_user_status
  ON bank_statement_lines (user_id, match_status);
CREATE INDEX IF NOT EXISTS bank_lines_matched_ledger
  ON bank_statement_lines (matched_ledger_id) WHERE matched_ledger_id IS NOT NULL;

-- ── ledger_transactions: add bank reconciliation flag ─────────────────────────
ALTER TABLE ledger_transactions
  ADD COLUMN IF NOT EXISTS bank_cleared BOOLEAN NOT NULL DEFAULT false;
