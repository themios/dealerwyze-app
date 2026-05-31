-- Add language_preference column to profiles table
-- Supports both dealer (DealerWyze) and real estate (RealtyWyze) use cases

ALTER TABLE profiles
ADD COLUMN language_preference text DEFAULT 'en' CHECK (language_preference IN ('en', 'es'));

-- Create index for language filtering (useful for analytics/targeting)
CREATE INDEX IF NOT EXISTS idx_profiles_language_preference ON profiles(language_preference);

-- Set NOT NULL after adding default to existing rows
ALTER TABLE profiles
ALTER COLUMN language_preference SET NOT NULL;
