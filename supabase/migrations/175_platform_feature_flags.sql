create table if not exists platform_feature_flags (
  flag_key           text not null,
  vertical           text not null default 'dealer',
  display_name       text not null,
  description        text,
  enabled_globally   boolean not null default false,
  enabled_for_plans  text[] not null default '{}',
  updated_at         timestamptz not null default now(),
  primary key (flag_key, vertical)
);

DO $$
BEGIN
  INSERT INTO platform_feature_flags
    (flag_key, vertical, display_name, description, enabled_globally, enabled_for_plans)
  VALUES
    ('bhph',            'dealer', 'BHPH Payment Tracking','Buy-here-pay-here ledger',     true,  '{growth,pro}'),
    ('ai_voice',        'dealer', 'AI Voice Leads',        'Retell AI call answering',     false, '{growth,pro}'),
    ('video_rendering', 'dealer', 'Video Rendering',       'Remotion Lambda video gen',    false, '{growth,pro}'),
    ('public_website',  'dealer', 'Public Inventory Site', 'SEO dealer inventory website', true,  '{starter,growth,pro}'),
    ('sequences',       'dealer', 'Follow-up Sequences',   'Automated outreach sequences', true,  '{growth,pro}'),
    ('want_list',       'dealer', 'Want List',             'Customer vehicle want list',   true,  '{growth,pro}'),
    ('content_pipeline','dealer', 'Content Pipeline',      'AI social content drafts',     false, '{pro}')
  ON CONFLICT (flag_key, vertical) DO NOTHING;
EXCEPTION WHEN unique_violation THEN NULL;
END $$;
