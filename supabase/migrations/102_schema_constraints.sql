-- Migration 102: Missing indexes, CASCADE fixes, CHECK constraints

-- Missing composite indexes
CREATE INDEX IF NOT EXISTS idx_cseq_customer_status
  ON customer_sequences(customer_id, status);

CREATE INDEX IF NOT EXISTS idx_activities_customer_type
  ON activities(customer_id, type);

CREATE INDEX IF NOT EXISTS idx_tasks_vehicle_type_status
  ON tasks(linked_vehicle_id, task_type, status)
  WHERE linked_vehicle_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bhph_payments_customer_date
  ON bhph_payments(customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_video_renders_org_status
  ON video_renders(org_id, status);

CREATE INDEX IF NOT EXISTS idx_pulse_surveys_customer_date
  ON pulse_surveys(customer_id, created_at DESC);

-- Fix CASCADE gaps (customer deletes currently blocked by RESTRICT default)
ALTER TABLE bhph_payments
  DROP CONSTRAINT IF EXISTS bhph_payments_customer_id_fkey,
  ADD CONSTRAINT bhph_payments_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;

ALTER TABLE vehicles
  DROP CONSTRAINT IF EXISTS vehicles_sold_to_customer_id_fkey,
  ADD CONSTRAINT vehicles_sold_to_customer_id_fkey
    FOREIGN KEY (sold_to_customer_id) REFERENCES customers(id) ON DELETE SET NULL;

ALTER TABLE payment_reminder_log
  DROP CONSTRAINT IF EXISTS payment_reminder_log_customer_id_fkey,
  ADD CONSTRAINT payment_reminder_log_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;

-- Fix stale activities.type CHECK (add fax, sequence, voicemail types)
ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_type_check;
ALTER TABLE activities ADD CONSTRAINT activities_type_check
  CHECK (type IN ('call','sms','email','note','task','appointment','fax','sequence','voicemail'));

-- Add missing CHECK on organizations.plan
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS chk_organizations_plan;
ALTER TABLE organizations ADD CONSTRAINT chk_organizations_plan
  CHECK (plan IN ('trial','starter','growth','pro','active','canceled','paused'));
