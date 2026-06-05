-- Property Documents table for RealtyWyze feature (Sprint 2)
-- Stores inspection reports, appraisals, disclosures with auto-generated summaries

create table property_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  property_id uuid references properties(id) on delete set null,
  file_path text not null,
  file_name text not null,
  mime_type text,
  summary text,
  extracted_fields jsonb,
  doc_type text,
  uploaded_by uuid references profiles(id),
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- Indexes
create index idx_property_documents_org_id on property_documents(org_id);
create index idx_property_documents_property_id on property_documents(property_id);
create index idx_property_documents_created_at on property_documents(created_at desc);

-- RLS: Users can only see documents from their org
alter table property_documents enable row level security;

create policy "select_own_org" on property_documents
  for select using (org_id = (select org_id from profiles where id = auth.uid()));

create policy "insert_own_org" on property_documents
  for insert with check (org_id = (select org_id from profiles where id = auth.uid()));

create policy "delete_own_org" on property_documents
  for delete using (org_id = (select org_id from profiles where id = auth.uid()));

comment on table property_documents is 'Property inspection, appraisal, and disclosure documents with AI-generated summaries';
comment on column property_documents.doc_type is 'inspection|appraisal|disclosure|other';
comment on column property_documents.extracted_fields is 'Structured data extracted via vision analysis';
