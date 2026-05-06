-- Phase 2 (v1.1): Allow authenticated org members to access tenant-scoped social,
-- publish log, video render, and inventory inquiry rows — narrows service-role usage in API routes.
-- Isolation via public.get_org_id() (migration 038).

-- ── org_social_posting (was REVOKE ALL on authenticated in 133) ─────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_social_posting TO authenticated;

DROP POLICY IF EXISTS org_social_posting_tenant_all ON public.org_social_posting;
CREATE POLICY org_social_posting_tenant_all ON public.org_social_posting
  FOR ALL
  TO authenticated
  USING     (org_id = public.get_org_id())
  WITH CHECK (org_id = public.get_org_id());

-- ── social_publish_log ───────────────────────────────────────────────────────
GRANT SELECT, INSERT ON public.social_publish_log TO authenticated;

DROP POLICY IF EXISTS social_publish_log_tenant_select ON public.social_publish_log;
CREATE POLICY social_publish_log_tenant_select ON public.social_publish_log
  FOR SELECT
  TO authenticated
  USING (org_id = public.get_org_id());

DROP POLICY IF EXISTS social_publish_log_tenant_insert ON public.social_publish_log;
CREATE POLICY social_publish_log_tenant_insert ON public.social_publish_log
  FOR INSERT
  TO authenticated
  WITH CHECK (org_id = public.get_org_id());

-- ── social_accounts (OAuth connections; table from migration 089+) ───────────
DO $$
BEGIN
  IF to_regclass('public.social_accounts') IS NOT NULL THEN
    GRANT SELECT, UPDATE ON public.social_accounts TO authenticated;
    DROP POLICY IF EXISTS social_accounts_tenant_select ON public.social_accounts;
    CREATE POLICY social_accounts_tenant_select ON public.social_accounts
      FOR SELECT
      TO authenticated
      USING (org_id = public.get_org_id());
    DROP POLICY IF EXISTS social_accounts_tenant_update ON public.social_accounts;
    CREATE POLICY social_accounts_tenant_update ON public.social_accounts
      FOR UPDATE
      TO authenticated
      USING     (org_id = public.get_org_id())
      WITH CHECK (org_id = public.get_org_id());
  END IF;
END $$;

-- ── video_renders (if present) ───────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.video_renders') IS NOT NULL THEN
    ALTER TABLE public.video_renders ENABLE ROW LEVEL SECURITY;
    GRANT SELECT, INSERT, UPDATE ON public.video_renders TO authenticated;
    DROP POLICY IF EXISTS video_renders_tenant_select ON public.video_renders;
    CREATE POLICY video_renders_tenant_select ON public.video_renders
      FOR SELECT
      TO authenticated
      USING (org_id = public.get_org_id());
    DROP POLICY IF EXISTS video_renders_tenant_insert ON public.video_renders;
    CREATE POLICY video_renders_tenant_insert ON public.video_renders
      FOR INSERT
      TO authenticated
      WITH CHECK (org_id = public.get_org_id());
    DROP POLICY IF EXISTS video_renders_tenant_update ON public.video_renders;
    CREATE POLICY video_renders_tenant_update ON public.video_renders
      FOR UPDATE
      TO authenticated
      USING     (org_id = public.get_org_id())
      WITH CHECK (org_id = public.get_org_id());
  END IF;
END $$;

-- ── org_video_settings (render quota; if present) ───────────────────────────
DO $$
BEGIN
  IF to_regclass('public.org_video_settings') IS NOT NULL THEN
    ALTER TABLE public.org_video_settings ENABLE ROW LEVEL SECURITY;
    GRANT SELECT, INSERT, UPDATE ON public.org_video_settings TO authenticated;
    DROP POLICY IF EXISTS org_video_settings_tenant_all ON public.org_video_settings;
    CREATE POLICY org_video_settings_tenant_all ON public.org_video_settings
      FOR ALL
      TO authenticated
      USING     (org_id = public.get_org_id())
      WITH CHECK (org_id = public.get_org_id());
  END IF;
END $$;

-- ── org_pipeline_stages (pipeline board on customers page) ─────────────────
DO $$
BEGIN
  IF to_regclass('public.org_pipeline_stages') IS NOT NULL THEN
    ALTER TABLE public.org_pipeline_stages ENABLE ROW LEVEL SECURITY;
    GRANT SELECT ON public.org_pipeline_stages TO authenticated;
    DROP POLICY IF EXISTS org_pipeline_stages_tenant_select ON public.org_pipeline_stages;
    CREATE POLICY org_pipeline_stages_tenant_select ON public.org_pipeline_stages
      FOR SELECT
      TO authenticated
      USING (org_id = public.get_org_id());
  END IF;
END $$;

-- ── inventory_inquiries (web leads) ──────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.inventory_inquiries') IS NOT NULL THEN
    GRANT SELECT ON public.inventory_inquiries TO authenticated;
    DROP POLICY IF EXISTS inventory_inquiries_tenant_select ON public.inventory_inquiries;
    CREATE POLICY inventory_inquiries_tenant_select ON public.inventory_inquiries
      FOR SELECT
      TO authenticated
      USING (org_id = public.get_org_id());
  END IF;
END $$;
