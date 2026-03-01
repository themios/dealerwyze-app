-- Vehicle documents (Carfax, inspection reports, window stickers)
CREATE TABLE IF NOT EXISTS vehicle_documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_id  UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  file_name   TEXT NOT NULL,
  file_key    TEXT NOT NULL,
  file_size   BIGINT,
  mime_type   TEXT,
  ai_summary  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vehicle_docs_vehicle ON vehicle_documents(vehicle_id);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS voice_summary TEXT;
ALTER TABLE vehicle_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vehicle_docs_org" ON vehicle_documents FOR ALL USING (user_id = auth.uid());
