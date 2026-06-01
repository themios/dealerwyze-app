-- 068_vehicle_staging_recon.sql

-- 1. Add 'staging' to vehicles status check
ALTER TABLE public.vehicles
  DROP CONSTRAINT IF EXISTS vehicles_status_check;

ALTER TABLE public.vehicles
  ADD CONSTRAINT vehicles_status_check
  CHECK (status IN ('available', 'pending', 'sold', 'sync_removed', 'staging'));

-- 2. Acquisition fields
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS purchase_price  NUMERIC(10,2) CHECK (purchase_price >= 0),
  ADD COLUMN IF NOT EXISTS purchased_at    DATE,
  ADD COLUMN IF NOT EXISTS purchased_from  TEXT;

-- 3. Org-level recon checklist template
ALTER TABLE public.org_settings
  ADD COLUMN IF NOT EXISTS recon_checklist_template JSONB;

-- 4. recon_checklist_items table
CREATE TABLE IF NOT EXISTS public.recon_checklist_items (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id    UUID          NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  org_id        UUID          NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  label         TEXT          NOT NULL CHECK (char_length(label) <= 120),
  is_required   BOOLEAN       NOT NULL DEFAULT false,
  sort_order    INTEGER       NOT NULL DEFAULT 0,
  checked       BOOLEAN       NOT NULL DEFAULT false,
  notes         TEXT,
  cost          NUMERIC(10,2) CHECK (cost >= 0),
  completed_at  TIMESTAMPTZ,
  completed_by  UUID          REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recon_items_vehicle
  ON public.recon_checklist_items (vehicle_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_recon_items_org
  ON public.recon_checklist_items (org_id);

ALTER TABLE public.recon_checklist_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_can_manage_recon_items" ON public.recon_checklist_items;
CREATE POLICY "org_can_manage_recon_items" ON public.recon_checklist_items
  FOR ALL
  USING     (org_id = public.get_org_id())
  WITH CHECK (org_id = public.get_org_id());

-- 5. Index for cost rollup queries
CREATE INDEX IF NOT EXISTS idx_ledger_vehicle_id
  ON public.ledger_transactions (vehicle_id)
  WHERE vehicle_id IS NOT NULL;
