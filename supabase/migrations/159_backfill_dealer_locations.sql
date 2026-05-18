-- Migrate existing org_settings.locations JSONB into dealer_locations table.
-- Only runs for orgs that have location objects in their JSONB array.
-- Skips orgs with empty or null locations array.
-- Skips orgs that already have rows in dealer_locations (idempotent).

INSERT INTO dealer_locations (org_id, name, address, phone, inventory_url, is_active, sort_order)
SELECT
  os.org_id,
  COALESCE(loc->>'name', 'Location'),
  loc->>'address',
  loc->>'phone',
  COALESCE(loc->>'inventory_url', loc->>'dealer_website_url'),
  COALESCE((loc->>'active')::boolean, true),
  ordinality - 1
FROM org_settings os,
  jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(os.locations) = 'array' THEN os.locations
      ELSE '[]'::jsonb
    END
  ) WITH ORDINALITY AS t(loc, ordinality)
WHERE
  jsonb_typeof(os.locations) = 'array'
  AND jsonb_array_length(os.locations) > 0
  AND os.org_id NOT IN (SELECT DISTINCT org_id FROM dealer_locations);
