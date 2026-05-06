-- Migration 148: Fix advance_lead_state with qualified table name.
-- Migration 097 set search_path = '' on this function, which broke the
-- unqualified 'customers' reference. Recreate with public.customers.

CREATE OR REPLACE FUNCTION public.advance_lead_state(
  p_customer_id UUID,
  p_new_state   TEXT,
  p_reason      TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.customers
  SET
    thread_state          = p_new_state,
    lead_state_changed_at = NOW(),
    lead_state_reason     = p_reason
  WHERE id = p_customer_id;
  RETURN FOUND;
END;
$$;
