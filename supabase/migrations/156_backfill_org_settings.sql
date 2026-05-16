-- Ensure every organization has an org_settings row.
-- Orgs created before the signup trigger or via manual provisioning may be missing it.
INSERT INTO org_settings (org_id)
SELECT id FROM organizations
WHERE id NOT IN (SELECT org_id FROM org_settings);
