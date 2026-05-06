-- Allow 'carousel' as a valid placement in social_publish_log.
-- Migration 133 constrained placement to ('feed','story') before carousel posting was built.

ALTER TABLE public.social_publish_log
  DROP CONSTRAINT IF EXISTS social_publish_log_placement_check;

ALTER TABLE public.social_publish_log
  ADD CONSTRAINT social_publish_log_placement_check
    CHECK (placement IN ('feed', 'story', 'carousel'));
