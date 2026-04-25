CREATE INDEX IF NOT EXISTS idx_activities_user_created
  ON activities(user_id, created_at DESC);
