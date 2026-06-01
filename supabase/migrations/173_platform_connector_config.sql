create table if not exists platform_connector_config (
  id                uuid primary key default gen_random_uuid(),
  connector_key     text not null unique
                      check (connector_key in ('meta','tiktok','youtube','linkedin','threads')),
  display_name      text not null,
  app_id            text,
  callback_url      text,
  required_scopes   text[] not null default '{}',
  enabled           boolean not null default false,
  enabled_for_plans text[] not null default '{}',
  updated_at        timestamptz not null default now(),
  updated_by        uuid references profiles(id) on delete set null
);
DO $$
BEGIN
  -- Insert default platform_connector_config config if not exists
insert into platform_connector_config (connector_key, display_name, enabled_for_plans) values
  ('meta',     'Meta (Facebook + Instagram)', '{growth,pro}'),
  ('tiktok',   'TikTok',                      '{growth,pro}'),
  ('youtube',  'YouTube',                     '{pro}'),
  ('linkedin', 'LinkedIn',                    '{pro}'),
  ('threads',  'Threads',                     '{pro}');
EXCEPTION WHEN unique_violation THEN NULL;
END $$;
