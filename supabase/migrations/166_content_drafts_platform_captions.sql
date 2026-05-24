-- Add platform_captions to content_drafts so agent-written captions are stored
-- alongside the slide structure. Shape: { instagram: "...", linkedin: "...", threads: "...", tiktok: "..." }

alter table content_drafts
  add column if not exists platform_captions jsonb not null default '{}';
