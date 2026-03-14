-- Per-customer automation override
-- NULL = inherit org-level automation_mode
-- Set to 'manual', 'semi_auto', or 'full_auto' to override for this customer only
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS automation_override TEXT
    CHECK (automation_override IN ('manual', 'semi_auto', 'full_auto'));
