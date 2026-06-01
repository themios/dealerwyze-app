create table if not exists platform_settings (
  id                 uuid primary key default gen_random_uuid(),
  platform_name      text not null default 'DealerWyze',
  support_email      text not null default 'support@dealerwyze.com',
  support_phone      text,
  help_url           text,
  terms_url          text,
  privacy_url        text,
  default_trial_days int  not null default 30,
  default_timezone   text not null default 'America/Los_Angeles',
  marketing_org_id   uuid references organizations(id) on delete set null,
  updated_at         timestamptz not null default now(),
  updated_by         uuid references profiles(id) on delete set null
);

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM platform_settings) = 0 THEN
    INSERT INTO platform_settings (id) VALUES (gen_random_uuid());
  END IF;
END $$;
