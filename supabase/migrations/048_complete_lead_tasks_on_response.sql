-- When a user logs an outbound call, SMS, or email for a customer (insert or complete),
-- automatically mark that customer's open lead_response and lead_followup tasks as done
-- so the Today to-do list stays in sync.

CREATE OR REPLACE FUNCTION public.complete_lead_tasks_on_response()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.type IN ('call', 'sms', 'email')
     AND NEW.direction = 'outbound'
     AND NEW.customer_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (OLD.completed_at IS DISTINCT FROM NEW.completed_at)))
  THEN
    UPDATE tasks
    SET status       = 'done',
        completed_at = COALESCE(completed_at, NOW()),
        updated_at   = NOW()
    WHERE linked_customer_id = NEW.customer_id
      AND user_id           = NEW.user_id
      AND task_type IN ('lead_response', 'lead_followup')
      AND status            = 'open';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_complete_lead_tasks_on_response ON activities;
CREATE TRIGGER trg_complete_lead_tasks_on_response
  AFTER INSERT OR UPDATE OF completed_at
  ON activities
  FOR EACH ROW
  EXECUTE FUNCTION public.complete_lead_tasks_on_response();

COMMENT ON FUNCTION public.complete_lead_tasks_on_response() IS
  'Marks open lead_response and lead_followup tasks as done when an outbound call/sms/email is logged for that customer.';
