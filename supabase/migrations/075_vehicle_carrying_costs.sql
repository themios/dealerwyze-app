-- Migration 075: Flooring fee + floor plan interest on vehicles
-- Apply in Supabase SQL editor

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS flooring_fee numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS floor_plan_interest numeric(10,2) DEFAULT 0;
