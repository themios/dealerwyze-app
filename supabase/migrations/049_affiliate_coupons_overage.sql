-- ============================================================
-- Migration 049: Affiliate Codes, Coupons, Overage Tracking
-- ============================================================
-- Run in Supabase SQL editor.
-- Adds:
--   affiliate_codes       — flyer/advisor referral program
--   coupons               — admin-only discount codes (superadmin approval)
--   coupon_redemptions    — audit trail of applied coupons
--   org columns           — affiliate_code, referred_by_org_id, referral_discount_pct,
--                           annual_billing, voice_overage_enabled, voice_overage_minutes,
--                           sms_overage_count, mms_overage_count
--   org_settings update   — voice_minutes_cap default from 60000 → 42000 (700 min)

-- ── 1. affiliate_codes ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS affiliate_codes (
  id                    UUID    PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The code printed on flyers or given to advisors (e.g. "ELMONTEREG", "JSMITH2026")
  code                  TEXT    NOT NULL UNIQUE,

  -- flyer = registration-office card (first-month commission only)
  -- advisor = sales rep / finance advisor (first-month + recurring)
  type                  TEXT    NOT NULL CHECK (type IN ('flyer', 'advisor')),

  -- Human-readable name for Tim's records
  owner_name            TEXT    NOT NULL DEFAULT '',
  owner_email           TEXT,
  notes                 TEXT,

  -- Commission rates
  commission_first_pct  NUMERIC(5,2) NOT NULL DEFAULT 10.0,  -- % of first-month MRR
  commission_recurring_pct NUMERIC(5,2) NOT NULL DEFAULT 0.0, -- % of monthly MRR (0 for flyer, 2 for advisor)

  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. coupons ───────────────────────────────────────────────────────────────
-- Superadmin-only. Each coupon can be open (any org) or locked to a specific org_id.
CREATE TABLE IF NOT EXISTS coupons (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The code dealers enter (or admin applies directly)
  code          TEXT    NOT NULL UNIQUE,

  -- percent = reduce MRR by X%; fixed = reduce by $X/mo
  discount_type TEXT    NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value NUMERIC(8,2) NOT NULL,  -- 10.0 = 10% or $10.00

  -- null = any org can use it (once); set to restrict to one dealer
  org_id        UUID    REFERENCES organizations(id) ON DELETE SET NULL,

  max_uses      INT     NOT NULL DEFAULT 1,   -- 1 = single-use
  used_count    INT     NOT NULL DEFAULT 0,

  -- Duration: null = forever, or number of billing months
  duration_months INT,

  valid_from    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until   TIMESTAMPTZ,                   -- null = no expiry

  -- Approval trail (only platform superadmin can create)
  created_by    UUID    REFERENCES auth.users(id),
  notes         TEXT,

  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. coupon_redemptions ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id     UUID        NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  org_id        UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  applied_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- How much was actually saved this month (computed at billing time)
  amount_saved  NUMERIC(8,2),
  UNIQUE(coupon_id, org_id)   -- prevent double-redemption per org
);

-- ── 4. Add columns to organizations ─────────────────────────────────────────

-- Which affiliate code was used at signup
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS affiliate_code          TEXT
    REFERENCES affiliate_codes(code) ON DELETE SET NULL;

-- Customer referral: which existing org referred this org
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS referred_by_org_id      UUID
    REFERENCES organizations(id) ON DELETE SET NULL;

-- Referral discount for the referring dealer (5% while referral is active)
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS referral_discount_pct   NUMERIC(4,2) NOT NULL DEFAULT 0;

-- Annual billing flag
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS annual_billing          BOOLEAN NOT NULL DEFAULT false;

-- Overage opt-in flags
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS voice_overage_enabled   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_overage_enabled_v2  BOOLEAN NOT NULL DEFAULT false;  -- replaces old sms_overage_enabled

-- Overage usage accumulators (reset each billing cycle with quota reset)
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS voice_overage_minutes   INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sms_overage_count       INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mms_overage_count       INT NOT NULL DEFAULT 0;

-- ── 5. Update voice_minutes_cap default to 42000 seconds (700 min) ───────────
-- Existing rows with 60000 (the old loose default) get corrected to 42000.
-- Rows already manually set to something specific are left alone.
UPDATE org_settings
  SET voice_minutes_cap = 42000
  WHERE voice_minutes_cap = 60000;

ALTER TABLE org_settings
  ALTER COLUMN voice_minutes_cap SET DEFAULT 42000;

-- Add voice_overage_notified_at to prevent duplicate alert emails
ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS voice_overage_notified_at TIMESTAMPTZ;

-- ── 6. Indexes ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_organizations_affiliate_code   ON organizations(affiliate_code);
CREATE INDEX IF NOT EXISTS idx_organizations_referred_by      ON organizations(referred_by_org_id);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_org         ON coupon_redemptions(org_id);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_coupon      ON coupon_redemptions(coupon_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_codes_code           ON affiliate_codes(code);

-- ── 7. RLS — coupons and affiliate_codes are platform-admin only ─────────────
ALTER TABLE affiliate_codes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons            ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_redemptions ENABLE ROW LEVEL SECURITY;

-- Only service role (and platform superadmin via service client) can touch these
-- Dealers never read coupon internals; they just enter a code at checkout
DROP POLICY IF EXISTS "service_only_affiliate_codes" ON affiliate_codes;
CREATE POLICY "service_only_affiliate_codes" ON affiliate_codes
  FOR ALL USING (false);  -- blocked for anon/auth; service client bypasses RLS

DROP POLICY IF EXISTS "service_only_coupons" ON coupons;
CREATE POLICY "service_only_coupons" ON coupons
  FOR ALL USING (false);

DROP POLICY IF EXISTS "service_only_coupon_redemptions" ON coupon_redemptions;
CREATE POLICY "service_only_coupon_redemptions" ON coupon_redemptions
  FOR ALL USING (false);
