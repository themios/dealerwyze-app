-- Add source column to audit_log for import source tracking (Phase 06).
-- Tracks which channel imported vehicles: paste (manual extraction), csv (file upload), auction (cron sync).

ALTER TABLE public.audit_log
ADD COLUMN source TEXT
  CHECK (source IS NULL OR source IN ('paste', 'csv', 'auction'));

CREATE INDEX IF NOT EXISTS idx_audit_log_org_source
  ON public.audit_log (org_id, source)
  WHERE source IS NOT NULL;

COMMENT ON COLUMN public.audit_log.source IS 'Import channel: paste (manual extraction), csv (file upload), auction (cron sync)';
