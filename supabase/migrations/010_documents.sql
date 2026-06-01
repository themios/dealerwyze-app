-- Customer documents table
CREATE TABLE IF NOT EXISTS customer_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label TEXT NOT NULL,           -- e.g. "Driver's License", "Insurance Card", "Other"
  file_name TEXT NOT NULL,       -- original filename
  file_key TEXT NOT NULL,        -- Supabase Storage path
  file_size INTEGER,             -- bytes
  mime_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_documents_customer_idx ON customer_documents(customer_id);
CREATE INDEX IF NOT EXISTS customer_documents_user_idx ON customer_documents(user_id);

-- Row Level Security
ALTER TABLE customer_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own org documents" ON customer_documents;
CREATE POLICY "Users can manage own org documents"
ON customer_documents
FOR ALL
USING (user_id = (
  SELECT org_id FROM profiles WHERE id = auth.uid()
))
WITH CHECK (user_id = (
  SELECT org_id FROM profiles WHERE id = auth.uid()
));
