-- Per-org Retell AI voice agent provisioning.
ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS retell_agent_id TEXT,
  ADD COLUMN IF NOT EXISTS retell_llm_id   TEXT;
