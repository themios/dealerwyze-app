-- 043_data_retention.sql
-- Adds canceled_at to organizations so the data-retention job knows when the
-- 90-day grace period begins.  The column is stamped by the Stripe webhook when
-- customer.subscription.deleted fires.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ NULL;
