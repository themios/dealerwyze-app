-- BHPH GPS / starter-interrupt device tracking on the contract row.

ALTER TABLE public.bhph_payments
  ADD COLUMN IF NOT EXISTS gps_vendor TEXT,
  ADD COLUMN IF NOT EXISTS gps_device_id TEXT,
  ADD COLUMN IF NOT EXISTS gps_installed_at DATE,
  ADD COLUMN IF NOT EXISTS gps_notes TEXT;

COMMENT ON COLUMN public.bhph_payments.gps_vendor IS 'GPS/starter-interrupt vendor name (e.g. PassTime, GPS Trackit).';
COMMENT ON COLUMN public.bhph_payments.gps_device_id IS 'Device or account ID from the vendor portal.';
COMMENT ON COLUMN public.bhph_payments.gps_installed_at IS 'Date the device was installed on the vehicle.';
COMMENT ON COLUMN public.bhph_payments.gps_notes IS 'Optional install location, technician, or removal notes.';
