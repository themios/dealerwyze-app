-- Link documents to deal checklist items with extracted data
create table if not exists checklist_documents (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  org_id uuid not null references organizations(id),
  file_name text not null,
  file_path text not null,
  mime_type text not null,

  -- Extracted data (user-verified)
  extracted_data jsonb, -- { first_name, last_name, address, city, state, zip, id_number, date_of_birth, etc }
  extracted_confidence text, -- 'high', 'medium', 'low'
  verified boolean default false,
  verified_by uuid references profiles(id),
  verified_at timestamp,
  verification_notes text,

  created_at timestamp default now(),
  updated_at timestamp default now(),
  created_by uuid references profiles(id)
);

-- Index for finding documents by checklist task
create index idx_checklist_documents_task on checklist_documents(task_id);

-- Index for finding unverified documents
create index idx_checklist_documents_unverified on checklist_documents(task_id, verified);

-- RLS: Org-scoped access
alter table checklist_documents enable row level security;

create policy "allow_org_checklist_documents" on checklist_documents
  for select
  using (org_id = (select org_id from tasks where id = task_id limit 1));

create policy "allow_org_checklist_documents_insert" on checklist_documents
  for insert
  with check (org_id = (select org_id from tasks where id = task_id limit 1));

create policy "allow_org_checklist_documents_update" on checklist_documents
  for update
  using (org_id = (select org_id from tasks where id = task_id limit 1));

