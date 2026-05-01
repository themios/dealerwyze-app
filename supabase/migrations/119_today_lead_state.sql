ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS today_section_override TEXT
    CHECK (today_section_override IN ('replied', 'human_now', 'ai_handling', 'follow_up_later', 'low_roi')),
  ADD COLUMN IF NOT EXISTS today_park_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_activities_today_section_override
  ON public.activities (user_id, today_section_override)
  WHERE today_section_override IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activities_today_park_until
  ON public.activities (user_id, today_park_until)
  WHERE today_park_until IS NOT NULL;
