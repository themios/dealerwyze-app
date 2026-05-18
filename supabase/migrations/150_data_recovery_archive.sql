-- ── Recovery archive tables ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS deleted_customers (
  recovery_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_id       uuid NOT NULL,
  org_id            uuid NOT NULL,              -- derived from user_id/profile at delete time
  deleted_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL DEFAULT now() + interval '7 days',
  deleted_by        uuid,                       -- profile id of who deleted (null if system)
  row_data          jsonb NOT NULL,             -- full row snapshot
  restored_at       timestamptz,
  purged_at         timestamptz
);

CREATE TABLE IF NOT EXISTS deleted_activities (
  recovery_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_id       uuid NOT NULL,
  org_id            uuid NOT NULL,
  deleted_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL DEFAULT now() + interval '7 days',
  deleted_by        uuid,
  row_data          jsonb NOT NULL,
  restored_at       timestamptz,
  purged_at         timestamptz
);

CREATE TABLE IF NOT EXISTS deleted_vehicles (
  recovery_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_id       uuid NOT NULL,
  org_id            uuid NOT NULL,
  deleted_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL DEFAULT now() + interval '7 days',
  deleted_by        uuid,
  row_data          jsonb NOT NULL,
  restored_at       timestamptz,
  purged_at         timestamptz
);

CREATE TABLE IF NOT EXISTS deleted_ledger_transactions (
  recovery_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_id       uuid NOT NULL,
  org_id            uuid NOT NULL,
  deleted_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL DEFAULT now() + interval '7 days',
  deleted_by        uuid,
  row_data          jsonb NOT NULL,
  restored_at       timestamptz,
  purged_at         timestamptz
);

-- Indexes for admin lookup
CREATE INDEX IF NOT EXISTS idx_deleted_customers_org ON deleted_customers(org_id, deleted_at DESC);
CREATE INDEX IF NOT EXISTS idx_deleted_customers_expires ON deleted_customers(expires_at) WHERE purged_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_deleted_activities_org ON deleted_activities(org_id, deleted_at DESC);
CREATE INDEX IF NOT EXISTS idx_deleted_activities_expires ON deleted_activities(expires_at) WHERE purged_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_deleted_vehicles_org ON deleted_vehicles(org_id, deleted_at DESC);
CREATE INDEX IF NOT EXISTS idx_deleted_vehicles_expires ON deleted_vehicles(expires_at) WHERE purged_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_deleted_ledger_org ON deleted_ledger_transactions(org_id, deleted_at DESC);
CREATE INDEX IF NOT EXISTS idx_deleted_ledger_expires ON deleted_ledger_transactions(expires_at) WHERE purged_at IS NULL;

-- ── RLS: only service role reads/writes recovery tables ──────────────────────
-- Dealers cannot see or modify their own recovery archives (prevent circumvention).
-- Only the platform admin (via service role) can read and restore.

ALTER TABLE deleted_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE deleted_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE deleted_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE deleted_ledger_transactions ENABLE ROW LEVEL SECURITY;

-- No authenticated-role policies = deny all authenticated access.
-- Service role bypasses RLS entirely (as intended).

-- ── Triggers: archive before delete ─────────────────────────────────────────

-- customers
CREATE OR REPLACE FUNCTION archive_deleted_customer()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Derive org_id: customers use user_id as org scope
  INSERT INTO deleted_customers (original_id, org_id, row_data)
  VALUES (OLD.id, COALESCE(OLD.user_id, '00000000-0000-0000-0000-000000000000'), to_jsonb(OLD));
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_archive_customer ON customers;
CREATE TRIGGER trg_archive_customer
  BEFORE DELETE ON customers
  FOR EACH ROW EXECUTE FUNCTION archive_deleted_customer();

-- activities
CREATE OR REPLACE FUNCTION archive_deleted_activity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO deleted_activities (original_id, org_id, row_data)
  VALUES (OLD.id, COALESCE(OLD.user_id, '00000000-0000-0000-0000-000000000000'), to_jsonb(OLD));
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_archive_activity ON activities;
CREATE TRIGGER trg_archive_activity
  BEFORE DELETE ON activities
  FOR EACH ROW EXECUTE FUNCTION archive_deleted_activity();

-- vehicles
CREATE OR REPLACE FUNCTION archive_deleted_vehicle()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO deleted_vehicles (original_id, org_id, row_data)
  VALUES (OLD.id, COALESCE(OLD.user_id, '00000000-0000-0000-0000-000000000000'), to_jsonb(OLD));
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_archive_vehicle ON vehicles;
CREATE TRIGGER trg_archive_vehicle
  BEFORE DELETE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION archive_deleted_vehicle();

-- ledger_transactions
CREATE OR REPLACE FUNCTION archive_deleted_ledger_transaction()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO deleted_ledger_transactions (original_id, org_id, row_data)
  VALUES (OLD.id, COALESCE(OLD.user_id, '00000000-0000-0000-0000-000000000000'), to_jsonb(OLD));
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_archive_ledger ON ledger_transactions;
CREATE TRIGGER trg_archive_ledger
  BEFORE DELETE ON ledger_transactions
  FOR EACH ROW EXECUTE FUNCTION archive_deleted_ledger_transaction();

