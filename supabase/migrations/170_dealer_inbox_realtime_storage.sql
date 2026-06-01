-- Migration 170: Fix Supabase Realtime delivery for platform staff and
-- fix signed URL generation for dealer-attachments storage bucket.

-- ── Storage policy ────────────────────────────────────────────────────────────
-- Allow authenticated users to call createSignedUrl() on the dealer-attachments
-- bucket. The bucket remains private — unsigned direct access still requires
-- service role. Signed URLs are time-limited (1 hour) and are the only client path.
DROP POLICY IF EXISTS "dealer_attachments_authenticated_read" ON storage.objects;
CREATE POLICY "dealer_attachments_authenticated_read" ON storage.objects FOR SELECT
USING (
  bucket_id = 'dealer-attachments'
  AND auth.role() = 'authenticated'
);

-- ── Realtime SELECT policies ──────────────────────────────────────────────────
-- Supabase Realtime filters postgres_changes events through RLS. Platform staff
-- use createServiceClient() for all data fetches (bypassing RLS), but the
-- Realtime subscription runs under the authenticated JWT, so a SELECT policy
-- is required for events to be delivered to platform staff clients.

DROP POLICY IF EXISTS dealer_messages_platform_select ON dealer_messages;
CREATE POLICY dealer_messages_platform_select ON dealer_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND platform_role IS NOT NULL
    )
    OR EXISTS (
      SELECT 1 FROM platform_superusers
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS dealer_threads_platform_select ON dealer_threads;
CREATE POLICY dealer_threads_platform_select ON dealer_threads
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND platform_role IS NOT NULL
    )
    OR EXISTS (
      SELECT 1 FROM platform_superusers
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS dealer_tasks_platform_select ON dealer_tasks;
CREATE POLICY dealer_tasks_platform_select ON dealer_tasks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND platform_role IS NOT NULL
    )
    OR EXISTS (
      SELECT 1 FROM platform_superusers
      WHERE user_id = auth.uid()
    )
  );
