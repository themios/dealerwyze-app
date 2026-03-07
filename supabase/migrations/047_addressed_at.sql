-- When a user opens the customer from a Today card, we set addressed_at so the card
-- is hidden until the next calendar day or the activity's follow-up due date.
ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS addressed_at TIMESTAMPTZ;

COMMENT ON COLUMN activities.addressed_at IS
  'Set when user opened this activity from Today (view customer). Card is hidden until next day or due_at if scheduled.';
