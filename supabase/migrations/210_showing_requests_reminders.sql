-- Add reminder_sent_at to showing_requests for idempotent reminder handling
ALTER TABLE showing_requests ADD COLUMN reminder_sent_at TIMESTAMPTZ;

-- Index for efficient reminder query
CREATE INDEX IF NOT EXISTS idx_showing_requests_reminder_sent ON showing_requests(reminder_sent_at);
CREATE INDEX IF NOT EXISTS idx_showing_requests_confirmed_time ON showing_requests(confirmed_time);
