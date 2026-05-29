-- 191_listing_showing_count_trigger.sql
-- Phase 7: Keep vehicles.showing_count in sync with showings table.
-- showings.listing_id references vehicles.id (from migration 180).
-- showing_count is the denormalized count; GREATEST(..., 0) prevents negative counts
-- on edge cases (e.g. if showing_count was manually corrected).

CREATE OR REPLACE FUNCTION sync_listing_showing_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE vehicles SET showing_count = COALESCE(showing_count, 0) + 1
    WHERE id = NEW.listing_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE vehicles SET showing_count = GREATEST(COALESCE(showing_count, 0) - 1, 0)
    WHERE id = OLD.listing_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_listing_showing_count ON showings;
CREATE TRIGGER trg_listing_showing_count
  AFTER INSERT OR DELETE ON showings
  FOR EACH ROW EXECUTE FUNCTION sync_listing_showing_count();
