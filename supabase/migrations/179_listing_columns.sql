-- 179_listing_columns.sql
-- Phase 1B: Extend vehicles table with RE-specific columns (Option A fast path).
-- Table name stays "vehicles"; UI labels it "Listings" for RE orgs via vertical config.
-- Also extends customers with buyer criteria fields for RE.
-- Tim applies this manually in Supabase SQL editor.

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS property_type       TEXT,           -- 'single_family','condo','townhouse','multi_family','land','commercial'
  ADD COLUMN IF NOT EXISTS bedrooms            SMALLINT,
  ADD COLUMN IF NOT EXISTS bathrooms           DECIMAL(3,1),
  ADD COLUMN IF NOT EXISTS sqft                INTEGER,
  ADD COLUMN IF NOT EXISTS lot_size            TEXT,           -- "0.25 acres" or sqft string
  ADD COLUMN IF NOT EXISTS year_built          SMALLINT,
  ADD COLUMN IF NOT EXISTS address_line1       TEXT,
  ADD COLUMN IF NOT EXISTS city                TEXT,
  ADD COLUMN IF NOT EXISTS state               TEXT,
  ADD COLUMN IF NOT EXISTS zip                 TEXT,
  ADD COLUMN IF NOT EXISTS school_district     TEXT,
  ADD COLUMN IF NOT EXISTS subdivision         TEXT,
  ADD COLUMN IF NOT EXISTS mls_number          TEXT,
  ADD COLUMN IF NOT EXISTS parcel_id           TEXT,
  ADD COLUMN IF NOT EXISTS listing_type        TEXT DEFAULT 'sale',  -- 'sale','rental','lease'
  ADD COLUMN IF NOT EXISTS expiration_date     DATE,
  ADD COLUMN IF NOT EXISTS showing_instructions TEXT,
  ADD COLUMN IF NOT EXISTS idx_source          TEXT DEFAULT 'manual',  -- 'manual','idx_broker','reso'
  ADD COLUMN IF NOT EXISTS idx_external_id     TEXT,
  ADD COLUMN IF NOT EXISTS idx_synced_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS seller_contact_id   UUID REFERENCES customers(id),
  ADD COLUMN IF NOT EXISTS listing_agent_id    UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS commission_pct      DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS co_broke_pct        DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS hoa_monthly         DECIMAL(10,2);

-- customers table uses user_id for org scoping (no org_id column).
-- These buyer criteria columns inherit the same scoping pattern.
-- NEVER add org_id to customers or its queries.
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS contact_type          TEXT DEFAULT 'buyer',  -- 'buyer','seller','tenant','landlord','investor','both'
  ADD COLUMN IF NOT EXISTS pre_approval_amt      DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS pre_approval_lender   TEXT,
  ADD COLUMN IF NOT EXISTS pre_approval_exp      DATE,
  ADD COLUMN IF NOT EXISTS price_min             DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS price_max             DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS beds_min              SMALLINT,
  ADD COLUMN IF NOT EXISTS baths_min             DECIMAL(3,1),
  ADD COLUMN IF NOT EXISTS desired_areas         TEXT[],
  ADD COLUMN IF NOT EXISTS buyer_agreement_at    TIMESTAMPTZ;  -- NAR 2024 buyer representation requirement
