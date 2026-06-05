-- Property Pricing Analysis table for RealtyWyze feature (Sprint 4)
-- Stores CMA (Comparative Market Analysis) and pricing recommendations

create table property_pricing_analysis (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  listing_id uuid references listings(id) on delete set null,
  analysis_json jsonb not null,
  aggressive_price numeric,
  suggested_price numeric,
  premium_price numeric,
  confidence text,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- Indexes
create index idx_property_pricing_analysis_org_id on property_pricing_analysis(org_id);
create index idx_property_pricing_analysis_listing_id on property_pricing_analysis(listing_id);
create index idx_property_pricing_analysis_created_at on property_pricing_analysis(created_at desc);

-- RLS: Users can only see analyses from their org
alter table property_pricing_analysis enable row level security;

create policy "select_own_org" on property_pricing_analysis
  for select using (org_id = (select org_id from profiles where id = auth.uid()));

create policy "insert_own_org" on property_pricing_analysis
  for insert with check (org_id = (select org_id from profiles where id = auth.uid()));

comment on table property_pricing_analysis is 'CMA pricing analysis with 3-tier pricing recommendations and market insights';
comment on column property_pricing_analysis.analysis_json is 'Full REMarketIntelligence object from lib/pricing/reListingPricing.ts';
comment on column property_pricing_analysis.confidence is 'high|medium|low|insufficient based on comparable sales availability';
