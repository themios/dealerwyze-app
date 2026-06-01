-- Content renders: marketing reels generated from slide-based content (not vehicle-specific)
create table if not exists content_renders (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references organizations(id) on delete cascade,
  status               text not null default 'queued'
                         check (status in ('queued', 'rendering', 'complete', 'failed', 'cancelled')),
  props_snapshot       jsonb not null,
  output_url           text,
  lambda_render_id     text,
  error_message        text,
  auto_post            boolean not null default false,
  auto_post_platforms  text[]  not null default '{}',
  post_results         jsonb,
  triggered_by_user    uuid references auth.users(id) on delete set null,
  created_at           timestamptz not null default now(),
  completed_at         timestamptz
);

create index if not exists content_renders_org_id_idx        on content_renders (org_id);
create index if not exists content_renders_lambda_render_idx on content_renders (lambda_render_id) where lambda_render_id is not null;

alter table content_renders enable row level security;

-- Org members can view, insert, and update their own renders (service role handles webhook updates)
DROP POLICY IF EXISTS "org members can select content_renders" ON content_renders;
create policy "org members can select content_renders"
  on content_renders for select
  using (org_id = (select get_org_id()));

DROP POLICY IF EXISTS "org members can insert content_renders" ON content_renders;
create policy "org members can insert content_renders"
  on content_renders for insert
  with check (org_id = (select get_org_id()));

DROP POLICY IF EXISTS "org members can update content_renders" ON content_renders;
create policy "org members can update content_renders"
  on content_renders for update
  using (org_id = (select get_org_id()));
