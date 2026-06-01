-- 066_vehicle_photos.sql
-- Multi-photo support for vehicle listings.
-- Photos stored in public Supabase bucket "vehicle-photos".
-- Primary photo (position=0) is synced to vehicles.photo_url for inventory grid compatibility.

CREATE TABLE IF NOT EXISTS public.vehicle_photos (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id  uuid        NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  org_id      uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  storage_key text        NOT NULL,   -- path in bucket: {org_id}/{vehicle_id}/{id}.jpg
  url         text        NOT NULL,   -- full public URL (no expiry — public bucket)
  position    integer     NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_photos_vehicle
  ON public.vehicle_photos (vehicle_id, position);

CREATE INDEX IF NOT EXISTS idx_vehicle_photos_org
  ON public.vehicle_photos (org_id);

ALTER TABLE public.vehicle_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_can_manage_vehicle_photos" ON public.vehicle_photos;
CREATE POLICY "org_can_manage_vehicle_photos" ON public.vehicle_photos
  FOR ALL
  USING (org_id = public.get_org_id());

-- NOTE: After applying this migration, create the "vehicle-photos" bucket
-- in Supabase Storage dashboard with PUBLIC access enabled.
