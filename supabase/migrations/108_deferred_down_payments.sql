ALTER TABLE public.bhph_payments
  ADD COLUMN IF NOT EXISTS required_down_payment numeric;

CREATE TABLE IF NOT EXISTS public.bhph_deferred_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  bhph_id uuid NOT NULL REFERENCES public.bhph_payments(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'paid', 'cancelled')),
  notes text,
  paid_at timestamptz,
  paid_amount numeric,
  reminder_sequence_status text NOT NULL DEFAULT 'active'
    CHECK (reminder_sequence_status IN ('active','paused','completed','opted_out','escalated')),
  last_reminder_type text
    CHECK (last_reminder_type IN ('pre_3day','due_day','late_2day','late_7day') OR last_reminder_type IS NULL),
  last_reminder_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bhph_deferred_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_bhph_deferred_payments ON public.bhph_deferred_payments;
CREATE POLICY org_bhph_deferred_payments ON public.bhph_deferred_payments
  FOR ALL
  USING (user_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid() LIMIT 1));

CREATE INDEX IF NOT EXISTS idx_bhph_deferred_active_due
  ON public.bhph_deferred_payments (user_id, status, due_date)
  WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_bhph_deferred_contract
  ON public.bhph_deferred_payments (bhph_id, due_date);
