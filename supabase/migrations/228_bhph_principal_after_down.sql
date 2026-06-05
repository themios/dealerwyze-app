-- Seed principal_balance after down payment; repair legacy contracts that omitted down.

CREATE OR REPLACE FUNCTION public.finalize_bhph_sale_with_deferred(
  p_org_id                    UUID,
  p_vehicle_id                UUID,
  p_customer_id               UUID,
  p_sold_price                NUMERIC,
  p_finance_type              TEXT,
  p_finance_company           TEXT,
  p_down_payment              NUMERIC,
  p_required_down_payment     NUMERIC,
  p_loan_amount               NUMERIC,
  p_monthly_payment           NUMERIC,
  p_payment_frequency         TEXT,
  p_payment_day               INT,
  p_first_due_date            DATE,
  p_customer_email            TEXT,
  p_sms_consent               BOOLEAN,
  p_sms_consent_at            TIMESTAMPTZ,
  p_sms_consent_ip            TEXT,
  p_sms_consent_disclosure    TEXT,
  p_email_consent             BOOLEAN,
  p_email_consent_at          TIMESTAMPTZ,
  p_notes                     TEXT,
  p_deferred_payments         JSONB DEFAULT '[]'::JSONB,
  p_interest_rate             NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_vehicle_updated INT;
  v_bhph_id UUID;
  v_item JSONB;
  v_deferred_amount NUMERIC;
  v_deferred_due_date DATE;
  v_deferred_notes TEXT;
  v_remaining_down NUMERIC := GREATEST(COALESCE(p_required_down_payment, 0) - COALESCE(p_down_payment, 0), 0);
  v_deferred_total NUMERIC := 0;
  v_interest NUMERIC(5, 4);
  v_contract_total NUMERIC;
  v_initial_principal NUMERIC;
BEGIN
  v_interest := ROUND(
    LEAST(GREATEST(COALESCE(p_interest_rate, 0), 0), 1)::NUMERIC,
    4
  );

  UPDATE public.vehicles
  SET
    status = 'sold',
    sold_price = p_sold_price,
    sold_at = now(),
    sold_to_customer_id = p_customer_id,
    finance_type = p_finance_type,
    finance_company = NULLIF(p_finance_company, '')
  WHERE id = p_vehicle_id
    AND user_id = p_org_id;

  GET DIAGNOSTICS v_vehicle_updated = ROW_COUNT;
  IF v_vehicle_updated = 0 THEN
    RAISE EXCEPTION 'Vehicle not found';
  END IF;

  IF p_customer_id IS NOT NULL THEN
    INSERT INTO public.customer_vehicles (customer_id, vehicle_id, interest_level)
    VALUES (p_customer_id, p_vehicle_id, 'hot')
    ON CONFLICT (customer_id, vehicle_id) DO UPDATE SET interest_level = EXCLUDED.interest_level;

    UPDATE public.activities
    SET completed_at = now()
    WHERE user_id = p_org_id
      AND customer_id = p_customer_id
      AND vehicle_id = p_vehicle_id
      AND direction = 'inbound'
      AND completed_at IS NULL;
  END IF;

  IF p_finance_type = 'bhph' AND p_monthly_payment IS NOT NULL AND p_first_due_date IS NOT NULL THEN
    IF p_customer_id IS NULL THEN
      RAISE EXCEPTION 'Customer required for BHPH contracts';
    END IF;

    IF jsonb_typeof(COALESCE(p_deferred_payments, '[]'::JSONB)) <> 'array' THEN
      RAISE EXCEPTION 'Deferred payments must be an array';
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_deferred_payments, '[]'::JSONB))
    LOOP
      v_deferred_amount := NULLIF(v_item->>'amount', '')::NUMERIC;
      v_deferred_due_date := NULLIF(v_item->>'due_date', '')::DATE;
      v_deferred_notes := NULLIF(BTRIM(COALESCE(v_item->>'notes', '')), '');

      IF v_deferred_amount IS NULL OR v_deferred_amount <= 0 OR v_deferred_due_date IS NULL THEN
        RAISE EXCEPTION 'Each deferred payment requires a positive amount and due date';
      END IF;

      v_deferred_total := v_deferred_total + v_deferred_amount;
    END LOOP;

    IF jsonb_array_length(COALESCE(p_deferred_payments, '[]'::JSONB)) > 0 THEN
      IF v_remaining_down <= 0 THEN
        RAISE EXCEPTION 'Deferred down payment requires a remaining balance';
      END IF;
      IF ABS(v_deferred_total - v_remaining_down) > 0.01 THEN
        RAISE EXCEPTION 'Deferred payments must equal the remaining down payment balance';
      END IF;
    END IF;

    v_contract_total := COALESCE(p_loan_amount, p_sold_price);
    v_initial_principal := GREATEST(
      0::NUMERIC,
      ROUND((v_contract_total - COALESCE(p_down_payment, 0))::NUMERIC, 2)
    );

    INSERT INTO public.bhph_payments (
      user_id,
      vehicle_id,
      customer_id,
      down_payment,
      required_down_payment,
      loan_amount,
      monthly_payment,
      payment_frequency,
      payment_day_of_month,
      frequency_anchor_date,
      payment_day_anchor,
      next_due_date,
      customer_email,
      sms_consent,
      sms_consent_at,
      sms_consent_ip,
      sms_consent_disclosure,
      email_consent,
      email_consent_at,
      notes,
      status,
      reminder_sequence_status,
      interest_rate,
      principal_balance
    ) VALUES (
      p_org_id,
      p_vehicle_id,
      p_customer_id,
      COALESCE(p_down_payment, 0),
      p_required_down_payment,
      v_contract_total,
      p_monthly_payment,
      COALESCE(p_payment_frequency, 'monthly'),
      COALESCE(p_payment_day, 1),
      p_first_due_date,
      COALESCE(p_payment_day, 1),
      p_first_due_date,
      NULLIF(p_customer_email, ''),
      COALESCE(p_sms_consent, false),
      p_sms_consent_at,
      p_sms_consent_ip,
      p_sms_consent_disclosure,
      COALESCE(p_email_consent, false),
      p_email_consent_at,
      NULLIF(p_notes, ''),
      'active',
      'active',
      v_interest,
      v_initial_principal
    )
    RETURNING id INTO v_bhph_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_deferred_payments, '[]'::JSONB))
    LOOP
      v_deferred_amount := NULLIF(v_item->>'amount', '')::NUMERIC;
      v_deferred_due_date := NULLIF(v_item->>'due_date', '')::DATE;
      v_deferred_notes := NULLIF(BTRIM(COALESCE(v_item->>'notes', '')), '');

      INSERT INTO public.bhph_deferred_payments (
        user_id,
        bhph_id,
        vehicle_id,
        customer_id,
        amount,
        due_date,
        status,
        notes,
        reminder_sequence_status
      ) VALUES (
        p_org_id,
        v_bhph_id,
        p_vehicle_id,
        p_customer_id,
        v_deferred_amount,
        v_deferred_due_date,
        'scheduled',
        v_deferred_notes,
        'active'
      );
    END LOOP;

    INSERT INTO public.activities (
      user_id,
      customer_id,
      vehicle_id,
      type,
      body,
      due_at,
      priority
    ) VALUES (
      p_org_id,
      p_customer_id,
      p_vehicle_id,
      'task',
      'BHPH payment #1 due — ' || COALESCE(p_payment_frequency, 'monthly') || ' — $' || p_monthly_payment,
      (p_first_due_date::TEXT || 'T09:00:00')::TIMESTAMPTZ,
      'high'
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'bhph_id', v_bhph_id);
END;
$$;

-- Repair active contracts where principal_balance ignored down_payment at sale.
UPDATE public.bhph_payments
SET principal_balance = GREATEST(
  0::NUMERIC,
  ROUND(
    (COALESCE(loan_amount, 0) - COALESCE(down_payment, 0) - COALESCE(total_paid, 0))::NUMERIC,
    2
  )
)
WHERE principal_balance IS NOT NULL
  AND status = 'active'
  AND COALESCE(down_payment, 0) > 0
  AND principal_balance > GREATEST(
    0::NUMERIC,
    ROUND(
      (COALESCE(loan_amount, 0) - COALESCE(down_payment, 0) - COALESCE(total_paid, 0))::NUMERIC,
      2
    )
  ) + 0.01;
