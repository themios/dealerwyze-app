-- AI-generated content scripts awaiting dealer review before rendering.
-- Batch generation produces many drafts; dealer approves, edits, or rejects each.
-- Approved drafts flow into content_renders automatically.

create table if not exists content_drafts (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id) on delete cascade,
  status           text not null default 'pending'
                     check (status in ('pending', 'approved', 'rejected', 'rendered')),
  topic            text not null,
  tagline          text,
  slides           jsonb not null default '[]',
  cta_text         text not null,
  content_theme    text,                           -- which theme pillar generated this
  platform_targets text[] not null default '{}',  -- intended platforms
  background_tags  text[] not null default '{}',  -- hint for photo library picker
  render_id        uuid references content_renders(id) on delete set null,
  approved_by      uuid references auth.users(id) on delete set null,
  approved_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index content_drafts_org_status_idx on content_drafts (org_id, status);
create index content_drafts_org_created_idx on content_drafts (org_id, created_at desc);

alter table content_drafts enable row level security;

create policy "org members can select own drafts"
  on content_drafts for select
  using (org_id = (select get_org_id()));

create policy "org members can insert own drafts"
  on content_drafts for insert
  with check (org_id = (select get_org_id()));

create policy "org members can update own drafts"
  on content_drafts for update
  using (org_id = (select get_org_id()))
  with check (org_id = (select get_org_id()));

create policy "org members can delete own drafts"
  on content_drafts for delete
  using (org_id = (select get_org_id()));
