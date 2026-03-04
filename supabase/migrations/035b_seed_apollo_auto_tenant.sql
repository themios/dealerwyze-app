-- ============================================================
-- 035b_seed_apollo_auto_tenant.sql
-- One-time seed: Apollo Auto config → DB as regular tenant
-- Run AFTER 035_dealerwyze_saas.sql
-- ============================================================

-- Verify org exists first
SELECT id, name FROM organizations
WHERE id = 'db5442d1-e92f-4eb0-8876-6adb1a9a0ccb';

-- Seed org_settings for Apollo Auto
UPDATE org_settings SET
  owner_name          = 'Tim',
  city                = 'El Monte',
  state               = 'CA',
  zip_code            = '91731',
  locations           = '[
    {"name": "El Monte", "address": "10915 Garvey Ave, El Monte, CA 91733"}
  ]'::jsonb,
  gbp_location_id     = 'locations/3595854674576679340',
  gbp_account_id      = 'accounts/-',
  dealer_website_url  = 'https://www.apolloauto-em.com',
  dealer_website_inventory_path = '/cars-for-sale'
WHERE org_id = 'db5442d1-e92f-4eb0-8876-6adb1a9a0ccb';

-- Confirm rows updated
SELECT org_id, owner_name, city, gbp_location_id, dealer_website_url
FROM org_settings
WHERE org_id = 'db5442d1-e92f-4eb0-8876-6adb1a9a0ccb';
