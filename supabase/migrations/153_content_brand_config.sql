-- Per-org content branding configuration for the video content system.
-- One row per org. Stores logo, colors, CTA assets, voice, etc.
-- Replaces hard-coded brand files and enables the dealer-facing version of this feature.

create table if not exists content_brand_config (
  org_id        uuid primary key references organizations(id) on delete cascade,
  brand_name    text not null,
  brand_handle  text not null,
  accent_color  text not null default '#f97316',
  bg_color      text not null default '#0f172a',
  website       text,
  logo_url      text,
  cta_images    text[] not null default '{}',
  voice         text not null default 'en-US-Studio-O',
  watermark     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table content_brand_config enable row level security;

create policy "org members can select own brand config"
  on content_brand_config for select
  using (org_id = (select get_org_id()));

create policy "org members can insert own brand config"
  on content_brand_config for insert
  with check (org_id = (select get_org_id()));

create policy "org members can update own brand config"
  on content_brand_config for update
  using (org_id = (select get_org_id()))
  with check (org_id = (select get_org_id()));
