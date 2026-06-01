create table if not exists platform_notification_config (
  id                         uuid primary key default gen_random_uuid(),
  owner_email                text,
  telegram_chat_id           text,
  alert_on_signup            boolean not null default true,
  alert_on_cancellation      boolean not null default true,
  alert_on_payment_failure   boolean not null default true,
  alert_on_connector_failure boolean not null default true,
  daily_digest_enabled       boolean not null default true,
  daily_digest_hour_utc      int  not null default 16,
  weekly_briefing_enabled    boolean not null default true,
  weekly_briefing_day        int  not null default 1,
  updated_at                 timestamptz not null default now(),
  updated_by                 uuid references profiles(id) on delete set null
);
DO $$
BEGIN
  -- Insert default platform_notification_config config if not exists
insert into platform_notification_config (id) values (gen_random_uuid());
EXCEPTION WHEN unique_violation THEN NULL;
END $$;
