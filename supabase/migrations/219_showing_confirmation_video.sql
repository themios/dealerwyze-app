-- Link property tour renders to showing confirmations (webhook sends buyer video email)
ALTER TABLE video_renders
  ADD COLUMN IF NOT EXISTS showing_request_id UUID REFERENCES showing_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_video_renders_showing_request
  ON video_renders(showing_request_id)
  WHERE showing_request_id IS NOT NULL;

COMMENT ON COLUMN video_renders.showing_request_id IS
  'When set, render-complete webhook emails the buyer a property tour link for this showing.';
