-- Seed: Apollo Auto template library
-- Run in Supabase SQL editor — adds to existing templates, does not replace them
-- Uses revised/improved versions from the SMS review + full email cadence

DO $$
DECLARE
  org UUID := (SELECT id FROM organizations WHERE slug = 'apollo-auto' LIMIT 1);
BEGIN
  IF org IS NULL THEN
    RAISE EXCEPTION 'apollo-auto org not found';
  END IF;

  INSERT INTO templates (user_id, name, channel, category, subject, body) VALUES

  -- ─────────────────────────────────────────────
  -- SMS: Follow-Up Sequence
  -- ─────────────────────────────────────────────
  (org, 'Follow-Up 1 - First Contact', 'sms', 'Follow-Up Sequence', NULL,
   'Hi {firstName}, this is {dealerName}. I saw your inquiry on the {vehicle}. Good news — it''s available. Want me to send you photos, payment options, or set a test drive?'),

  (org, 'Follow-Up 2 - Value Add (2-4hrs)', 'sms', 'Follow-Up Sequence', NULL,
   'Hi {firstName}, I pulled the details on the {vehicle}. I can send a quick walkaround video, estimated payments, or trade-in numbers. Which would help most?'),

  (org, 'Follow-Up 3 - Soft Urgency (Next Day)', 'sms', 'Follow-Up Sequence', NULL,
   'Good morning {firstName}, {dealerName}. The {vehicle} is still available at {price}. If you''re serious about it, I can help you lock in a time before someone else grabs it. Today better or tomorrow?'),

  (org, 'Follow-Up 4 - Objection Opener (Day 3)', 'sms', 'Follow-Up Sequence', NULL,
   'Hi {firstName}, usually when someone goes quiet it''s one of 3 things — price, payment, or timing. Which one is holding this up on the {vehicle}? I may be able to help.'),

  (org, 'Follow-Up 5 - Close Out (Day 7)', 'sms', 'Follow-Up Sequence', NULL,
   'Hi {firstName}, I haven''t heard back, so I''ll close this out for now. If you still want help with the {vehicle} — or something similar — text me anytime and I''ll pick it up from there.'),

  -- ─────────────────────────────────────────────
  -- SMS: 15-Day Cadence (from cadence file)
  -- ─────────────────────────────────────────────
  (org, 'Cadence Day 6 - Financing Angle', 'sms', 'Follow-Up Sequence', NULL,
   'Hi {firstName}, not sure where you''re at in the process, but if financing is the main question, I can help with that too. Want me to send payment options on the {vehicle}?'),

  (org, 'Cadence Day 9 - Keep Open?', 'sms', 'Follow-Up Sequence', NULL,
   'Hi {firstName}, should I keep this open for you, or did you already find a vehicle?'),

  (org, 'Cadence Day 12 - Similar Options', 'sms', 'Follow-Up Sequence', NULL,
   'Hi {firstName}, if the {vehicle} is not the one, I can send 2-3 similar options that may fit your budget better. Want me to do that?'),

  (org, 'Cadence Day 15 - Final Text', 'sms', 'Follow-Up Sequence', NULL,
   'Hi {firstName}, I''m closing out my follow-up on the {vehicle}. If you still want help, text me "open" and I''ll send the best current options. If not, I''ll close it out.'),

  -- ─────────────────────────────────────────────
  -- SMS: Test Drive
  -- ─────────────────────────────────────────────
  (org, 'Test Drive - Confirmation', 'sms', 'Test Drive', NULL,
   'Hi {firstName}, you''re confirmed to test drive the {vehicle} at {dealerName}. I''ll have it ready when you arrive. Need the address or anything before you come?'),

  (org, 'Test Drive - Day-of Reminder', 'sms', 'Test Drive', NULL,
   'Hi {firstName}, reminder for your {vehicle} test drive today. We''ve got it pulled up and ready. Text me if you''re running early or late.'),

  (org, 'Test Drive - No-Show', 'sms', 'Test Drive', NULL,
   'Hi {firstName}, sorry we missed you today. The {vehicle} is still available. Want me to hold another time for you this week?'),

  (org, 'Test Drive - Post Drive', 'sms', 'Test Drive', NULL,
   'Hi {firstName}, great meeting you today. What did you like most about the {vehicle}? If you want, I can send numbers with payment options so you can compare everything clearly.'),

  -- ─────────────────────────────────────────────
  -- SMS: Financing
  -- ─────────────────────────────────────────────
  (org, 'Finance - Pre-Approval Invite', 'sms', 'Financing', NULL,
   'Hi {firstName}, I can get you pre-qualified for the {vehicle} in a few minutes. It helps narrow the best payment options before you come in. Want the link?'),

  (org, 'Finance - Low Down Payment', 'sms', 'Financing', NULL,
   'Hi {firstName}, we work with all credit types on the {vehicle}, and we have options for low down payments. Want me to see what your best approval path looks like?'),

  (org, 'Finance - BHPH Option', 'sms', 'Financing', NULL,
   'Hi {firstName}, if bank financing is tough, we do in-house financing on the {vehicle}. That gives you another path to get approved. Want details?'),

  (org, 'Finance - Approval Received', 'sms', 'Financing', NULL,
   'Great news {firstName} — you''re approved on the {vehicle}. Next step is choosing a time to wrap it up. Is today or tomorrow better?'),

  (org, 'Finance - Credit Concern Opener', 'sms', 'Financing', NULL,
   'Hi {firstName}, if credit is the only thing holding you back, don''t count yourself out. We work with a lot of different situations. Want to see your options?'),

  (org, 'Finance - Trade-In Opener', 'sms', 'Financing', NULL,
   'Hi {firstName}, if you have a trade, I can get you a rough number before you come in. Want me to do that for the {vehicle} you asked about?'),

  -- ─────────────────────────────────────────────
  -- SMS: Vehicle Sold / Alternatives
  -- ─────────────────────────────────────────────
  (org, 'Sold - Alternative Available', 'sms', 'Sold / Alternatives', NULL,
   'Hi {firstName}, the {vehicle} sold. I do have a similar option that just came in and I think it fits what you were looking for. Want photos and price?'),

  (org, 'Sold - New Inventory Alert', 'sms', 'Sold / Alternatives', NULL,
   'Hi {firstName}, you asked about the {vehicle} earlier. I just got a comparable one in at {price}. Want me to send you the details before I post it?'),

  (org, 'Sold - Waitlist', 'sms', 'Sold / Alternatives', NULL,
   'Hi {firstName}, that {vehicle} is gone, but I''ve got your info saved. As soon as another one like it lands, I''ll send it to you first.'),

  -- ─────────────────────────────────────────────
  -- SMS: Appointments
  -- ─────────────────────────────────────────────
  (org, 'Appointment - Request', 'sms', 'Appointment', NULL,
   'Hi {firstName}, I can get the {vehicle} ready for you this week. Is morning or afternoon better?'),

  (org, 'Appointment - Confirmation', 'sms', 'Appointment', NULL,
   'Hi {firstName}, you''re set for {time} on {date} to see the {vehicle} at {dealerName}. I''ll have it ready for you when you get here.'),

  (org, 'Appointment - 24hr Reminder', 'sms', 'Appointment', NULL,
   'Hi {firstName}, quick reminder for tomorrow at {time}. Your {vehicle} appointment is locked in, and we''ll have everything ready when you arrive.'),

  (org, 'Appointment - Rebook After Cancel', 'sms', 'Appointment', NULL,
   'Hi {firstName}, no problem at all. The {vehicle} is still available. Want to grab another time this week?'),

  -- ─────────────────────────────────────────────
  -- SMS: Negotiation / Closing
  -- ─────────────────────────────────────────────
  (org, 'Price - Make an Offer', 'sms', 'Negotiation', NULL,
   'Hi {firstName}, if the {vehicle} is the right one, tell me what you need for this to make sense — price, payment, trade-in, or down payment. I''ll tell you straight.'),

  (org, 'Price - Drop Alert', 'sms', 'Negotiation', NULL,
   'Good news {firstName} — the price on the {vehicle} just changed to {price}. Want me to send updated numbers?'),

  (org, 'Price - End of Month', 'sms', 'Negotiation', NULL,
   'Hi {firstName}, we''re closing out the month and I may have a little more room to help on the {vehicle}. Want to see what I can do?'),

  (org, 'Payment Shopper', 'sms', 'Negotiation', NULL,
   'Hi {firstName}, if monthly payment matters most, give me a rough range and I''ll tell you which vehicles fit it best.'),

  (org, 'Hold / Commitment', 'sms', 'Negotiation', NULL,
   'Hi {firstName}, I can hold a time for you to see the {vehicle}, but openings move fast. Want me to lock one in for today?'),

  -- ─────────────────────────────────────────────
  -- SMS: Post-Sale & Referrals
  -- ─────────────────────────────────────────────
  (org, 'Post-Sale - Day 1 Congrats', 'sms', 'Post-Sale', NULL,
   'Hi {firstName}, congrats again on your {vehicle}. Appreciate your business. If any questions come up, text me directly and I''ll help.'),

  (org, 'Post-Sale - Week 1 Check-In', 'sms', 'Post-Sale', NULL,
   'Hi {firstName}, how''s the {vehicle} been so far? If everything''s going well, I''d love to help anyone you know who''s car shopping too.'),

  (org, 'Post-Sale - Google Review Request', 'sms', 'Post-Sale', NULL,
   'Hi {firstName}, glad we got you into the right vehicle. If you had a good experience, would you mind leaving us a quick Google review? Here''s the link: [link]'),

  -- ─────────────────────────────────────────────
  -- SMS: Win-Back / Dormant
  -- ─────────────────────────────────────────────
  (org, 'Win-Back - Cold Lead Check-In', 'sms', 'Win-Back', NULL,
   'Hi {firstName}, {dealerName}. Are you still shopping for a vehicle, or did you already find one?'),

  (org, 'Win-Back - Tax Season', 'sms', 'Win-Back', NULL,
   'Hi {firstName}, tax season usually means more buying power, so I wanted to reach out. If you''re still looking, I can send a few solid options in your price range.'),

  (org, 'Win-Back - New Inventory Match', 'sms', 'Win-Back', NULL,
   'Hi {firstName}, we just got an option similar to the {vehicle} that may fit what you were looking for. Want the details?'),

  -- ─────────────────────────────────────────────
  -- EMAIL: 15-Day Follow-Up Cadence
  -- ─────────────────────────────────────────────
  (org, 'Email Cadence - Day 1', 'email', 'Email Follow-Up', '{vehicle} at {dealerName}',
   'Hi {firstName},

This is {dealerName}. I''m reaching out about the {vehicle} you asked about.

It is currently available. If you''d like, I can send you pricing, payment options, mileage, and any details you want before you come in.

What would be most helpful: price, payments, trade-in, or financing?

You can also view it here: {link}

Thank you,
{dealerName}
{dealerPhone}'),

  (org, 'Email Cadence - Day 3 (Options)', 'email', 'Email Follow-Up', 'A couple options for you',
   'Hi {firstName},

I wanted to follow up on the {vehicle}.

If that exact vehicle is not the perfect fit, I can also send you similar options based on your budget, payment goal, or preferred features.

Reply with one of these and I''ll narrow it down for you:
- monthly payment
- cash budget
- down payment
- trade-in
- must-have features

Vehicle link: {link}

Best,
{dealerName}
{dealerPhone}'),

  (org, 'Email Cadence - Day 5 (Quick Question)', 'email', 'Email Follow-Up', 'Quick question',
   'Hi {firstName},

Are you still shopping for a vehicle right now?

If yes, reply with:
1. cash or financing
2. trade-in or no trade
3. ideal monthly payment

I''ll send back the best fit without wasting your time.

Vehicle link: {link}

Thanks,
{dealerName}
{dealerPhone}'),

  (org, 'Email Cadence - Day 8 (Still Looking?)', 'email', 'Email Follow-Up', 'Still looking, or should I close this out?',
   'Hi {firstName},

I wanted to follow up one more time regarding the {vehicle}.

If you''re still in the market, I can send updated pricing, payment options, and similar vehicles we have available.

If you already found something else, no problem — just let me know and I''ll close this out on my end.

Current vehicle link: {link}

Thank you,
{dealerName}
{dealerPhone}'),

  (org, 'Email Cadence - Day 11 (Still an Option)', 'email', 'Email Follow-Up', 'I may still have an option that fits',
   'Hi {firstName},

If you''re still shopping, I may still have an option that fits what you wanted — whether that''s the {vehicle} or something similar in your budget.

Reply with your target payment or down payment and I''ll send the closest matches.

Vehicle link: {link}

Best,
{dealerName}
{dealerPhone}'),

  (org, 'Email Cadence - Day 14 (Last Follow-Up)', 'email', 'Email Follow-Up', 'Last follow-up from me',
   'Hi {firstName},

This will be my last personal follow-up regarding the {vehicle}.

I don''t want to keep filling up your inbox if the timing is not right. If you''re still looking, reply and I''ll send the best options I have right now based on your budget and situation.

If not, no problem at all. I appreciate the opportunity.

Vehicle link: {link}

Thank you,
{dealerName}
{dealerPhone}'),

  (org, 'Email - Win Back Dormant Lead', 'email', 'Win-Back', 'Checking in one last time',
   'Hi {firstName},

I wanted to follow up one last time regarding the {vehicle} you were interested in.

I know timing changes, and I don''t want to keep reaching out if you''ve already moved on. If you''re still in the market, reply to this email and I can send you the latest availability, pricing, and payment options.

If you already found something else, no problem at all — just let me know and I''ll close this out on my end.

Thank you,
{dealerName}
{dealerPhone}')

  ;

  RAISE NOTICE 'Seeded % templates for apollo-auto', (SELECT COUNT(*) FROM templates WHERE user_id = org);
END $$;
