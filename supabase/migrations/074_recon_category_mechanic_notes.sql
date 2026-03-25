-- Migration 074: Recon category classification + mechanic notes worksheet
-- Apply in Supabase SQL editor

-- 1. Add category column to recon_checklist_items
ALTER TABLE recon_checklist_items
  ADD COLUMN IF NOT EXISTS category text
  CHECK (category IN ('mandatory', 'value_add', 'standard'))
  DEFAULT 'standard';

-- 2. Backfill category from label keywords
UPDATE recon_checklist_items SET category = 'mandatory'
WHERE LOWER(label) LIKE '%brake%'
   OR LOWER(label) LIKE '%tire%'
   OR LOWER(label) LIKE '%smog%'
   OR LOWER(label) LIKE '%emission%'
   OR LOWER(label) LIKE '%safety%';

UPDATE recon_checklist_items SET category = 'value_add'
WHERE LOWER(label) LIKE '%paint%'
   OR LOWER(label) LIKE '%body%'
   OR LOWER(label) LIKE '%detail%'
   OR LOWER(label) LIKE '%wash%';

-- 3. Add mechanic_notes JSONB to vehicles (stores worksheet data)
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS mechanic_notes jsonb;
