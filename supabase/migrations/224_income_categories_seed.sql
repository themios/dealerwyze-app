-- Migration 224: Seed income categories for all existing orgs, split by vertical
-- DealerWyze (dealer) and RealtyWyze (real_estate) get different income categories.
-- Uses ON CONFLICT DO NOTHING so safe to re-run.

-- ── DealerWyze income categories ──────────────────────────────────────────────
INSERT INTO receipt_categories (user_id, name, category_type, requires_vehicle, is_default, sort_order)
SELECT
  o.id,
  c.name,
  'income',
  c.requires_vehicle,
  true,
  c.sort_order
FROM organizations o
CROSS JOIN (VALUES
  ('Vehicle Sale',           true,  101),
  ('BHPH Payment Received',  true,  102),
  ('Dealer Reserve / F&I',   true,  103),
  ('Down Payment',           true,  104),
  ('Trade-In Allowance',     true,  105),
  ('Auction Sale Proceeds',  true,  106),
  ('Other Income',           false, 107)
) AS c(name, requires_vehicle, sort_order)
WHERE o.vertical = 'dealer'
  AND o.id != '00000000-0000-0000-0000-000000000001'
ON CONFLICT (user_id, category_type, name) DO NOTHING;

-- ── RealtyWyze income categories ──────────────────────────────────────────────
INSERT INTO receipt_categories (user_id, name, category_type, requires_vehicle, is_default, sort_order)
SELECT
  o.id,
  c.name,
  'income',
  c.requires_vehicle,
  true,
  c.sort_order
FROM organizations o
CROSS JOIN (VALUES
  ('Commission - Sale',          true,  101),
  ('Commission - Lease/Rental',  true,  102),
  ('Referral Fee',               false, 103),
  ('Other Income',               false, 104)
) AS c(name, requires_vehicle, sort_order)
WHERE o.vertical = 'real_estate'
  AND o.id != '00000000-0000-0000-0000-000000000001'
ON CONFLICT (user_id, category_type, name) DO NOTHING;
