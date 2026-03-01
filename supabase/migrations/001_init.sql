-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Customers table
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  primary_phone TEXT NOT NULL,
  secondary_phone TEXT,
  email TEXT,
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vehicles table
CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stock_no TEXT NOT NULL,
  vin TEXT,
  year INTEGER NOT NULL,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  trim TEXT,
  color TEXT,
  mileage INTEGER,
  price DECIMAL(10, 2),
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'pending', 'sold')),
  notes TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Customer-Vehicle interest tracking
CREATE TABLE IF NOT EXISTS customer_vehicles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  interest_level TEXT NOT NULL DEFAULT 'warm' CHECK (interest_level IN ('hot', 'warm', 'cold')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(customer_id, vehicle_id)
);

-- Unified activities table
CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('call', 'sms', 'email', 'note', 'task', 'appointment')),
  direction TEXT CHECK (direction IN ('inbound', 'outbound')),
  outcome TEXT CHECK (outcome IN ('answered', 'no_answer', 'left_vm', 'pending')),
  body TEXT,
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  snoozed_until TIMESTAMPTZ,
  duration_seconds INTEGER,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('high', 'normal', 'low')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SMS/Email templates
CREATE TABLE IF NOT EXISTS templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('sms', 'email')),
  body TEXT NOT NULL,
  variables TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Full-text search indexes
CREATE INDEX IF NOT EXISTS customers_fts ON customers
  USING gin(to_tsvector('english', name || ' ' || primary_phone));
CREATE INDEX IF NOT EXISTS vehicles_fts ON vehicles
  USING gin(to_tsvector('english', stock_no || ' ' || make || ' ' || model));
CREATE INDEX IF NOT EXISTS activities_user_idx ON activities(user_id, completed_at, due_at);
CREATE INDEX IF NOT EXISTS activities_customer_idx ON activities(customer_id, created_at DESC);

-- Row Level Security
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies (user_id = auth.uid())
CREATE POLICY "users_own_customers" ON customers FOR ALL USING (user_id = auth.uid());
CREATE POLICY "users_own_vehicles" ON vehicles FOR ALL USING (user_id = auth.uid());
CREATE POLICY "users_own_activities" ON activities FOR ALL USING (user_id = auth.uid());
CREATE POLICY "users_own_templates" ON templates FOR ALL USING (user_id = auth.uid());
CREATE POLICY "users_own_customer_vehicles" ON customer_vehicles FOR ALL
  USING (EXISTS (SELECT 1 FROM customers c WHERE c.id = customer_id AND c.user_id = auth.uid()));

-- Seed 8 SMS templates (will be inserted per-user after first login)
-- These are inserted via app logic on first login
