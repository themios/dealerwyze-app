-- ============================================================
-- 039_dealer_roles_and_approval.sql
-- Expand dealer role enum + add org approval workflow columns.
-- Purely additive — no existing data changed.
-- Apply in Supabase SQL editor.
-- ============================================================

-- 1. Expand the role CHECK constraint on profiles
-- Drop old constraint, add new one that is a superset
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'dealer_admin',    -- org owner, full access
    'dealer_manager',  -- all data, no billing/user mgmt
    'dealer_finance',  -- operational + BHPH/ledger, no user mgmt
    'dealer_rep',      -- assigned customers only
    'dealer_staff',    -- operational, no user mgmt or billing
    'admin',           -- LEGACY: treated as dealer_admin in code
    'agent'            -- LEGACY: treated as dealer_staff in code
  ));

-- 2. Add approval workflow columns to organizations
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS approved_at       TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS approved_by       UUID        NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason  TEXT        NULL;

-- 3. Auto-approve existing orgs (they were created before the gate existed)
UPDATE organizations
SET approved_at = created_at, approved_by = NULL
WHERE approved_at IS NULL
  AND id != '00000000-0000-0000-0000-000000000001';

-- 4. Index for pending approval queue query
CREATE INDEX IF NOT EXISTS idx_orgs_pending_approval
  ON organizations (created_at DESC)
  WHERE approved_at IS NULL;

-- 5. Add deactivated_at column to profiles for soft-disable (Phase 4 prereq)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ NULL;

-- Index for active users query
CREATE INDEX IF NOT EXISTS idx_profiles_active
  ON profiles (org_id, deactivated_at)
  WHERE deactivated_at IS NULL;

-- 6. Approval audit log entry type (no schema change needed — admin_audit_log.action is TEXT)
-- Supported values: 'approve_org', 'reject_org', 'staff_impersonate_start', 'staff_impersonate_end'
