-- Allow 'cancelled' as a valid video_renders status
-- Drop existing check constraint (if any) and recreate with cancelled included
DO $$
BEGIN
  -- Drop constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'video_renders_status_check'
    AND conrelid = 'video_renders'::regclass
  ) THEN
    ALTER TABLE video_renders DROP CONSTRAINT video_renders_status_check;
  END IF;

  -- Recreate with cancelled included
  ALTER TABLE video_renders
    ADD CONSTRAINT video_renders_status_check
    CHECK (status IN ('queued', 'rendering', 'complete', 'failed', 'cancelled'));
END $$;
