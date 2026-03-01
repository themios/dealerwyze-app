-- 032_performance_indexes.sql
-- Performance indexes covering cron job bottlenecks and analytics queries.
-- All CONCURRENTLY to avoid locking production tables during apply.

-- Job 3 (check-tasks): dormant detection — scans active customers for inactivity
CREATE INDEX IF NOT EXISTS idx_customers_active_scan
  ON customers(user_id, last_inbound_at, last_outbound_at, created_at)
  WHERE thread_state NOT IN ('sold', 'lost', 'dormant');

-- NOTE: idx_customers_response (same definition) is created by 029_response_tracking.sql
-- No duplicate needed here.

-- Analytics: voice_calls by org + date range (analytics dashboard + cron)
CREATE INDEX IF NOT EXISTS idx_voice_calls_org_time
  ON voice_calls(org_id, created_at DESC);

-- Job 5 (check-tasks): appointment reminder scan
CREATE INDEX IF NOT EXISTS idx_activities_appt_reminder
  ON activities(user_id, type, due_at, reminder_sent_at)
  WHERE type = 'appointment' AND reminder_sent_at IS NULL;

-- Task dedup lookups — Jobs 1, 2, 6 all use (linked_*_id + task_type + status='open')
CREATE INDEX IF NOT EXISTS idx_tasks_dedup
  ON tasks(linked_customer_id, task_type, status)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_tasks_receipt_dedup
  ON tasks(linked_receipt_id, task_type, status)
  WHERE status = 'open';

-- Receipts draft scan (Job 1)
CREATE INDEX IF NOT EXISTS idx_receipts_draft_scan
  ON receipts(user_id, status, created_at)
  WHERE status = 'draft_ready';

-- GBP reviews lookup (poll-reviews cron + today page)
CREATE INDEX IF NOT EXISTS idx_gbp_reviews_org_time
  ON gbp_reviews(org_id, create_time DESC);

-- Vehicles feed query (inventory feed routes)
CREATE INDEX IF NOT EXISTS idx_vehicles_available
  ON vehicles(user_id, status, created_at DESC)
  WHERE status = 'available';
