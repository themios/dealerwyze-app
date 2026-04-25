-- ============================================================
-- CLEANUP: Merge duplicate customers (safe, non-destructive)
-- Run in Supabase SQL editor ONCE.
--
-- Strategy:
--   1. Find customers with duplicate phone numbers (same org)
--   2. Keep the OLDEST — it has the real activity/assignment history
--   3. Merge ALL fields onto oldest (best value wins; notes concatenated; tags unioned)
--   4. Re-parent activities, customer_vehicles, tasks, bhph_payments,
--      voice_calls, faxes, customer_sequences → oldest
--   5. Mark duplicates with merged_into_customer_id + merged_at (NOT deleted)
--
-- Safe to re-run: already-merged rows are skipped (merged_at IS NOT NULL).
-- ============================================================

DO $$
DECLARE
  rec        RECORD;
  oldest_id  UUID;
  dup_ids    UUID[];
  dup_id     UUID;
  oldest_rec RECORD;
  merged_notes TEXT;
  merged_tags  TEXT[];
BEGIN

  FOR rec IN
    SELECT
      user_id                                               AS org_key,
      REGEXP_REPLACE(primary_phone, '\D', '', 'g')         AS phone_norm,
      COUNT(*)                                             AS cnt
    FROM public.customers
    WHERE primary_phone IS NOT NULL
      AND LENGTH(REGEXP_REPLACE(primary_phone, '\D', '', 'g')) >= 10
      AND merged_at IS NULL   -- skip already-merged rows
    GROUP BY user_id, REGEXP_REPLACE(primary_phone, '\D', '', 'g')
    HAVING COUNT(*) > 1
  LOOP
    RAISE NOTICE 'Merging % duplicates — phone % in org %', rec.cnt, rec.phone_norm, rec.org_key;

    -- Oldest surviving record
    SELECT id INTO oldest_id
    FROM public.customers
    WHERE user_id = rec.org_key
      AND REGEXP_REPLACE(primary_phone, '\D', '', 'g') = rec.phone_norm
      AND merged_at IS NULL
    ORDER BY created_at ASC
    LIMIT 1;

    SELECT * INTO oldest_rec
    FROM public.customers WHERE id = oldest_id;

    -- All duplicate IDs (newer records, not yet merged)
    SELECT ARRAY_AGG(id) INTO dup_ids
    FROM public.customers
    WHERE user_id = rec.org_key
      AND REGEXP_REPLACE(primary_phone, '\D', '', 'g') = rec.phone_norm
      AND id != oldest_id
      AND merged_at IS NULL;

    -- --------------------------------------------------------
    -- Merge scalar fields: oldest wins unless null/empty,
    -- then pull best value from duplicates.
    -- --------------------------------------------------------
    UPDATE public.customers
    SET
      -- Identity
      name = CASE
        WHEN (oldest_rec.name IS NULL OR oldest_rec.name = '') THEN
          (SELECT name FROM public.customers WHERE id = ANY(dup_ids) AND name IS NOT NULL AND name != '' ORDER BY created_at ASC LIMIT 1)
        ELSE oldest_rec.name
      END,
      email = CASE
        WHEN (oldest_rec.email IS NULL OR oldest_rec.email = '') THEN
          (SELECT email FROM public.customers WHERE id = ANY(dup_ids) AND email IS NOT NULL AND email != '' ORDER BY created_at ASC LIMIT 1)
        ELSE oldest_rec.email
      END,
      secondary_phone = CASE
        WHEN oldest_rec.secondary_phone IS NULL THEN
          (SELECT secondary_phone FROM public.customers WHERE id = ANY(dup_ids) AND secondary_phone IS NOT NULL ORDER BY created_at ASC LIMIT 1)
        ELSE oldest_rec.secondary_phone
      END,

      -- Address
      address = CASE
        WHEN (oldest_rec.address IS NULL OR oldest_rec.address = '') THEN
          (SELECT address FROM public.customers WHERE id = ANY(dup_ids) AND address IS NOT NULL AND address != '' ORDER BY created_at ASC LIMIT 1)
        ELSE oldest_rec.address
      END,
      city = CASE
        WHEN (oldest_rec.city IS NULL OR oldest_rec.city = '') THEN
          (SELECT city FROM public.customers WHERE id = ANY(dup_ids) AND city IS NOT NULL AND city != '' ORDER BY created_at ASC LIMIT 1)
        ELSE oldest_rec.city
      END,
      state = CASE
        WHEN (oldest_rec.state IS NULL OR oldest_rec.state = '') THEN
          (SELECT state FROM public.customers WHERE id = ANY(dup_ids) AND state IS NOT NULL AND state != '' ORDER BY created_at ASC LIMIT 1)
        ELSE oldest_rec.state
      END,

      -- Retention / lifecycle
      birthday = COALESCE(oldest_rec.birthday,
        (SELECT birthday FROM public.customers WHERE id = ANY(dup_ids) AND birthday IS NOT NULL ORDER BY created_at ASC LIMIT 1)),
      last_service_date = GREATEST(
        oldest_rec.last_service_date,
        (SELECT MAX(last_service_date) FROM public.customers WHERE id = ANY(dup_ids) AND last_service_date IS NOT NULL)
      ),
      referred_by = COALESCE(oldest_rec.referred_by,
        (SELECT referred_by FROM public.customers WHERE id = ANY(dup_ids) AND referred_by IS NOT NULL ORDER BY created_at ASC LIMIT 1)),
      referral_source = CASE
        WHEN (oldest_rec.referral_source IS NULL OR oldest_rec.referral_source = '') THEN
          (SELECT referral_source FROM public.customers WHERE id = ANY(dup_ids) AND referral_source IS NOT NULL AND referral_source != '' ORDER BY created_at ASC LIMIT 1)
        ELSE oldest_rec.referral_source
      END,

      -- SMS consent: 'confirmed' beats 'pending' beats NULL
      sms_opt_out = (
        oldest_rec.sms_opt_out OR
        EXISTS (SELECT 1 FROM public.customers WHERE id = ANY(dup_ids) AND sms_opt_out = true)
      ),
      sms_opt_out_at = LEAST(
        oldest_rec.sms_opt_out_at,
        (SELECT MIN(sms_opt_out_at) FROM public.customers WHERE id = ANY(dup_ids) AND sms_opt_out_at IS NOT NULL)
      ),
      sms_consent_status = CASE
        WHEN oldest_rec.sms_consent_status = 'confirmed' THEN 'confirmed'
        WHEN EXISTS (SELECT 1 FROM public.customers WHERE id = ANY(dup_ids) AND sms_consent_status = 'confirmed') THEN 'confirmed'
        ELSE COALESCE(oldest_rec.sms_consent_status,
          (SELECT sms_consent_status FROM public.customers WHERE id = ANY(dup_ids) AND sms_consent_status IS NOT NULL ORDER BY created_at ASC LIMIT 1))
      END,

      -- Engagement: keep most recent timestamps, highest score
      last_outbound_at = GREATEST(
        oldest_rec.last_outbound_at,
        (SELECT MAX(last_outbound_at) FROM public.customers WHERE id = ANY(dup_ids))
      ),
      last_inbound_at = GREATEST(
        oldest_rec.last_inbound_at,
        (SELECT MAX(last_inbound_at) FROM public.customers WHERE id = ANY(dup_ids))
      ),
      engagement_score = GREATEST(
        oldest_rec.engagement_score,
        COALESCE((SELECT MAX(engagement_score) FROM public.customers WHERE id = ANY(dup_ids)), 0)
      ),

      -- Misc
      automation_override = COALESCE(oldest_rec.automation_override,
        (SELECT automation_override FROM public.customers WHERE id = ANY(dup_ids) AND automation_override IS NOT NULL ORDER BY created_at ASC LIMIT 1)),
      lead_rating = COALESCE(oldest_rec.lead_rating,
        (SELECT lead_rating FROM public.customers WHERE id = ANY(dup_ids) AND lead_rating IS NOT NULL ORDER BY created_at ASC LIMIT 1))

    WHERE id = oldest_id;

    -- --------------------------------------------------------
    -- Merge notes: concatenate both if both have content
    -- --------------------------------------------------------
    SELECT
      CASE
        WHEN oldest_rec.notes IS NOT NULL AND oldest_rec.notes != '' THEN
          oldest_rec.notes ||
          COALESCE(
            E'\n---\n' || (SELECT STRING_AGG(notes, E'\n---\n' ORDER BY created_at ASC)
                           FROM public.customers
                           WHERE id = ANY(dup_ids) AND notes IS NOT NULL AND notes != ''),
            ''
          )
        ELSE
          (SELECT STRING_AGG(notes, E'\n---\n' ORDER BY created_at ASC)
           FROM public.customers
           WHERE id = ANY(dup_ids) AND notes IS NOT NULL AND notes != '')
      END
    INTO merged_notes;

    IF merged_notes IS NOT NULL AND merged_notes != '' THEN
      UPDATE public.customers SET notes = merged_notes WHERE id = oldest_id;
    END IF;

    -- --------------------------------------------------------
    -- Merge tags: union of all tag arrays
    -- --------------------------------------------------------
    SELECT ARRAY(
      SELECT DISTINCT unnest
      FROM (
        SELECT UNNEST(oldest_rec.tags) AS unnest
        UNION
        SELECT UNNEST(tags) FROM public.customers WHERE id = ANY(dup_ids)
      ) t
      WHERE unnest IS NOT NULL
    ) INTO merged_tags;

    IF array_length(merged_tags, 1) > 0 THEN
      UPDATE public.customers SET tags = merged_tags WHERE id = oldest_id;
    END IF;

    -- --------------------------------------------------------
    -- Re-parent all child records from each duplicate → oldest
    -- --------------------------------------------------------
    FOREACH dup_id IN ARRAY dup_ids LOOP

      -- Communications & notes
      UPDATE public.activities
        SET customer_id = oldest_id WHERE customer_id = dup_id;

      -- Tasks & appointments
      UPDATE public.tasks
        SET linked_customer_id = oldest_id WHERE linked_customer_id = dup_id;

      -- Calls
      UPDATE public.voice_calls
        SET customer_id = oldest_id WHERE customer_id = dup_id;

      -- Faxes
      UPDATE public.faxes
        SET customer_id = oldest_id WHERE customer_id = dup_id;

      -- Documents
      UPDATE public.customer_documents
        SET customer_id = oldest_id WHERE customer_id = dup_id;

      -- BHPH payments & reminder log
      UPDATE public.bhph_payments
        SET customer_id = oldest_id WHERE customer_id = dup_id;
      UPDATE public.payment_reminder_log
        SET customer_id = oldest_id WHERE customer_id = dup_id;

      -- Stripe pay links
      UPDATE public.bhph_payment_tokens
        SET customer_id = oldest_id WHERE customer_id = dup_id;

      -- Vehicle sold_to link
      UPDATE public.vehicles
        SET sold_to_customer_id = oldest_id WHERE sold_to_customer_id = dup_id;

      -- Vehicle want list
      UPDATE public.vehicle_wants
        SET customer_id = oldest_id WHERE customer_id = dup_id;

      -- AI scan log
      UPDATE public.ai_scan_log
        SET customer_id = oldest_id WHERE customer_id = dup_id;

      -- Card mailings (retention)
      UPDATE public.card_mailings
        SET customer_id = oldest_id WHERE customer_id = dup_id;

      -- Vehicle interest links (dedup on conflict)
      INSERT INTO public.customer_vehicles (customer_id, vehicle_id, interest_level, created_at)
      SELECT oldest_id, cv.vehicle_id, cv.interest_level, cv.created_at
      FROM public.customer_vehicles cv
      WHERE cv.customer_id = dup_id
        AND NOT EXISTS (
          SELECT 1 FROM public.customer_vehicles
          WHERE customer_id = oldest_id AND vehicle_id = cv.vehicle_id
        );
      DELETE FROM public.customer_vehicles WHERE customer_id = dup_id;

      -- Sequence enrollments (dedup on conflict)
      INSERT INTO public.customer_sequences (customer_id, sequence_id, channel, status, start_at, created_at)
      SELECT oldest_id, cs.sequence_id, cs.channel, cs.status, cs.start_at, cs.created_at
      FROM public.customer_sequences cs
      WHERE cs.customer_id = dup_id
        AND NOT EXISTS (
          SELECT 1 FROM public.customer_sequences
          WHERE customer_id = oldest_id AND sequence_id = cs.sequence_id AND channel = cs.channel
        );
      DELETE FROM public.customer_sequences WHERE customer_id = dup_id;

    END LOOP;

    -- --------------------------------------------------------
    -- Mark duplicates as merged (NOT deleted)
    -- --------------------------------------------------------
    UPDATE public.customers
    SET
      merged_into_customer_id = oldest_id,
      merged_at = NOW()
    WHERE id = ANY(dup_ids);

    RAISE NOTICE '  Kept: % | Merged (soft): %', oldest_id, dup_ids;
  END LOOP;

END $$;
