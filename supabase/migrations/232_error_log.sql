-- Error logging table for capturing and tracking application errors
create table if not exists error_log (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  stack_trace text,
  context jsonb,
  severity text not null default 'error', -- 'error', 'warning', 'critical'
  org_id uuid references organizations(id),
  user_id uuid references profiles(id),
  url text,
  digest text, -- Next.js error digest for deduplication
  resolved boolean default false,
  resolved_at timestamp,
  resolved_by uuid references profiles(id),
  notes text,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- Index for finding unresolved errors
create index idx_error_log_unresolved on error_log(resolved, created_at desc);

-- Index for finding errors by org
create index idx_error_log_org on error_log(org_id, created_at desc);

-- Index for deduplication by digest
create index idx_error_log_digest on error_log(digest, created_at desc);

-- RLS: Only admins and the platform owner can view error logs
alter table error_log enable row level security;

create policy "allow_platform_admins_error_log" on error_log
  for select
  using (
    exists(
      select 1 from platform_superusers
      where user_id = auth.uid()
    )
  );

-- Allow service role full access for logging (used from server-side functions)
-- Service role bypasses RLS, so no explicit policy needed

-- Create trigger function for updated_at
create or replace function update_error_log_updated_at()
  returns trigger as $$
  begin
    new.updated_at = now();
    return new;
  end;
  $$ language plpgsql;

-- Trigger to track updates
create trigger error_log_updated_at
  before update on error_log
  for each row
  execute function update_error_log_updated_at();
