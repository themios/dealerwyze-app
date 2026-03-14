-- ============================================================
-- Migration 059: Prepaid Overage Buffer
-- ============================================================
-- Adds a persistent, permanent credit balance to organizations.
-- Dealers top up with a one-time Stripe payment ($10/$25/$50/$100).
-- Each SMS/MMS overage deducts from the buffer atomically.
-- When balance drops to ≤$5 (500 cents), a reminder email is sent.
-- Buffer never resets — lasts until exhausted.
-- ============================================================

-- ── 1. Add overage_buffer_cents to organizations ─────────────────────────────
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS overage_buffer_cents INT NOT NULL DEFAULT 0;

-- ── 2. RPC: add_overage_buffer — called on successful Stripe top-up ──────────
-- Atomically increments the buffer. Safe to call from webhook.
CREATE OR REPLACE FUNCTION add_overage_buffer(p_org_id UUID, p_cents INT)
RETURNS INT  -- new balance
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE organizations
  SET overage_buffer_cents = COALESCE(overage_buffer_cents, 0) + p_cents
  WHERE id = p_org_id
  RETURNING overage_buffer_cents;
$$;

-- ── 3. RPC: deduct_overage_buffer — called on each overage event ─────────────
-- Returns the new balance (>= 0), or -1 if insufficient funds.
-- Uses a row lock to prevent double-spend on concurrent SMS sends.
CREATE OR REPLACE FUNCTION deduct_overage_buffer(p_org_id UUID, p_cost_cents INT)
RETURNS INT  -- new balance, or -1 if blocked
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current INT;
  v_new     INT;
BEGIN
  SELECT overage_buffer_cents INTO v_current
  FROM organizations
  WHERE id = p_org_id
  FOR UPDATE;

  IF v_current IS NULL OR v_current < p_cost_cents THEN
    RETURN -1;  -- insufficient — caller should block the message
  END IF;

  v_new := v_current - p_cost_cents;
  UPDATE organizations
  SET overage_buffer_cents = v_new
  WHERE id = p_org_id;

  RETURN v_new;
END;
$$;
