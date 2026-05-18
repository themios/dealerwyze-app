-- Per-org photo library for content reel backgrounds.
-- Dealers upload photos; the render system picks from this pool.
-- Tags allow theme-matching (exterior, interior, financing, team, lot, etc.)

create table if not exists org_brand_photos (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  url         text not null,
  filename    text not null,
  tags        text[] not null default '{}',
  active      boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create index org_brand_photos_org_idx        on org_brand_photos (org_id);
create index org_brand_photos_org_active_idx on org_brand_photos (org_id, active);

alter table org_brand_photos enable row level security;

create policy "org members can select own photos"
  on org_brand_photos for select
  using (org_id = (select get_org_id()));

create policy "org members can insert own photos"
  on org_brand_photos for insert
  with check (org_id = (select get_org_id()));

create policy "org members can update own photos"
  on org_brand_photos for update
  using (org_id = (select get_org_id()))
  with check (org_id = (select get_org_id()));

create policy "org members can delete own photos"
  on org_brand_photos for delete
  using (org_id = (select get_org_id()));
