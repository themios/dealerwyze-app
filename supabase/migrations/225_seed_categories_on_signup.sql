-- Migration 225: Update create_org_on_signup to seed both expense and income categories
-- for new orgs at registration, split by vertical (dealer vs real_estate).
--
-- Previous versions seeded via the migration 012 cross-join on auth.users, which
-- only covered existing orgs at migration time. New signups got nothing.
-- This trigger now handles all future orgs at the moment the profile is created.

CREATE OR REPLACE FUNCTION create_org_on_signup()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_vertical TEXT;
BEGIN
  IF NEW.role != 'admin' THEN
    RETURN NEW;
  END IF;

  -- Create org row
  INSERT INTO organizations (id, name)
  VALUES (NEW.org_id, COALESCE(NEW.display_name || '''s Dealership', 'My Dealership'))
  ON CONFLICT (id) DO NOTHING;

  -- Create org settings
  INSERT INTO org_settings (org_id)
  VALUES (NEW.org_id)
  ON CONFLICT (org_id) DO NOTHING;

  -- Determine vertical (default: dealer for backward compat)
  SELECT vertical INTO v_vertical FROM organizations WHERE id = NEW.org_id;
  v_vertical := COALESCE(v_vertical, 'dealer');

  -- ── Seed expense categories ───────────────────────────────────────────────
  IF v_vertical = 'real_estate' THEN
    INSERT INTO receipt_categories (user_id, name, category_type, requires_vehicle, is_default, sort_order)
    VALUES
      (NEW.org_id, 'Marketing & Advertising',    'expense', false, true, 1),
      (NEW.org_id, 'MLS & Dues',                 'expense', false, true, 2),
      (NEW.org_id, 'Photography & Staging',       'expense', true,  true, 3),
      (NEW.org_id, 'Signs & Lockboxes',           'expense', true,  true, 4),
      (NEW.org_id, 'Transaction Costs',           'expense', true,  true, 5),
      (NEW.org_id, 'Office / Admin',              'expense', false, true, 6),
      (NEW.org_id, 'Software / Subscriptions',    'expense', false, true, 7),
      (NEW.org_id, 'Vehicle / Mileage',           'expense', false, true, 8),
      (NEW.org_id, 'Miscellaneous',               'expense', false, true, 9)
    ON CONFLICT (user_id, category_type, name) DO NOTHING;
  ELSE
    -- dealer (default)
    INSERT INTO receipt_categories (user_id, name, category_type, requires_vehicle, is_default, sort_order)
    VALUES
      (NEW.org_id, 'Recon: Parts',               'expense', true,  true, 1),
      (NEW.org_id, 'Recon: Labor / Mechanic',    'expense', true,  true, 2),
      (NEW.org_id, 'Fuel',                       'expense', false, true, 3),
      (NEW.org_id, 'Advertising & Leads',        'expense', false, true, 4),
      (NEW.org_id, 'Auction & Fees',             'expense', false, true, 5),
      (NEW.org_id, 'DMV / Registration / Title', 'expense', false, true, 6),
      (NEW.org_id, 'Insurance',                  'expense', false, true, 7),
      (NEW.org_id, 'Software / Subscriptions',   'expense', false, true, 8),
      (NEW.org_id, 'Office / Supplies',          'expense', false, true, 9),
      (NEW.org_id, 'Towing / Transport',         'expense', false, true, 10),
      (NEW.org_id, 'Utilities & Facilities',     'expense', false, true, 11),
      (NEW.org_id, 'Miscellaneous',              'expense', false, true, 12)
    ON CONFLICT (user_id, category_type, name) DO NOTHING;
  END IF;

  -- ── Seed income categories ────────────────────────────────────────────────
  IF v_vertical = 'real_estate' THEN
    INSERT INTO receipt_categories (user_id, name, category_type, requires_vehicle, is_default, sort_order)
    VALUES
      (NEW.org_id, 'Commission - Sale',         'income', true,  true, 101),
      (NEW.org_id, 'Commission - Lease/Rental', 'income', true,  true, 102),
      (NEW.org_id, 'Referral Fee',              'income', false, true, 103),
      (NEW.org_id, 'Other Income',              'income', false, true, 104)
    ON CONFLICT (user_id, category_type, name) DO NOTHING;
  ELSE
    INSERT INTO receipt_categories (user_id, name, category_type, requires_vehicle, is_default, sort_order)
    VALUES
      (NEW.org_id, 'Vehicle Sale',           'income', true,  true, 101),
      (NEW.org_id, 'BHPH Payment Received',  'income', true,  true, 102),
      (NEW.org_id, 'Dealer Reserve / F&I',   'income', true,  true, 103),
      (NEW.org_id, 'Down Payment',           'income', true,  true, 104),
      (NEW.org_id, 'Trade-In Allowance',     'income', true,  true, 105),
      (NEW.org_id, 'Auction Sale Proceeds',  'income', true,  true, 106),
      (NEW.org_id, 'Other Income',           'income', false, true, 107)
    ON CONFLICT (user_id, category_type, name) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
