create table platform_social_accounts (
  id                            uuid primary key default gen_random_uuid(),
  platform                      text not null
                                  check (platform in ('facebook','instagram','tiktok','youtube','linkedin','threads')),
  account_label                 text not null,
  platform_account_id           text not null,
  page_id                       text,
  instagram_business_account_id text,
  access_token                  text not null,
  refresh_token                 text,
  token_expires_at              timestamptz,
  scopes                        text[] not null default '{}',
  is_active                     boolean not null default true,
  last_used_at                  timestamptz,
  last_error                    text,
  last_error_at                 timestamptz,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  created_by                    uuid references profiles(id) on delete set null,
  unique (platform, platform_account_id)
);
