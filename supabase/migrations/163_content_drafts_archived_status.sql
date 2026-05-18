-- Add 'archived' status for posted/completed content that should be off the main board.
alter table content_drafts
  drop constraint if exists content_drafts_status_check,
  add constraint content_drafts_status_check
    check (status in ('pending', 'approved', 'rejected', 'rendered', 'archived'));
