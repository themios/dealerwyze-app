create table platform_feature_flags (
  id                uuid primary key default gen_random_uuid(),
  flag_key          text not null unique,
  display_name      text not null,
  description       text,
  enabled_globally  boolean not null default false,
  enabled_for_plans text[] not null default '{}',
  enabled_for_orgs  uuid[] not null default '{}',
  kill_switch       boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references profiles(id) on delete set null
);
insert into platform_feature_flags
  (flag_key, display_name, description, enabled_globally, enabled_for_plans)
values
  ('bhph',            'BHPH Payment Tracking','Buy-here-pay-here ledger',     true,  '{growth,pro}'),
  ('ai_voice',        'AI Voice Leads',        'Retell AI call answering',     false, '{growth,pro}'),
  ('video_rendering', 'Video Rendering',       'Remotion Lambda video gen',    false, '{growth,pro}'),
  ('public_website',  'Public Inventory Site', 'SEO dealer inventory website', true,  '{starter,growth,pro}'),
  ('sequences',       'Follow-up Sequences',   'Automated outreach sequences', true,  '{growth,pro}'),
  ('want_list',       'Want List',             'Customer vehicle want list',   true,  '{growth,pro}'),
  ('content_pipeline','Content Pipeline',      'AI social content drafts',     false, '{pro}');
