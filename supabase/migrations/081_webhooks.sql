CREATE TABLE IF NOT EXISTS org_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  url TEXT NOT NULL CHECK (char_length(url) <= 500),
  events TEXT[] NOT NULL DEFAULT '{}',
  secret TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_org_webhooks_org ON org_webhooks(org_id) WHERE active = true;
ALTER TABLE org_webhooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_own_webhooks" ON org_webhooks
  FOR ALL USING (org_id = public.get_org_id());
