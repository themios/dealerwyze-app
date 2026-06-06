-- Migration 234: Add constraint to prevent concurrent churn-detection bypass
-- Ensures only one active/free org per email domain (prevents duplicate signup race condition)

CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_one_active_per_domain
  ON organizations (signup_email_domain)
  WHERE signup_email_domain IS NOT NULL
    AND subscription_status IN ('active', 'free');

COMMENT ON INDEX idx_organizations_one_active_per_domain IS
  'Prevents concurrent signups from the same email domain. Race-safe churn detection.';
