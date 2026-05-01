-- Indexed phone lookup for inbound SMS routing.
-- Replaces full-org customer scan (.eq user_id, in-memory find) with two
-- O(log n) index seeks per inbound message.

-- Mirror of lib/utils/phone.ts normalizePhone():
-- strip non-digits, drop leading "1" from 11-digit numbers, take first 10.
CREATE OR REPLACE FUNCTION normalize_phone(raw TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE STRICT
AS $$
  SELECT CASE
    WHEN LENGTH(REGEXP_REPLACE(COALESCE(raw, ''), '[^0-9]', '', 'g')) = 11
     AND REGEXP_REPLACE(COALESCE(raw, ''), '[^0-9]', '', 'g') LIKE '1%'
    THEN SUBSTRING(REGEXP_REPLACE(COALESCE(raw, ''), '[^0-9]', '', 'g'), 2, 10)
    ELSE SUBSTRING(REGEXP_REPLACE(COALESCE(raw, ''), '[^0-9]', '', 'g'), 1, 10)
  END
$$;

-- Stored generated columns so the normalized value is always current.
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS primary_phone_norm TEXT
    GENERATED ALWAYS AS (normalize_phone(primary_phone)) STORED;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS secondary_phone_norm TEXT
    GENERATED ALWAYS AS (normalize_phone(secondary_phone)) STORED;

-- Composite indexes: org + normalized phone → O(log n) lookup per inbound SMS.
CREATE INDEX IF NOT EXISTS customers_user_primary_phone_norm_idx
  ON public.customers (user_id, primary_phone_norm)
  WHERE primary_phone_norm IS NOT NULL AND primary_phone_norm != '';

CREATE INDEX IF NOT EXISTS customers_user_secondary_phone_norm_idx
  ON public.customers (user_id, secondary_phone_norm)
  WHERE secondary_phone_norm IS NOT NULL AND secondary_phone_norm != '';
