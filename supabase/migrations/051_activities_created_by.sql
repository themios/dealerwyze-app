-- Track who created each activity so notes can be edited by creator or admin
ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN activities.created_by IS 'Auth user id of the person who created this activity; used for note edit permission (creator or org admin).';

CREATE OR REPLACE FUNCTION public.set_activity_created_by()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.created_by IS NULL AND auth.uid() IS NOT NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_activities_created_by ON activities;
CREATE TRIGGER trg_activities_created_by
  BEFORE INSERT ON activities
  FOR EACH ROW EXECUTE FUNCTION public.set_activity_created_by();
