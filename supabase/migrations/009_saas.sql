-- SaaS multi-tenant billing schema
-- organizations.id = owner's auth.users.id = org_id used everywhere
-- No data migration needed on existing tables

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'My Dealership',
  plan TEXT NOT NULL DEFAULT 'trial',          -- trial | active | canceled
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  stripe_price_id TEXT,
  subscription_status TEXT DEFAULT 'trialing', -- trialing | active | past_due | canceled | unpaid
  trial_ends_at TIMESTAMPTZ DEFAULT (now() + interval '14 days'),
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS org_settings (
  org_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  -- Business info (used in SMS templates)
  business_name TEXT,
  business_phone TEXT,
  business_address TEXT,
  -- Twilio (provisioned per dealer from your master account)
  twilio_phone_number TEXT,
  twilio_phone_sid TEXT,
  -- Gmail OAuth (per dealer)
  gmail_email TEXT,
  gmail_refresh_token TEXT,
  gmail_access_token TEXT,
  gmail_token_expiry TIMESTAMPTZ,
  -- Preferences
  timezone TEXT DEFAULT 'America/Los_Angeles',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-create org record when new user signs up (owner only, role=admin)
CREATE OR REPLACE FUNCTION create_org_on_signup()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Only create org for admin/owner profiles
  IF NEW.role = 'admin' THEN
    INSERT INTO organizations (id, name)
    VALUES (NEW.org_id, COALESCE(NEW.display_name || '''s Dealership', 'My Dealership'))
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO org_settings (org_id)
    VALUES (NEW.org_id)
    ON CONFLICT (org_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_create_org_on_signup
  AFTER INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION create_org_on_signup();

-- Seed existing orgs (run once for current users)
INSERT INTO organizations (id, name)
SELECT DISTINCT p.org_id, COALESCE(p.display_name || '''s Dealership', 'My Dealership')
FROM profiles p
WHERE p.role = 'admin'
ON CONFLICT (id) DO NOTHING;

INSERT INTO org_settings (org_id)
SELECT DISTINCT p.org_id
FROM profiles p
WHERE p.role = 'admin'
ON CONFLICT (org_id) DO NOTHING;
