-- AI Dealer Intelligence: briefings cache + dealer goals

CREATE TABLE IF NOT EXISTS briefings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  for_date DATE NOT NULL,
  report_type TEXT NOT NULL DEFAULT 'daily' CHECK (report_type IN ('daily', 'weekly', 'monthly', 'annual')),
  payload_json JSONB NOT NULL,
  report_json JSONB NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  tokens_used INTEGER,
  UNIQUE(org_id, for_date, report_type)
);

ALTER TABLE briefings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_briefings" ON briefings;
CREATE POLICY "users_own_briefings" ON briefings
  FOR ALL USING (org_id = auth.uid());

CREATE INDEX IF NOT EXISTS briefings_org_date ON briefings(org_id, for_date DESC);

-- Dealer goals (stored in DB, AI reports against them)
CREATE TABLE IF NOT EXISTS dealer_goals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period TEXT NOT NULL CHECK (period IN ('today', 'weekly', 'monthly', 'annual')),
  metric TEXT NOT NULL,
  target TEXT NOT NULL,
  why TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, period, metric)
);

ALTER TABLE dealer_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_goals" ON dealer_goals;
CREATE POLICY "users_own_goals" ON dealer_goals
  FOR ALL USING (org_id = auth.uid());

-- Seed default goals for existing users (they can customize later)
INSERT INTO dealer_goals (org_id, period, metric, target, why, sort_order)
SELECT
  u.id,
  g.period,
  g.metric,
  g.target,
  g.why,
  g.sort_order
FROM auth.users u
CROSS JOIN (VALUES
  ('today', 'leads_responded', '100%', 'Every lead responded within 5 minutes', 1),
  ('today', 'tasks_completed', '90%', 'Maintain discipline and follow-through', 2),
  ('weekly', 'appointments_set', '10', 'Pipeline health depends on booked appointments', 1),
  ('weekly', 'inventory_turn_days', '30', 'Units sitting >30 days erode gross', 2),
  ('monthly', 'units_sold', '15', 'Revenue target at current avg gross', 1),
  ('monthly', 'avg_gross_per_unit', '$1,800', 'Maintain margin discipline', 2),
  ('annual', 'units_sold', '150', '12–15 units/month annualized', 1),
  ('annual', 'revenue', '$300,000', 'Gross revenue target', 2)
) AS g(period, metric, target, why, sort_order)
ON CONFLICT (org_id, period, metric) DO NOTHING;
