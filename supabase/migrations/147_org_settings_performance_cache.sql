-- JSON cache for org-level performance metrics (used by intelligence timing rule).
alter table public.org_settings
  add column if not exists performance_cache jsonb default '{}'::jsonb;

comment on column public.org_settings.performance_cache is
  'Cached performance metrics (e.g. response time, ghost lead counts) for intelligence rules';
