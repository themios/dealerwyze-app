-- Add invite_code to admin profiles for agent self-registration
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS invite_code text UNIQUE;

-- Generate codes for existing admin profiles
UPDATE profiles
SET invite_code = UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', ''), 1, 8))
WHERE role = 'admin' AND invite_code IS NULL;

-- Auto-generate invite_code on new admin profile insert
CREATE OR REPLACE FUNCTION generate_invite_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role = 'admin' AND NEW.invite_code IS NULL THEN
    NEW.invite_code = UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', ''), 1, 8));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS set_invite_code ON profiles;
CREATE TRIGGER set_invite_code
BEFORE INSERT ON profiles
FOR EACH ROW EXECUTE FUNCTION generate_invite_code();
