-- Dealer Stripe keys for BHPH payment collection (stored per org)
ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS stripe_dealer_publishable_key TEXT,
  ADD COLUMN IF NOT EXISTS stripe_dealer_secret_key      TEXT;

-- Booking page settings per org
ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS booking_enabled    BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS booking_intro_text TEXT;

-- BHPH payment tokens — one per SMS reminder, clicked by customer
CREATE TABLE IF NOT EXISTS bhph_payment_tokens (
  id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  UUID          NOT NULL REFERENCES organizations(id)  ON DELETE CASCADE,
  customer_id             UUID          NOT NULL REFERENCES customers(id)      ON DELETE CASCADE,
  bhph_contract_id        UUID          NOT NULL REFERENCES bhph_payments(id)  ON DELETE CASCADE,
  amount                  NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  token                   TEXT          NOT NULL UNIQUE,
  status                  TEXT          NOT NULL DEFAULT 'pending'
                                        CHECK (status IN ('pending', 'paid', 'expired')),
  stripe_payment_intent_id TEXT,
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT now(),
  paid_at                 TIMESTAMPTZ,
  expires_at              TIMESTAMPTZ   NOT NULL DEFAULT (now() + interval '7 days')
);

CREATE INDEX IF NOT EXISTS idx_bhph_payment_tokens_token  ON bhph_payment_tokens (token);
CREATE INDEX IF NOT EXISTS idx_bhph_payment_tokens_org    ON bhph_payment_tokens (org_id, status);
CREATE INDEX IF NOT EXISTS idx_bhph_payment_tokens_cust   ON bhph_payment_tokens (customer_id);
