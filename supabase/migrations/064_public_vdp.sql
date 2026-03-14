-- 064_public_vdp.sql
-- Public VDP infrastructure: vehicles get published flag + slug + price history + views
-- Organizations get custom_domain + public inventory switch + website tagline

-- vehicles additions
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS published              boolean      DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_slug           text,
  ADD COLUMN IF NOT EXISTS price_history         jsonb        DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS views_count           integer      DEFAULT 0,
  ADD COLUMN IF NOT EXISTS condition_report_json jsonb,
  ADD COLUMN IF NOT EXISTS wholesale_eligible    boolean      DEFAULT false;

-- unique slug per org (user_id = org scoping on vehicles)
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_org_public_slug
  ON public.vehicles (user_id, public_slug)
  WHERE public_slug IS NOT NULL;

-- fast lookup for public inventory page (only published, non-sold)
CREATE INDEX IF NOT EXISTS idx_vehicles_published
  ON public.vehicles (user_id, published, status)
  WHERE published = true;

-- organizations additions
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS custom_domain             text UNIQUE,
  ADD COLUMN IF NOT EXISTS public_inventory_enabled  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS website_tagline           text;

-- price history trigger
-- fires when price changes on a published vehicle
CREATE OR REPLACE FUNCTION public.trg_append_price_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.published = true
     AND NEW.price IS DISTINCT FROM OLD.price
     AND NEW.price IS NOT NULL
  THEN
    NEW.price_history := COALESCE(OLD.price_history, '[]'::jsonb)
      || jsonb_build_array(
           jsonb_build_object(
             'price',      NEW.price,
             'changed_at', now()
           )
         );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_price_history ON public.vehicles;
CREATE TRIGGER trg_price_history
  BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.trg_append_price_history();

-- atomic view counter increment RPC
CREATE OR REPLACE FUNCTION public.increment_vehicle_views(p_vehicle_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.vehicles
  SET views_count = views_count + 1
  WHERE id = p_vehicle_id AND published = true;
$$;

-- Extend activities.type CHECK to include web_lead
ALTER TABLE public.activities
  DROP CONSTRAINT IF EXISTS activities_type_check;

ALTER TABLE public.activities
  ADD CONSTRAINT activities_type_check
  CHECK (type IN ('call', 'sms', 'email', 'note', 'task', 'appointment', 'web_lead'));
