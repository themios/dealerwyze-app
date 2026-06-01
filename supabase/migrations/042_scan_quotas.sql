-- 042_scan_quotas.sql
-- AI Lead Scanner: per-org monthly scan counters + audit log
-- Apply in Supabase SQL editor.

-- ── 1. Scan counters on organizations ────────────────────────────────────────

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS monthly_scan_image_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_scan_pdf_count   INTEGER NOT NULL DEFAULT 0;

-- ── 2. Atomic increment RPC (avoids race conditions) ─────────────────────────

CREATE OR REPLACE FUNCTION increment_org_scan_counter(
  p_org_id UUID,
  p_is_pdf BOOLEAN DEFAULT FALSE
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE organizations
  SET
    monthly_scan_image_count = CASE WHEN NOT p_is_pdf
      THEN monthly_scan_image_count + 1
      ELSE monthly_scan_image_count END,
    monthly_scan_pdf_count = CASE WHEN p_is_pdf
      THEN monthly_scan_pdf_count + 1
      ELSE monthly_scan_pdf_count END
  WHERE id = p_org_id;
END;
$$;

-- ── 3. Scan audit log ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_scan_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  scan_type    TEXT        NOT NULL CHECK (scan_type IN ('image', 'pdf')),
  customer_id  UUID        NULL REFERENCES customers(id) ON DELETE SET NULL,
  overall_conf TEXT        NULL,   -- 'high' | 'medium' | 'low'
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_scan_log_org ON ai_scan_log (org_id, created_at DESC);

ALTER TABLE ai_scan_log ENABLE ROW LEVEL SECURITY;

-- SuperAdmin sees all; org members see own
DROP POLICY IF EXISTS "superadmin_all_scan_log" ON ai_scan_log;
CREATE POLICY "superadmin_all_scan_log" ON ai_scan_log FOR SELECT
  USING (EXISTS (SELECT 1 FROM platform_superusers WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "org_own_scan_log" ON ai_scan_log;
CREATE POLICY "org_own_scan_log" ON ai_scan_log FOR SELECT
  USING (org_id = public.get_org_id());
