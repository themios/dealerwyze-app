-- ============================================================
-- Migration 050: Overage RPC functions + Fax page cap
-- ============================================================

-- ── 1. increment_sms_overage RPC ────────────────────────────────────────────
-- Called by quota.ts when a message is sent above quota with overage opt-in.
CREATE OR REPLACE FUNCTION increment_sms_overage(p_org_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE organizations
  SET sms_overage_count = COALESCE(sms_overage_count, 0) + 1
  WHERE id = p_org_id;
$$;

-- ── 2. increment_mms_overage RPC ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION increment_mms_overage(p_org_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE organizations
  SET mms_overage_count = COALESCE(mms_overage_count, 0) + 1
  WHERE id = p_org_id;
$$;

-- ── 3. reset_overage_counters — called by quota reset cron ──────────────────
-- Resets sms_overage_count, mms_overage_count, and voice_overage_minutes
-- each billing cycle reset alongside the existing quota reset.
CREATE OR REPLACE FUNCTION reset_overage_counters(p_org_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE organizations
  SET sms_overage_count    = 0,
      mms_overage_count    = 0,
      voice_overage_minutes = 0
  WHERE id = p_org_id;
$$;

-- ── 4. Fax page cap ──────────────────────────────────────────────────────────
-- Add monthly fax page tracking. Included: 50 fax pages/mo per paid org.
-- Overage blocks faxes (no opt-in for fax — too much cost variance).

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS monthly_fax_pages   INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fax_page_cap        INT NOT NULL DEFAULT 50;

-- RPC for atomic fax page increment (returns new count for cap check)
CREATE OR REPLACE FUNCTION increment_fax_pages(p_org_id UUID, p_pages INT DEFAULT 1)
RETURNS INT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE organizations
  SET monthly_fax_pages = COALESCE(monthly_fax_pages, 0) + p_pages
  WHERE id = p_org_id
  RETURNING monthly_fax_pages;
$$;

-- Add fax page reset to reset_billing_cycle cron target
-- (The cron at /api/cron/check-tasks handles quota reset; also reset fax pages there.)
-- Migration note: no trigger needed; cron handles reset.

-- ── 5. Add coupon_code column to organizations (applied coupon) ──────────────
-- Tracks which coupon (if any) is currently applied to an org's billing.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS active_coupon_id       UUID REFERENCES coupons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS active_coupon_discount  NUMERIC(8,2),   -- actual $ saved this month
  ADD COLUMN IF NOT EXISTS coupon_expires_at       TIMESTAMPTZ;

-- ── 6. Indexes ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_organizations_active_coupon ON organizations(active_coupon_id)
  WHERE active_coupon_id IS NOT NULL;
