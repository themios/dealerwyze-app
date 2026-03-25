-- Add acquisition / buy sheet fields to vehicles
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS acquisition_source TEXT,   -- 'auction', 'private', 'trade_in', 'dealer_trade', 'other'
  ADD COLUMN IF NOT EXISTS auction_name       TEXT,
  ADD COLUMN IF NOT EXISTS auction_lot        TEXT,
  ADD COLUMN IF NOT EXISTS floor_plan_amount  NUMERIC(10,2) CHECK (floor_plan_amount >= 0),
  ADD COLUMN IF NOT EXISTS acquisition_notes  TEXT;
