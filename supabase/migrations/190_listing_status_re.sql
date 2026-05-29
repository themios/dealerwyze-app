-- 190_listing_status_re.sql
-- Phase 7: Extend vehicles status check constraint to include RE listing statuses.
-- Original dealer statuses preserved: available, pending, sold, staging, sync_removed
-- RE statuses appended: active, contingent, closed, withdrawn, expired
--
-- WARNING: Drops and recreates a check constraint on a live table.
-- Before applying to production, verify no dealer rows have status values outside the
-- original five: available, pending, sold, staging, sync_removed.
-- Safe to apply when all existing rows satisfy both the old and new constraint.

ALTER TABLE vehicles
  DROP CONSTRAINT IF EXISTS vehicles_status_check;

ALTER TABLE vehicles
  ADD CONSTRAINT vehicles_status_check
  CHECK (status IN (
    'available','pending','sold','staging','sync_removed',
    'active','contingent','closed','withdrawn','expired'
  ));
