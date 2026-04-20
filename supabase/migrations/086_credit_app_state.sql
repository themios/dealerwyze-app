-- 086_credit_app_state.sql
-- Add 'credit_app' pipeline stage between 'showed' and 'sold'

-- Drop and recreate CHECK constraint to include new state
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_thread_state_check;
ALTER TABLE customers
  ADD CONSTRAINT customers_thread_state_check
  CHECK (thread_state IN (
    'new_lead','contacted','engaged','appointment_set',
    'appointment_confirmed','showed','credit_app','sold','lost','dormant'
  ));

-- Update advance_lead_state RPC to include credit_app in forward-only order
CREATE OR REPLACE FUNCTION advance_lead_state(
  p_customer_id UUID,
  p_new_state   TEXT,
  p_reason      TEXT DEFAULT NULL
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  state_order TEXT[] := ARRAY[
    'new_lead','contacted','engaged','appointment_set',
    'appointment_confirmed','showed','credit_app','sold'
  ];
  cur_state TEXT;
  cur_idx   INT;
  new_idx   INT;
BEGIN
  SELECT thread_state INTO cur_state FROM customers WHERE id = p_customer_id;
  cur_idx := array_position(state_order, cur_state);
  new_idx := array_position(state_order, p_new_state);

  -- Allow: lost/dormant from any state; advancing forward; unknown/null states
  IF p_new_state IN ('lost','dormant')
     OR new_idx IS NULL
     OR cur_idx IS NULL
     OR new_idx > cur_idx
  THEN
    UPDATE customers
    SET
      thread_state          = p_new_state,
      lead_state_changed_at = NOW(),
      lead_state_reason     = p_reason
    WHERE id = p_customer_id;
    RETURN TRUE;
  END IF;

  RETURN FALSE;  -- backward transition blocked
END;
$$;
