-- Stamp customer first_response_at and response_time_seconds when any outbound
-- contact (email, SMS, or call) is recorded, not only when sending via Twilio.
CREATE OR REPLACE FUNCTION public.stamp_customer_first_response()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resp_ts TIMESTAMPTZ;
BEGIN
  IF NEW.customer_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.direction <> 'outbound' OR NEW.type NOT IN ('sms', 'email', 'call') THEN
    RETURN NEW;
  END IF;

  resp_ts := COALESCE(NEW.completed_at, NEW.created_at);

  UPDATE customers c
  SET
    first_response_at     = resp_ts,
    response_time_seconds = GREATEST(0, EXTRACT(EPOCH FROM (resp_ts - c.created_at))::INTEGER)
  WHERE c.id = NEW.customer_id
    AND c.first_response_at IS NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_response_time_on_activity ON activities;
CREATE TRIGGER trg_stamp_response_time_on_activity
  AFTER INSERT ON activities
  FOR EACH ROW EXECUTE FUNCTION public.stamp_customer_first_response();
