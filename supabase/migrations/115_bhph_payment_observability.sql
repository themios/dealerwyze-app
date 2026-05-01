ALTER TABLE public.payment_reminder_log
  ADD COLUMN IF NOT EXISTS payment_token_id UUID REFERENCES public.bhph_payment_tokens(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_status TEXT
    CHECK (delivery_status IN ('queued','accepted','scheduled','sending','sent','delivered','undelivered','failed','read','canceled','unknown') OR delivery_status IS NULL),
  ADD COLUMN IF NOT EXISTS delivery_error_code TEXT,
  ADD COLUMN IF NOT EXISTS delivery_error_message TEXT,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS click_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

ALTER TABLE public.bhph_payment_tokens
  ADD COLUMN IF NOT EXISTS first_viewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_viewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS view_count INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_payment_reminder_log_twilio_sid
  ON public.payment_reminder_log (twilio_sid)
  WHERE twilio_sid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_reminder_log_payment_token
  ON public.payment_reminder_log (payment_token_id)
  WHERE payment_token_id IS NOT NULL;
