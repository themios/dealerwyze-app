-- ============================================================
-- CLEANUP: Merge duplicate customers created by failed dedup
-- Run in Supabase SQL editor ONCE, then delete this file.
--
-- Strategy:
--   1. Find customers with duplicate phone numbers (same user_id = org)
--   2. Keep the OLDEST — it has the real activity/assignment history
--   3. Backfill email/name onto oldest if missing
--   4. Re-parent activities, customer_vehicles, tasks, bhph_payments,
--      voice_calls, faxes → oldest
--   5. Delete the newer duplicates
-- ============================================================

DO $$
DECLARE
  rec        RECORD;
  oldest_id  UUID;
  dup_ids    UUID[];
  dup_id     UUID;
  oldest_rec RECORD;
BEGIN

  FOR rec IN
    SELECT
      user_id                                               AS org_key,
      REGEXP_REPLACE(primary_phone, '\D', '', 'g')         AS phone_norm,
      COUNT(*)                                             AS cnt
    FROM public.customers
    WHERE primary_phone IS NOT NULL
      AND LENGTH(REGEXP_REPLACE(primary_phone, '\D', '', 'g')) >= 10
    GROUP BY user_id, REGEXP_REPLACE(primary_phone, '\D', '', 'g')
    HAVING COUNT(*) > 1
  LOOP
    RAISE NOTICE 'Merging % duplicates — phone % in org %', rec.cnt, rec.phone_norm, rec.org_key;

    -- Oldest record (most history)
    SELECT id INTO oldest_id
    FROM public.customers
    WHERE user_id = rec.org_key
      AND REGEXP_REPLACE(primary_phone, '\D', '', 'g') = rec.phone_norm
    ORDER BY created_at ASC
    LIMIT 1;

    SELECT id, email, name INTO oldest_rec
    FROM public.customers WHERE id = oldest_id;

    -- All duplicate IDs except the oldest
    SELECT ARRAY_AGG(id) INTO dup_ids
    FROM public.customers
    WHERE user_id = rec.org_key
      AND REGEXP_REPLACE(primary_phone, '\D', '', 'g') = rec.phone_norm
      AND id != oldest_id;

    -- Backfill email onto oldest if blank
    IF oldest_rec.email IS NULL OR oldest_rec.email = '' THEN
      UPDATE public.customers
      SET email = (
        SELECT email FROM public.customers
        WHERE id = ANY(dup_ids) AND email IS NOT NULL AND email != ''
        ORDER BY created_at ASC LIMIT 1
      )
      WHERE id = oldest_id;
    END IF;

    -- Backfill name onto oldest if blank
    IF oldest_rec.name IS NULL OR oldest_rec.name = '' THEN
      UPDATE public.customers
      SET name = (
        SELECT name FROM public.customers
        WHERE id = ANY(dup_ids) AND name IS NOT NULL AND name != ''
        ORDER BY created_at ASC LIMIT 1
      )
      WHERE id = oldest_id;
    END IF;

    -- Re-parent all child records from each duplicate → oldest
    FOREACH dup_id IN ARRAY dup_ids LOOP

      UPDATE public.activities
        SET customer_id = oldest_id WHERE customer_id = dup_id;

      UPDATE public.tasks
        SET linked_customer_id = oldest_id WHERE linked_customer_id = dup_id;

      UPDATE public.bhph_payments
        SET customer_id = oldest_id WHERE customer_id = dup_id;

      UPDATE public.voice_calls
        SET customer_id = oldest_id WHERE customer_id = dup_id;

      UPDATE public.faxes
        SET customer_id = oldest_id WHERE customer_id = dup_id;

      -- Move vehicle links that don't conflict, then remove the rest
      INSERT INTO public.customer_vehicles (customer_id, vehicle_id, interest_level, created_at)
      SELECT oldest_id, cv.vehicle_id, cv.interest_level, cv.created_at
      FROM public.customer_vehicles cv
      WHERE cv.customer_id = dup_id
        AND NOT EXISTS (
          SELECT 1 FROM public.customer_vehicles
          WHERE customer_id = oldest_id AND vehicle_id = cv.vehicle_id
        );
      DELETE FROM public.customer_vehicles WHERE customer_id = dup_id;

    END LOOP;

    -- Delete duplicates (all child FKs re-parented above)
    DELETE FROM public.customers WHERE id = ANY(dup_ids);

    RAISE NOTICE '  Kept: % | Deleted: %', oldest_id, dup_ids;
  END LOOP;

END $$;
