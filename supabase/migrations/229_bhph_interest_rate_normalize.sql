-- Normalize legacy rows that stored APR as whole percent (23.99) instead of decimal (0.2399).

UPDATE public.bhph_payments
SET interest_rate = ROUND((interest_rate / 100)::NUMERIC, 4)
WHERE interest_rate > 1;
