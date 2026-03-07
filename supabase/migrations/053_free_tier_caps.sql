-- Migration 053: Free tier cap enforcement (DB-level safety net)
-- Enforces 200-customer and 100-vehicle hard caps for free-tier orgs.
-- The app UI also checks these limits, but this trigger provides a second
-- layer of protection against direct-API or SDK bypasses.

-- ── Helper: get org's subscription_status ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_org_subscription_status(p_org_id uuid)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT subscription_status FROM public.organizations WHERE id = p_org_id
$$;

-- ── Customers cap (200 for free tier) ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enforce_free_tier_customer_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id   uuid;
  v_status   text;
  v_count    int;
BEGIN
  -- Determine org_id via RLS context (same approach as RLS policies)
  v_org_id := public.get_org_id();
  v_status := public.get_org_subscription_status(v_org_id);

  IF v_status = 'free' THEN
    SELECT COUNT(*) INTO v_count FROM public.customers WHERE user_id = v_org_id;
    IF v_count >= 200 THEN
      RAISE EXCEPTION 'Free tier limit reached: maximum 200 contacts allowed. Contact support@dealerwyze.com to upgrade.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_free_tier_customer_cap ON public.customers;
CREATE TRIGGER trg_free_tier_customer_cap
  BEFORE INSERT ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_free_tier_customer_cap();

-- ── Vehicles cap (100 for free tier) ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enforce_free_tier_vehicle_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id   uuid;
  v_status   text;
  v_count    int;
BEGIN
  v_org_id := public.get_org_id();
  v_status := public.get_org_subscription_status(v_org_id);

  IF v_status = 'free' THEN
    SELECT COUNT(*) INTO v_count FROM public.vehicles WHERE user_id = v_org_id;
    IF v_count >= 100 THEN
      RAISE EXCEPTION 'Free tier limit reached: maximum 100 vehicles allowed. Contact support@dealerwyze.com to upgrade.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_free_tier_vehicle_cap ON public.vehicles;
CREATE TRIGGER trg_free_tier_vehicle_cap
  BEFORE INSERT ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_free_tier_vehicle_cap();

-- ── Grant execute to authenticated role ──────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.enforce_free_tier_customer_cap() TO authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_free_tier_vehicle_cap()  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_subscription_status(uuid) TO authenticated;
