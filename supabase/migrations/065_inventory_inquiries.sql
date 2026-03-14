-- 065_inventory_inquiries.sql
-- Web lead capture from public VDP pages (unauthenticated submissions)

CREATE TABLE IF NOT EXISTS public.inventory_inquiries (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid         NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vehicle_id  uuid         REFERENCES public.vehicles(id) ON DELETE SET NULL,
  name        text         NOT NULL,
  email       text,
  phone       text,
  message     text,
  source_url  text,
  created_at  timestamptz  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_inquiries_org
  ON public.inventory_inquiries (org_id, created_at DESC);

ALTER TABLE public.inventory_inquiries ENABLE ROW LEVEL SECURITY;

-- Dealers can read their own inquiries
-- No public INSERT policy needed -- API inserts via service client with explicit filters
CREATE POLICY "org_can_read_inquiries"
  ON public.inventory_inquiries
  FOR SELECT
  USING (org_id = public.get_org_id());
