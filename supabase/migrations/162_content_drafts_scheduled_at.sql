alter table content_drafts add column if not exists scheduled_at timestamptz;

create index if not exists content_drafts_org_scheduled_idx
  on content_drafts (org_id, scheduled_at)
  where scheduled_at is not null;
