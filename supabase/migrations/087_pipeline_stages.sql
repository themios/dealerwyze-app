-- 087_pipeline_stages.sql
-- Per-org customizable pipeline stages: rename, reorder, 5 custom placeholders

CREATE TABLE IF NOT EXISTS org_pipeline_stages (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  stage_key  TEXT        NOT NULL,
  label      TEXT        NOT NULL,
  color      TEXT        NOT NULL DEFAULT 'bg-gray-100 text-gray-700',
  position   INT         NOT NULL DEFAULT 0,
  is_hot     BOOL        NOT NULL DEFAULT false,
  is_active  BOOL        NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, stage_key)
);

ALTER TABLE org_pipeline_stages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pipeline_stages_select" ON org_pipeline_stages;
CREATE POLICY "pipeline_stages_select" ON org_pipeline_stages
  FOR SELECT USING (org_id = get_org_id());
DROP POLICY IF EXISTS "pipeline_stages_insert" ON org_pipeline_stages;
CREATE POLICY "pipeline_stages_insert" ON org_pipeline_stages
  FOR INSERT WITH CHECK (org_id = get_org_id());
DROP POLICY IF EXISTS "pipeline_stages_update" ON org_pipeline_stages;
CREATE POLICY "pipeline_stages_update" ON org_pipeline_stages
  FOR UPDATE USING (org_id = get_org_id());

-- Add custom_1..5 to the thread_state check constraint
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_thread_state_check;
ALTER TABLE customers
  ADD CONSTRAINT customers_thread_state_check
  CHECK (thread_state IN (
    'new_lead','contacted','engaged','appointment_set',
    'appointment_confirmed','showed','credit_app','sold','lost','dormant',
    'custom_1','custom_2','custom_3','custom_4','custom_5'
  ));

-- Seed default stages for all existing orgs
INSERT INTO org_pipeline_stages (org_id, stage_key, label, color, position, is_hot, is_active)
SELECT o.id, s.stage_key, s.label, s.color, s.position, s.is_hot, s.is_active
FROM organizations o
CROSS JOIN (VALUES
  ('new_lead',              'New Lead',     'bg-blue-100 text-blue-700',    0,  false, true),
  ('contacted',             'Contacted',    'bg-yellow-100 text-yellow-700',1,  false, true),
  ('engaged',               'Interested',   'bg-orange-100 text-orange-700',2,  false, true),
  ('appointment_set',       'Appt Set',     'bg-purple-100 text-purple-700',3,  false, true),
  ('appointment_confirmed', 'Negotiating',  'bg-indigo-100 text-indigo-700',4,  false, true),
  ('showed',                'Showed',       'bg-cyan-100 text-cyan-700',    5,  false, true),
  ('credit_app',            'Credit App',   'bg-amber-100 text-amber-700',  6,  true,  true),
  ('sold',                  'Sold',         'bg-green-100 text-green-700',  7,  false, true),
  ('lost',                  'Lost',         'bg-red-100 text-red-700',      8,  false, true),
  ('dormant',               'Dormant',      'bg-gray-100 text-gray-500',    9,  false, true),
  ('custom_1',              'Custom 1',     'bg-pink-100 text-pink-700',    10, false, false),
  ('custom_2',              'Custom 2',     'bg-teal-100 text-teal-700',    11, false, false),
  ('custom_3',              'Custom 3',     'bg-violet-100 text-violet-700',12, false, false),
  ('custom_4',              'Custom 4',     'bg-rose-100 text-rose-700',    13, false, false),
  ('custom_5',              'Custom 5',     'bg-lime-100 text-lime-700',    14, false, false)
) AS s(stage_key, label, color, position, is_hot, is_active)
ON CONFLICT (org_id, stage_key) DO NOTHING;

-- Simplify advance_lead_state: remove forward-only enforcement (org order is now dynamic)
-- Just performs the update; order validation happens at API level if needed
CREATE OR REPLACE FUNCTION advance_lead_state(
  p_customer_id UUID,
  p_new_state   TEXT,
  p_reason      TEXT DEFAULT NULL
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE customers
  SET
    thread_state          = p_new_state,
    lead_state_changed_at = NOW(),
    lead_state_reason     = p_reason
  WHERE id = p_customer_id;
  RETURN TRUE;
END;
$$;
