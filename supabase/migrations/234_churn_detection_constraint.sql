-- Migration 234: Add constraint to prevent concurrent churn-detection bypass
-- Ensures only one active/free org per email domain (prevents duplicate signup race condition)

-- Step 1: Deactivate older duplicate orgs (keep most recent per domain)
UPDATE organizations o1
SET subscription_status = 'canceled'
WHERE signup_email_domain IS NOT NULL
  AND subscription_status IN ('active', 'free')
  AND id IN (
    SELECT o2.id
    FROM organizations o2
    WHERE o2.signup_email_domain = o1.signup_email_domain
      AND o2.subscription_status IN ('active', 'free')
      AND o2.created_at < (
        SELECT MAX(o3.created_at)
        FROM organizations o3
        WHERE o3.signup_email_domain = o1.signup_email_domain
          AND o3.subscription_status IN ('active', 'free')
      )
  );

-- Step 2: Create unique index on the now-clean data
CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_one_active_per_domain
  ON organizations (signup_email_domain)
  WHERE signup_email_domain IS NOT NULL
    AND subscription_status IN ('active', 'free');

COMMENT ON INDEX idx_organizations_one_active_per_domain IS
  'Prevents concurrent signups from the same email domain. Race-safe churn detection.';
