-- ================================================================
-- First Valley Auto Sales — Demo Dealership Setup
-- Paste entire script into Supabase SQL Editor and Run
-- ================================================================
-- Login credentials after running:
--   Email:    demo@firstvalleyauto.com
--   Password: DemoDealer2026!
-- ================================================================
-- Fixed IDs (for reference / cleanup):
--   Org ID:  a3b4c5d6-e7f8-4901-b234-567890abcdef
--   Auth ID: b4c5d6e7-f890-4123-c345-678901bcdef0
-- ================================================================
-- TO UNDO / RESET:
--   DELETE FROM activities  WHERE user_id = 'a3b4c5d6-e7f8-4901-b234-567890abcdef';
--   DELETE FROM customers   WHERE user_id = 'a3b4c5d6-e7f8-4901-b234-567890abcdef';
--   DELETE FROM vehicles    WHERE user_id = 'a3b4c5d6-e7f8-4901-b234-567890abcdef';
--   DELETE FROM profiles    WHERE id      = 'b4c5d6e7-f890-4123-c345-678901bcdef0';
--   DELETE FROM org_settings WHERE org_id = 'a3b4c5d6-e7f8-4901-b234-567890abcdef';
--   DELETE FROM auth.identities WHERE user_id = 'b4c5d6e7-f890-4123-c345-678901bcdef0';
--   DELETE FROM auth.identities WHERE user_id = 'a3b4c5d6-e7f8-4901-b234-567890abcdef';
--   DELETE FROM auth.users  WHERE id = 'b4c5d6e7-f890-4123-c345-678901bcdef0';
--   DELETE FROM auth.users  WHERE id = 'a3b4c5d6-e7f8-4901-b234-567890abcdef';
--   DELETE FROM organizations WHERE id = 'a3b4c5d6-e7f8-4901-b234-567890abcdef';
-- ================================================================

DO $$
DECLARE
  apollo_org  uuid := 'db5442d1-e92f-4eb0-8876-6adb1a9a0ccb';  -- Apollo Auto (source)
  new_org     uuid := 'a3b4c5d6-e7f8-4901-b234-567890abcdef';  -- First Valley Auto Sales
  new_auth    uuid := 'b4c5d6e7-f890-4123-c345-678901bcdef0';  -- Demo login user

  -- 20 customer UUIDs
  c01 uuid; c02 uuid; c03 uuid; c04 uuid; c05 uuid;
  c06 uuid; c07 uuid; c08 uuid; c09 uuid; c10 uuid;
  c11 uuid; c12 uuid; c13 uuid; c14 uuid; c15 uuid;
  c16 uuid; c17 uuid; c18 uuid; c19 uuid; c20 uuid;

