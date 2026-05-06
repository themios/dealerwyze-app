-- Public read bucket for dealer website logos (uploaded via API using service role).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'dealer-branding',
  'dealer-branding',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "dealer_branding_select_public" ON storage.objects;
CREATE POLICY "dealer_branding_select_public"
ON storage.objects FOR SELECT
USING (bucket_id = 'dealer-branding');