BEGIN

  -- ── 1. Organization ─────────────────────────────────────────────────────────
  INSERT INTO organizations (id, name, slug, approved_at, subscription_status, created_at, updated_at)
  VALUES (new_org, 'First Valley Auto Sales', 'first-valley-auto-sales', now(), 'active', now(), now())
  ON CONFLICT (id) DO UPDATE SET
    approved_at = COALESCE(organizations.approved_at, now()),
    subscription_status = COALESCE(organizations.subscription_status, 'active');

  -- ── 2. Org Settings ─────────────────────────────────────────────────────────
  INSERT INTO org_settings (org_id, business_name, onboarding_completed_at)
  VALUES (new_org, 'First Valley Auto Sales', NOW())
  ON CONFLICT (org_id) DO UPDATE SET
    business_name = 'First Valley Auto Sales',
    onboarding_completed_at = COALESCE(org_settings.onboarding_completed_at, NOW());

  -- ── 3. Auth User ─────────────────────────────────────────────────────────────
  -- Safe to re-run: deletes existing before re-inserting
  DELETE FROM auth.identities WHERE user_id = new_auth;
  DELETE FROM auth.identities WHERE user_id = new_org;
  DELETE FROM auth.users      WHERE id      = new_auth;
  DELETE FROM auth.users      WHERE id      = new_org;

  -- Org service account (new_org must exist in auth.users because vehicles.user_id FK points there)
  -- This mirrors real signup where the owner's auth user ID becomes the org ID.
  INSERT INTO auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current,
    phone, phone_change, phone_change_token, reauthentication_token,
    raw_app_meta_data, raw_user_meta_data,
    is_super_admin, created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    new_org,
    'authenticated',
    'authenticated',
    'org@firstvalleyauto.internal',
    crypt(gen_random_uuid()::text, gen_salt('bf')),
    now(),
    '', '', '', '', '',
    '', '', '', '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    false,
    now(),
    now()
  );

  INSERT INTO auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current,
    phone, phone_change, phone_change_token, reauthentication_token,
    raw_app_meta_data, raw_user_meta_data,
    is_super_admin, created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    new_auth,
    'authenticated',
    'authenticated',
    'demo@firstvalleyauto.com',
    crypt('DemoDealer2026!', gen_salt('bf')),
    now(),
    '', '', '', '', '',
    '', '', '', '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    false,
    now(),
    now()
  );

  -- Note: provider_id column required in Supabase post-2024
  INSERT INTO auth.identities (
    provider_id, id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    'demo@firstvalleyauto.com',
    gen_random_uuid(),
    new_auth,
    jsonb_build_object('sub', new_auth::text, 'email', 'demo@firstvalleyauto.com'),
    'email',
    now(), now(), now()
  );

  -- ── 4. Dealer Profile ────────────────────────────────────────────────────────
  INSERT INTO profiles (id, org_id, role, display_name, created_at)
  VALUES (new_auth, new_org, 'dealer_admin', 'Alex Rivera', now())
  ON CONFLICT (id) DO NOTHING;

  -- ── 5. Copy Inventory from Apollo Auto ───────────────────────────────────────
  -- Copies all vehicles with new IDs. Resets 'sold' vehicles to 'available' so
  -- inventory looks active. Timestamps spread over last 90 days to look natural.
  -- If this fails, check column names against your vehicles table schema.
  INSERT INTO vehicles (
    user_id, stock_no, year, make, model, trim,
    mileage, price, color, status,
    photo_url, notes, listing_url,
    created_at
  )
  SELECT
    new_org,
    stock_no, year, make, model, trim,
    mileage, price, color,
    CASE WHEN status = 'sold' THEN 'available' ELSE status END,
    photo_url, notes, listing_url,
    now() - (random() * interval '90 days')
  FROM vehicles
  WHERE user_id = apollo_org;

  -- ── 6. Customers — 20 realistic LA-area leads ────────────────────────────────
  c01 := gen_random_uuid(); c02 := gen_random_uuid(); c03 := gen_random_uuid();
  c04 := gen_random_uuid(); c05 := gen_random_uuid(); c06 := gen_random_uuid();
  c07 := gen_random_uuid(); c08 := gen_random_uuid(); c09 := gen_random_uuid();
  c10 := gen_random_uuid(); c11 := gen_random_uuid(); c12 := gen_random_uuid();
  c13 := gen_random_uuid(); c14 := gen_random_uuid(); c15 := gen_random_uuid();
  c16 := gen_random_uuid(); c17 := gen_random_uuid(); c18 := gen_random_uuid();
  c19 := gen_random_uuid(); c20 := gen_random_uuid();

  INSERT INTO customers (id, user_id, name, primary_phone, email, city, state, created_at)
  VALUES
    (c01, new_org, 'Carlos Mendoza',     '2135550101', 'carlos.m@gmail.com',         'El Monte',        'CA', now()-'12 days'::interval),
    (c02, new_org, 'Jennifer Kim',       '3105550102', 'jen.kim.la@gmail.com',        'Pasadena',        'CA', now()-'8 days'::interval),
    (c03, new_org, 'Marcus Williams',    '3235550103', 'mwilliams323@gmail.com',      'Los Angeles',     'CA', now()-'5 days'::interval),
    (c04, new_org, 'Rosa Gutierrez',     '6265550104', 'rosa.gutierrez@yahoo.com',    'Covina',          'CA', now()-'3 days'::interval),
    (c05, new_org, 'David Chen',         '8185550105', 'dchen.valley@gmail.com',      'San Gabriel',     'CA', now()-'10 days'::interval),
    (c06, new_org, 'Tanya Johnson',      '4245550106', 'tanyaj424@outlook.com',       'Compton',         'CA', now()-'2 days'::interval),
    (c07, new_org, 'Miguel Santos',      '5625550107', 'miguels.auto@gmail.com',      'Whittier',        'CA', now()-'7 days'::interval),
    (c08, new_org, 'Ashley Park',        '2135550108', 'a.park213@gmail.com',         'Alhambra',        'CA', now()-'4 days'::interval),
    (c09, new_org, 'Robert Davis',       '3105550109', 'rdavis.socal@hotmail.com',    'Inglewood',       'CA', now()-'30 days'::interval),
    (c10, new_org, 'Maria Flores',       '3235550110', 'mflores.la@gmail.com',        'East Los Angeles','CA', now()-'1 day'::interval),
    (c11, new_org, 'Kevin Nguyen',       '6265550111', 'k.nguyen626@gmail.com',       'Rosemead',        'CA', now()-'6 days'::interval),
    (c12, new_org, 'Sandra Torres',      '8185550112', 'storres818@yahoo.com',        'Van Nuys',        'CA', now()-'20 days'::interval),
    (c13, new_org, 'James Robinson',     '4245550113', 'j.robinson.la@gmail.com',     'Carson',          'CA', now()-'9 days'::interval),
    (c14, new_org, 'Yolanda Cruz',       '5625550114', 'ycruz562@outlook.com',        'Downey',          'CA', now()-'11 days'::interval),
    (c15, new_org, 'Brandon Lee',        '2135550115', 'brandon.lee.la@gmail.com',    'Monterey Park',   'CA', now()-'5 days'::interval),
    (c16, new_org, 'Patricia Ramirez',   '3105550116', 'pramirez310@gmail.com',       'Hawthorne',       'CA', now()-'15 days'::interval),
    (c17, new_org, 'Antonio Vega',       '3235550117', 'a.vega.la@yahoo.com',         'South Gate',      'CA', now()-'22 hours'::interval),
    (c18, new_org, 'Michelle Wong',      '8185550118', 'mwong.sgv@gmail.com',         'Temple City',     'CA', now()-'3 days'::interval),
    (c19, new_org, 'Derrick Harris',     '4245550119', 'd.harris.la@gmail.com',       'Compton',         'CA', now()-'14 days'::interval),
    (c20, new_org, 'Guadalupe Martinez', '5625550120', 'g.martinez562@gmail.com',     'Pico Rivera',     'CA', now()-'25 days'::interval);

  -- ── 7. Activities ────────────────────────────────────────────────────────────
  -- Creates a realistic activity timeline for each customer.
  -- vehicle_id uses subqueries to link the right make from copied inventory.
  -- NULL vehicle_id is fine for calls/notes with no specific vehicle context.

  -- Carlos Mendoza — AutoTrader Honda lead, no response yet
  INSERT INTO activities (user_id, customer_id, vehicle_id, type, direction, body, completed_at, created_at) VALUES
    (new_org, c01,
     (SELECT id FROM vehicles WHERE user_id = new_org AND LOWER(make) = 'honda' LIMIT 1),
     'email', 'inbound',
     'Hi, I saw your listing on AutoTrader for a Honda Accord. Is it still available? What''s the best price you can do? I can come in this weekend.',
     now()-'12 days'::interval, now()-'12 days'::interval),
    (new_org, c01,
     (SELECT id FROM vehicles WHERE user_id = new_org AND LOWER(make) = 'honda' LIMIT 1),
     'sms', 'outbound',
     'Hey Carlos! This is Alex from First Valley Auto Sales. The Accord is still available and priced right. I can hold it for you. When works to come see it?',
     now()-'11 days'::interval, now()-'11 days'::interval),
    (new_org, c01, NULL,
     'call', 'outbound',
     'Called Carlos — went to voicemail. Left message with callback number. Will try again tomorrow AM.',
     now()-'10 days'::interval, now()-'10 days'::interval);

  -- Jennifer Kim — CarGurus Toyota Camry, test drive done
  INSERT INTO activities (user_id, customer_id, vehicle_id, type, direction, body, completed_at, created_at) VALUES
    (new_org, c02,
     (SELECT id FROM vehicles WHERE user_id = new_org AND LOWER(make) = 'toyota' LIMIT 1),
     'email', 'inbound',
     'Hello! Found your dealership on CarGurus. Do you have any Toyota Camrys available? I have good credit and I''m ready to move fast. Budget around $22k.',
     now()-'8 days'::interval, now()-'8 days'::interval),
    (new_org, c02,
     (SELECT id FROM vehicles WHERE user_id = new_org AND LOWER(make) = 'toyota' LIMIT 1),
     'call', 'outbound',
     'Spoke with Jennifer. Pre-approved at her credit union. Coming in Saturday at 2pm for test drive on the Camry SE. Very motivated buyer.',
     now()-'7 days'::interval, now()-'7 days'::interval),
    (new_org, c02,
     (SELECT id FROM vehicles WHERE user_id = new_org AND LOWER(make) = 'toyota' LIMIT 1),
     'note', 'outbound',
     'Test drive went great — she loved it. Offered $21,500 OTD. She''s thinking it over, will call back Monday. Follow up if no word by noon.',
     now()-'5 days'::interval, now()-'5 days'::interval);

  -- Marcus Williams — walk-in, Nissan Altima
  INSERT INTO activities (user_id, customer_id, vehicle_id, type, direction, body, completed_at, created_at) VALUES
    (new_org, c03,
     (SELECT id FROM vehicles WHERE user_id = new_org AND LOWER(make) = 'nissan' LIMIT 1),
     'note', 'inbound',
     'Walk-in. Looking for a mid-size sedan for daily commute to downtown. Showed him the Altima and Sentra. Liked the Altima — more space. Needs to check with his wife first.',
     now()-'5 days'::interval, now()-'5 days'::interval),
    (new_org, c03, NULL,
     'sms', 'outbound',
     'Hey Marcus! Great meeting you today. The Altima is one of our cleanest — one owner, clean Carfax. Let me know if you have any questions!',
     now()-'4 days'::interval, now()-'4 days'::interval);

  -- Rosa Gutierrez — phone lead, Honda Civic, appointment Saturday
  INSERT INTO activities (user_id, customer_id, vehicle_id, type, direction, body, completed_at, created_at) VALUES
    (new_org, c04, NULL,
     'call', 'inbound',
     'Rosa called asking about Civics under $18k. Has a 2016 Corolla to trade in. Pre-approved at Chase at $350/mo. Ready to buy this week.',
     now()-'3 days'::interval, now()-'3 days'::interval),
    (new_org, c04,
     (SELECT id FROM vehicles WHERE user_id = new_org AND LOWER(make) = 'honda' LIMIT 1),
     'sms', 'outbound',
     'Hi Rosa! We have a clean 2020 Civic with 38k miles at $17,900. I think it fits your budget perfectly. Confirmed for Saturday — see you then!',
     now()-'2 days'::interval, now()-'2 days'::interval);

  -- David Chen — website inquiry, RAV4, appointment set
  INSERT INTO activities (user_id, customer_id, vehicle_id, type, direction, body, completed_at, created_at) VALUES
    (new_org, c05,
     (SELECT id FROM vehicles WHERE user_id = new_org AND LOWER(make) = 'toyota' LIMIT 1),
     'email', 'inbound',
     'I submitted an inquiry on your website about the RAV4. Looking for an AWD SUV for my family. Is it still available and what''s your best OTD price?',
     now()-'10 days'::interval, now()-'10 days'::interval),
    (new_org, c05, NULL,
     'call', 'outbound',
     'Spoke with David — very motivated. Been shopping 2 weeks, ready to decide. Coming in Wednesday at 5pm after work. Pull RAV4 to front and have Carfax ready.',
     now()-'9 days'::interval, now()-'9 days'::interval),
    (new_org, c05, NULL,
     'note', 'outbound',
     'Appointment confirmed Wednesday 5pm. David wants to compare the RAV4 vs one other option. Pull the CX-5 as backup.',
     now()-'8 days'::interval, now()-'8 days'::interval);

  -- Tanya Johnson — fresh AutoTrader lead, not yet replied
  INSERT INTO activities (user_id, customer_id, vehicle_id, type, direction, body, completed_at, created_at) VALUES
    (new_org, c06, NULL,
     'email', 'inbound',
     'Hi! I saw your listing on AutoTrader for a Sonata. Very interested — can you tell me more about the history? Any accidents on the Carfax?',
     now()-'2 days'::interval, now()-'2 days'::interval);

  -- Miguel Santos — CarGurus SUV, sent vehicle photos
  INSERT INTO activities (user_id, customer_id, vehicle_id, type, direction, body, completed_at, created_at) VALUES
    (new_org, c07, NULL,
     'email', 'inbound',
     'Found you on CarGurus. Looking for an SUV around $25k — Cherokee, Equinox, or similar. Flexible on make. Do you have anything coming in?',
     now()-'7 days'::interval, now()-'7 days'::interval),
    (new_org, c07, NULL,
     'call', 'outbound',
     'Discussed available SUV options with Miguel. He''s open to several makes. Sending photos of 3 options via text. Waiting to hear back.',
     now()-'6 days'::interval, now()-'6 days'::interval),
    (new_org, c07, NULL,
     'sms', 'outbound',
     'Hey Miguel! Here are 3 SUVs in your budget — all clean Carfax, low miles. Which one catches your eye? I can hold your favorite while you decide.',
     now()-'6 days'::interval, now()-'6 days'::interval);

  -- Ashley Park — referral from Robert Davis
  INSERT INTO activities (user_id, customer_id, vehicle_id, type, direction, body, completed_at, created_at) VALUES
    (new_org, c08, NULL,
     'call', 'inbound',
     'Called in — referred by her coworker Robert Davis who bought from us last month. Looking for a CR-V or RAV4 for work commute. Budget $23-26k.',
     now()-'4 days'::interval, now()-'4 days'::interval),
    (new_org, c08,
     (SELECT id FROM vehicles WHERE user_id = new_org AND LOWER(make) = 'honda' LIMIT 1),
     'sms', 'outbound',
     'Hi Ashley! Great speaking with you. Just pulled a 2021 CR-V that came in this week — 29k miles, one owner. I think this is exactly what you''re looking for. Want to come see it?',
     now()-'3 days'::interval, now()-'3 days'::interval);

  -- Robert Davis — SOLD, follow-up call, referred Ashley
  INSERT INTO activities (user_id, customer_id, vehicle_id, type, direction, body, completed_at, created_at) VALUES
    (new_org, c09,
     (SELECT id FROM vehicles WHERE user_id = new_org LIMIT 1 OFFSET 2),
     'note', 'inbound',
     'Walk-in. Robert knew what he wanted — tested 2 vehicles, chose the Accord. Deal closed at $19,200 OTD in under 2 hours. Smooth transaction.',
     now()-'28 days'::interval, now()-'28 days'::interval),
    (new_org, c09, NULL,
     'call', 'outbound',
     'Follow-up call. Car running great, Robert very happy. He mentioned his coworker Ashley is in the market for a car too. Sent a referral thank-you text.',
     now()-'20 days'::interval, now()-'20 days'::interval);

  -- Maria Flores — fresh AutoTrader lead, not yet replied
  INSERT INTO activities (user_id, customer_id, vehicle_id, type, direction, body, completed_at, created_at) VALUES
    (new_org, c10, NULL,
     'email', 'inbound',
     'Hello! Just saw your listing on AutoTrader. Is the Corolla still available? I''m a nurse and I need something reliable and affordable. Is $500/mo OTD realistic?',
     now()-'1 day'::interval, now()-'1 day'::interval);

  -- Kevin Nguyen — CarGurus, appointment Thursday
  INSERT INTO activities (user_id, customer_id, vehicle_id, type, direction, body, completed_at, created_at) VALUES
    (new_org, c11, NULL,
     'email', 'inbound',
     'Hi! Looking at your Kia on CarGurus. Is there room on the price? My credit score is 720 and I can put $3k down. Would love to come for a test drive.',
     now()-'6 days'::interval, now()-'6 days'::interval),
    (new_org, c11, NULL,
     'call', 'outbound',
     'Good credit, motivated buyer. With $3k down his payment would be around $310/mo at 72 months — works for him. Appointment set Thursday 6pm.',
     now()-'5 days'::interval, now()-'5 days'::interval);

  -- Sandra Torres — inactive, bought elsewhere
  INSERT INTO activities (user_id, customer_id, vehicle_id, type, direction, body, completed_at, created_at) VALUES
    (new_org, c12, NULL,
     'email', 'inbound',
     'Hello, I found your website and I''m interested in a used SUV. Can you send me more information?',
     now()-'20 days'::interval, now()-'20 days'::interval),
    (new_org, c12, NULL,
     'call', 'outbound',
     'Called Sandra — no answer. Third attempt this week.',
     now()-'18 days'::interval, now()-'18 days'::interval),
    (new_org, c12, NULL,
     'note', 'outbound',
     'Sandra replied by email — she already bought elsewhere. Marking inactive. No hard feelings, she said she''d keep us in mind for next time.',
     now()-'15 days'::interval, now()-'15 days'::interval);

  -- James Robinson — phone lead, truck buyer, no-show rescheduled
  INSERT INTO activities (user_id, customer_id, vehicle_id, type, direction, body, completed_at, created_at) VALUES
    (new_org, c13, NULL,
     'call', 'inbound',
     'James called asking about pickup trucks. Runs a landscaping business, needs a work truck. Budget $22-28k. Wants F-150 or Silverado. Will come Saturday.',
     now()-'9 days'::interval, now()-'9 days'::interval),
    (new_org, c13, NULL,
     'note', 'outbound',
     'James did not show Saturday. Called — said something came up. Rescheduled for next week. Sent reminder text.',
     now()-'7 days'::interval, now()-'7 days'::interval),
    (new_org, c13, NULL,
     'sms', 'outbound',
     'Hey James! Just a reminder — we''re holding those truck options for you. When works best this week? Want to make sure you get first pick.',
     now()-'3 days'::interval, now()-'3 days'::interval);

  -- Yolanda Cruz — referral, SUV, test drive done
  INSERT INTO activities (user_id, customer_id, vehicle_id, type, direction, body, completed_at, created_at) VALUES
    (new_org, c14, NULL,
     'call', 'inbound',
     'Yolanda was referred by her sister who bought from us. Looking for a family SUV under $24k. Very motivated — needs something within 2 weeks.',
     now()-'11 days'::interval, now()-'11 days'::interval),
    (new_org, c14,
     (SELECT id FROM vehicles WHERE user_id = new_org LIMIT 1 OFFSET 1),
     'call', 'outbound',
     'Yolanda came in and test drove the Equinox. Loved it. She''s asking if we can do $22,500 OTD. Checking with finance — should have an answer by EOD.',
     now()-'8 days'::interval, now()-'8 days'::interval);

  -- Brandon Lee — first-time buyer, financing discussion
  INSERT INTO activities (user_id, customer_id, vehicle_id, type, direction, body, completed_at, created_at) VALUES
    (new_org, c15, NULL,
     'email', 'inbound',
     'Saw your Mazda on AutoTrader. First-time buyer — what do I need to qualify for financing? I have a job but limited credit history.',
     now()-'5 days'::interval, now()-'5 days'::interval),
    (new_org, c15, NULL,
     'call', 'outbound',
     'Walked Brandon through first-time buyer programs. Can work with thin credit but he may need a cosigner or bigger down payment. Appointment Saturday.',
     now()-'4 days'::interval, now()-'4 days'::interval);

  -- Patricia Ramirez — SOLD, smooth deal
  INSERT INTO activities (user_id, customer_id, vehicle_id, type, direction, body, completed_at, created_at) VALUES
    (new_org, c16,
     (SELECT id FROM vehicles WHERE user_id = new_org LIMIT 1 OFFSET 3),
     'note', 'inbound',
     'Patricia walked in with her husband. They''ve been shopping for 3 weeks. Fell in love with the Altima. Deal agreed at $20,800 OTD after a 20-min negotiation.',
     now()-'15 days'::interval, now()-'15 days'::interval),
    (new_org, c16, NULL,
     'call', 'outbound',
     'Finance approval: lender approved at 7.9% for 60 months. Payment $382/mo. Patricia happy with terms. Signing appointment Thursday 3pm.',
     now()-'13 days'::interval, now()-'13 days'::interval),
    (new_org, c16, NULL,
     'note', 'outbound',
     'SOLD. Patricia picked up the vehicle Thursday. Docs signed, plates ordered. Great customer — mentioned she''d leave a Google review.',
     now()-'12 days'::interval, now()-'12 days'::interval);

  -- Antonio Vega — fresh CarGurus lead, overnight
  INSERT INTO activities (user_id, customer_id, vehicle_id, type, direction, body, completed_at, created_at) VALUES
    (new_org, c17, NULL,
     'email', 'inbound',
     'Hello! I saw a Dodge Charger on CarGurus. Is it still available? I work nights so best to reach me after 2pm.',
     now()-'22 hours'::interval, now()-'22 hours'::interval);

  -- Michelle Wong — website lead, appointment confirmed today
  INSERT INTO activities (user_id, customer_id, vehicle_id, type, direction, body, completed_at, created_at) VALUES
    (new_org, c18, NULL,
     'email', 'inbound',
     'Hi! I''m looking for a Subaru Forester or similar crossover. Found you through Google. Anything in that size range under $25k?',
     now()-'3 days'::interval, now()-'3 days'::interval),
    (new_org, c18, NULL,
     'call', 'outbound',
     'Great conversation with Michelle. Well-researched, knows exactly what she wants. Appointment set for tomorrow at 4pm. Pulling 2 options for comparison.',
     now()-'2 days'::interval, now()-'2 days'::interval),
    (new_org, c18, NULL,
     'sms', 'outbound',
     'Hi Michelle! Confirming your appointment tomorrow at 4pm. I''ll have 2 options ready for you to compare side-by-side. See you then!',
     now()-'1 day'::interval, now()-'1 day'::interval);

  -- Derrick Harris — OVERDUE, 14 days without contact
  INSERT INTO activities (user_id, customer_id, vehicle_id, type, direction, body, completed_at, created_at) VALUES
    (new_org, c19, NULL,
     'call', 'inbound',
     'Derrick called about a first car for his daughter starting college. Budget $12-15k, reliable sedan. Said he''d come by the following week.',
     now()-'14 days'::interval, now()-'14 days'::interval),
    (new_org, c19, NULL,
     'call', 'outbound',
     'Called Derrick — no answer. Will try again tomorrow.',
     now()-'12 days'::interval, now()-'12 days'::interval),
    (new_org, c19, NULL,
     'sms', 'outbound',
     'Hey Derrick! This is Alex from First Valley Auto. Still have some great options for your daughter''s first car. Let me know a good time to connect!',
     now()-'10 days'::interval, now()-'10 days'::interval);

  -- Guadalupe Martinez — SOLD, same-day deal
  INSERT INTO activities (user_id, customer_id, vehicle_id, type, direction, body, completed_at, created_at) VALUES
    (new_org, c20,
     (SELECT id FROM vehicles WHERE user_id = new_org LIMIT 1 OFFSET 4),
     'email', 'inbound',
     'Hi! I saw your listing on AutoTrader. I''m very interested and ready to buy today if the price is right. Can we talk?',
     now()-'25 days'::interval, now()-'25 days'::interval),
    (new_org, c20, NULL,
     'call', 'outbound',
     'Spoke with Guadalupe — came in same day. No-nonsense buyer who knew exactly what she wanted and what she''d pay. Deal done in 90 minutes.',
     now()-'25 days'::interval, now()-'25 days'::interval),
    (new_org, c20, NULL,
     'note', 'outbound',
     'SOLD. Guadalupe drove off happy. Mentioned her sister is also in the market for a vehicle — she''ll send her our way.',
     now()-'24 days'::interval, now()-'24 days'::interval);

  -- ── Done ─────────────────────────────────────────────────────────────────────
  RAISE NOTICE '';
  RAISE NOTICE '====================================================';
  RAISE NOTICE 'First Valley Auto Sales demo dealership created.';
  RAISE NOTICE '----------------------------------------------------';
  RAISE NOTICE 'Org ID:   a3b4c5d6-e7f8-4901-b234-567890abcdef';
  RAISE NOTICE 'Login:    demo@firstvalleyauto.com';
  RAISE NOTICE 'Password: DemoDealer2026!';
  RAISE NOTICE '====================================================';

END $$;
