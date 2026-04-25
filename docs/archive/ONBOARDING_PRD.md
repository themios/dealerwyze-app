# DealerWyze — Dealer Onboarding Experience
## Product Requirements Document

**Version:** 1.0
**Date:** 2026-03-03
**Status:** Ready for implementation
**Owner:** DealerWyze Platform Team

---

## 1. Purpose & Goals

### What This Is
A guided, automated onboarding experience that:
- Sets realistic expectations **before** a dealer touches the app
- Tells dealers exactly what to gather **ahead of time** so they aren't stuck mid-setup
- Is transparent about what the DealerWyze team handles vs. what the dealer handles
- Meets dealers where they are — most are not tech-savvy, and that's fine

### Design Principles
1. **Not intimidating.** A used-car dealer has a lot on their plate. Every email and screen should feel like a helpful colleague, not a software manual.
2. **Transparent.** If something takes 48 hours, say so upfront. No surprises.
3. **Plan-aware.** Don't mention voice setup to a Basic CRM customer. Show only what's relevant.
4. **Progressive.** Don't dump everything at once. Each email unlocks the next step.
5. **Human backup.** Every automated step has a "need help?" path to a real person.

---

## 2. Plan Summary (for reference)

| Plan | Price | What It Includes |
|------|-------|-----------------|
| **Basic CRM** (Tier 1) | $49.94/mo | CRM, lead ingestion from email, Gmail/IMAP lead sync, Google Calendar, inventory auto-sync |
| **CRM + SMS** (Tier 2) | $64.95/mo | Everything in Basic + a dedicated SMS number + up to 1,000 msgs/mo |
| **Voice Assistant** (Tier 3) | $249.95/mo | Everything in SMS + AI voice receptionist (24/7 call answering, lead capture) |
| **SMS Add-on** | +$14.99–$59.99/mo | Additional SMS volume for any plan |

---

## 3. Onboarding Journey Overview

```
[Dealer signs up]
        │
        ▼
[Email 1: Welcome + What to Gather]   ← sent immediately on signup
        │
        ▼
[DealerWyze team reviews & approves]  ← within 1 business day
        │
        ▼
[Email 2: You're Approved — Let's Get Started]
        │
        ▼
[In-App Setup Wizard — 5 steps]       ← already built, being refined
        │
        ▼
[Email 3: Setup Complete — Here's What's Running]
        │
        ▼
[Email 4: Day 3 — Your First Quick Win]
        │
        ▼
[Email 5: Day 7 — Check-In + Pro Tips]
        │
        ▼
[Email 6: Day 14 — Feature Spotlight]  ← based on plan
```

---

## 4. Email Sequence Specifications

---

### Email 1 — Welcome + What to Gather
**Trigger:** Dealer completes signup form (account pending approval)
**To:** Dealer's registered email
**Subject:** `Welcome to DealerWyze — here's what to have ready`
**Timing:** Immediately on signup

**Tone:** Warm, welcoming, zero pressure. "You're in good hands" energy.

**Content:**

```
Subject: Welcome to DealerWyze — here's what to have ready

Hi [First Name],

Welcome to DealerWyze! We're excited to have [Business Name] on board.

Your account is being reviewed by our team and will be approved within
1 business day. While you wait, we put together a short list of things
to have on hand — this will make your setup go much faster when you're
ready to start.

Nothing here is complicated. It's just good to have it open before you
begin.

────────────────────────────────────────
WHAT EVERY DEALER NEEDS
────────────────────────────────────────

□ Your dealership's exact business name (as you want it to appear in texts)
□ Your main business phone number
□ Your business address (and any satellite lots)
□ The email address where you currently receive leads from CarGurus,
  AutoTrader, OfferUp, or Facebook Marketplace
  (This is usually a Gmail or Yahoo account — DealerWyze reads it
   automatically so you never miss a lead)

[IF ON CRM + SMS OR VOICE PLAN — show this section]
────────────────────────────────────────
FOR SMS MESSAGING
────────────────────────────────────────

You'll get a dedicated local phone number for texting your customers.
You have two options:

  Option A — Get a new number (we set it up for you, free)
  Option B — Port your existing number (takes 3–7 business days;
             you'll need your current carrier's account info)

If you're not sure which to choose, go with Option A. You can always
port your number later.

[IF ON VOICE ASSISTANT PLAN — show this section]
────────────────────────────────────────
FOR YOUR VOICE ASSISTANT
────────────────────────────────────────

Your AI voice receptionist will answer calls 24/7, collect customer
information, and text you a summary after every call. To get it set up,
have these ready:

□ Your Google account login (for Google Calendar sync)
□ Your business hours
□ The name you want the AI to use when greeting callers
  (e.g., "Hi, thanks for calling Apollo Auto!")
□ Your inventory website URL (if you have one)
  — the voice assistant can look up vehicles for callers

────────────────────────────────────────
WHAT OUR TEAM HANDLES FOR YOU
────────────────────────────────────────

You don't have to do any of this — we take care of it as part of setup:

✓ Your SMS phone number (provisioned within 24 hours of approval)
✓ Your AI voice agent (configured within 48 hours of approval)
✓ Connecting your lead email to DealerWyze
✓ Setting up your inventory feed for CarGurus / Facebook
✓ Any technical questions — just reply to this email

────────────────────────────────────────

That's it for now. You'll hear from us within 1 business day once your
account is approved.

Questions? Just reply to this email — a real person reads it.

— The DealerWyze Team
  support@dealerwyze.com
```

---

### Email 2 — Account Approved
**Trigger:** SuperAdmin clicks "Approve" on the pending org in `/admin`
**To:** Dealer admin email
**Subject:** `You're approved — time to set up your dealership`
**Timing:** Immediately on approval action

**Content:**

```
Subject: You're approved — time to set up [Business Name]

Hi [First Name],

Great news — your DealerWyze account is approved and ready to go.

[ Get Started → dealerwyze.com/onboarding ]

Your setup takes about 10 minutes. Here's what you'll do:

  Step 1 — Confirm your business info (2 min)
  Step 2 — Choose your plan (already selected — just confirm)
  Step 3 — Connect your lead email (3 min)
  Step 4 — Invite your team (optional, skip if you're solo)
  Step 5 — Done ✓

────────────────────────────────────────
WHAT'S HAPPENING IN THE BACKGROUND
────────────────────────────────────────

While you're setting up, our team is already working on:

[IF SMS OR VOICE PLAN]
□ Your SMS phone number — ready within 24 hours
   You'll get a confirmation email when it's live.

[IF VOICE PLAN]
□ Your AI voice assistant — configured within 48 hours
   We'll email you when it's ready and walk you through testing it.

────────────────────────────────────────

Need help during setup? Reply to this email or open a support ticket
from inside the app at any time.

— The DealerWyze Team
```

---

### Email 3 — Setup Complete
**Trigger:** Dealer completes the in-app onboarding wizard (step 5 → Done)
**To:** Dealer admin email
**Subject:** `[Business Name] is set up on DealerWyze`
**Timing:** Immediately on wizard completion

**Content:**

```
Subject: [Business Name] is set up on DealerWyze 🎉

Hi [First Name],

You did it — [Business Name] is fully set up on DealerWyze.

Here's a summary of what's running:

YOUR ACCOUNT SUMMARY
────────────────────
Plan:           [Plan Name] — $[Price]/mo
Lead email:     [email@example.com] ← polling every 15 min
SMS number:     [+1 (XXX) XXX-XXXX] ← live and ready [OR: provisioning in progress]
Calendar sync:  [Connected / Not connected]
Team members:   [N] users

WHAT HAPPENS AUTOMATICALLY
────────────────────────────
□ Every new lead from CarGurus, AutoTrader, OfferUp, and Facebook
  Marketplace that hits your inbox is imported into DealerWyze
  automatically — usually within 15 minutes.

□ The system sends an introductory text to each new lead
  within the first hour. You can customize these templates
  at any time under Settings → Templates.

□ You'll get a daily "Dealer Brief" each morning with a summary
  of your leads, pipeline, and anything that needs attention.

YOUR FIRST THREE THINGS TO DO
──────────────────────────────
1. Add your first customer (or wait — your lead email will populate
   your pipeline automatically)
2. Review your SMS templates under Settings → Templates
3. Add any vehicles currently on your lot under Inventory

[ Open DealerWyze → dealerwyze.com ]

Questions? Reply here or use Support inside the app.

— The DealerWyze Team
```

---

### Email 4 — Day 3 Quick Win
**Trigger:** 3 days after `onboarding_completed_at`
**To:** Dealer admin email
**Subject:** `Your first lead should be in by now — here's what to check`
**Condition:** Only send if `customers.count > 0` for their org (they have leads); otherwise send a "connect your lead email" nudge

**Content (has leads):**

```
Subject: Check your pipeline — leads are coming in

Hi [First Name],

It's been 3 days since you set up [Business Name] on DealerWyze.
By now you should have your first leads in your pipeline.

Here's a quick thing to check:

  → Go to Customers and look for anyone in "New Lead" status
  → If they haven't replied to your intro text, tap their name
    and send a personal follow-up

The dealers who respond within an hour of a new lead get 7x more
appointments. Your automated texts are already helping — this is
just the extra touch.

[ View My Leads → dealerwyze.com/customers ]

One more thing: if you're on the SMS plan, check your message count
under Settings → Billing. You'll see how many texts have gone out.

— The DealerWyze Team
```

**Content (no leads yet):**

```
Subject: Your lead email isn't connected yet

Hi [First Name],

It's been 3 days and we haven't seen any leads come in for
[Business Name] yet. That's usually because the lead email
isn't connected.

It only takes 2 minutes to fix:

[ Connect Your Lead Email → dealerwyze.com/settings/email ]

If you're already getting leads from CarGurus or AutoTrader,
they're going to an email inbox — we just need to connect to it.

Questions? Reply here and we'll walk you through it.

— The DealerWyze Team
```

---

### Email 5 — Day 7 Check-In
**Trigger:** 7 days after `onboarding_completed_at`
**To:** Dealer admin email
**Subject:** `One week in — how's DealerWyze working for you?`

**Content:**

```
Subject: One week in — how's DealerWyze working for you?

Hi [First Name],

You've been using DealerWyze for one week. Here's a quick look
at how [Business Name] is doing:

  Leads imported this week:  [N]
  Texts sent:                [N]
  Responses received:        [N]
  Avg response time:         [X min / hrs]

[IF avg response time > 60 min]
  💡 Tip: Your average lead response time is [X]. Dealers who
  respond in under 60 minutes close 4x more deals. Set up
  push notifications in the app to get alerted the moment
  a new lead comes in.

IS EVERYTHING WORKING?
────────────────────────
□ Leads coming in automatically?   [Yes/Not sure → link to settings]
□ SMS texts going out?             [Yes/Not sure → link to settings]
□ Daily brief arriving each morning?

If anything isn't working right, reply to this email or open a
support ticket inside the app — we'll fix it same day.

— The DealerWyze Team
```

---

### Email 6 — Day 14 Feature Spotlight (plan-aware)
**Trigger:** 14 days after `onboarding_completed_at`
**To:** Dealer admin email
**Subject:** varies by plan (see below)

**Tier 1 (Basic CRM) — spotlight: SMS upsell**
```
Subject: Are you following up fast enough? Here's how to fix that.

The #1 thing that separates top dealers from average ones is speed.

With DealerWyze's SMS feature, every new lead gets a text within
60 seconds — automatically. No more losing deals to the dealer
who replied first.

[ Add SMS for $14.99/mo → dealerwyze.com/settings/billing ]
```

**Tier 2 (CRM + SMS) — spotlight: BHPH / payment tracking**
```
Subject: Selling in-house? Track payments automatically.

If you have any buy-here-pay-here customers, DealerWyze tracks
their payment schedule and sends automatic reminders so you
don't have to chase anyone down.

[ Set Up BHPH → dealerwyze.com/bhph ]
```

**Tier 3 (Voice Assistant) — spotlight: voice summary review**
```
Subject: Your AI has been answering calls — here's what it heard

Your voice assistant has handled [N] calls in the past 2 weeks.
Every call gets an AI-generated summary sent to you via text.

Here's how to review them and make sure the agent is saying
the right things:

[ Review Call Summaries → dealerwyze.com/calls ]
```

---

## 5. In-App Onboarding Wizard (existing — refinements needed)

The 5-step wizard at `/onboarding` already exists. These are the gaps and improvements needed:

### Step 1 — Business Info
**Current:** Name, phone, address, timezone
**Add:**
- Satellite lot address (optional second location)
- "How do you receive leads today?" dropdown: Gmail / Yahoo / Outlook / Other / I don't get online leads yet

### Step 2 — Choose Your Plan
**Current:** Plan selector (3 tiers)
**Add:**
- SMS add-on selector shown inline if Tier 1 selected
- "What's included" expandable for each plan
- "Not sure? Start with Basic — upgrade anytime" helper text

### Step 3 — Connect Lead Email
**Current:** Connect Gmail OAuth or IMAP
**Add:**
- "What is this?" explainer: "This is the inbox where CarGurus, AutoTrader, and Facebook send you lead notifications. We read those emails automatically so every lead lands in your CRM."
- "I don't use email leads" skip option (not everyone does on day 1)
- Screenshot/illustration of what a lead email looks like

### Step 4 — Invite Your Team
**Current:** Invite by email
**Add:**
- Role selector with plain-English descriptions:
  - **Admin** — Full access, manages billing and settings
  - **Manager** — Sees all leads and reports, no billing
  - **Sales Rep** — Sees only leads assigned to them
  - **Staff** — Full operational access, no admin functions
- "I'm the only one right now" skip option

### Step 5 — Done
**Current:** Completion screen
**Improve:**
- Show a personalized "Your setup checklist" based on plan
- Show "Being set up by our team" items with estimated times
- Prominent "What happens next" section
- Support ticket button if anything looks wrong

---

## 6. What DealerWyze Handles vs. What the Dealer Handles

This table should appear in Email 1 and on the "Done" screen of the wizard.

### Dealer Does
| Task | Where | Time |
|------|-------|------|
| Business info (name, phone, address) | Onboarding wizard Step 1 | 2 min |
| Choose plan | Onboarding wizard Step 2 | 1 min |
| Connect lead email (Gmail/IMAP) | Onboarding wizard Step 3 | 3 min |
| Invite team members | Onboarding wizard Step 4 | 2 min |
| Add vehicles to inventory | `/inventory` | As needed |
| Review + customize SMS templates | `/settings/templates` | 10 min |
| Connect Google Calendar | `/settings/organization` | 2 min |
| Add GBP location ID (for review alerts) | `/settings/organization` | 2 min |

### DealerWyze Team Handles
| Task | Applies To | Timeline |
|------|-----------|----------|
| Account review + approval | All | Within 1 business day |
| SMS phone number provisioning | SMS + Voice plans | Within 24 hours of approval |
| Number porting (if requested) | SMS + Voice plans | 3–7 business days |
| AI voice agent setup + configuration | Voice plan | Within 48 hours of approval |
| Voice agent testing + QA | Voice plan | Before go-live |
| Inventory feed URL registration help | All | On request |
| Email from-domain setup (BHPH emails) | On request | 1–2 business days |

---

## 7. Pending Approval Page (`/pending`)

When a new dealer signs up, they land here before approval. This page must:
- Confirm they signed up successfully (not leave them wondering)
- Tell them exactly what happens next and when
- Show the "What to have ready" checklist so they can use the wait productively
- Have a support contact if they have questions
- Auto-redirect to `/onboarding` once approved (poll or use Supabase realtime)

**Page content:**

```
You're in line — we'll review your account within 1 business day.

[Business Name] has been received. A member of the DealerWyze team
will review your application and send you an approval email shortly.

WHILE YOU WAIT — HAVE THESE READY:
──────────────────────────────────
□ Your exact business name (as customers will see it in texts)
□ Your business phone number
□ Your business address(es)
□ The email address where you receive CarGurus / AutoTrader / Facebook leads
  (usually a Gmail or Yahoo account)

[IF SMS OR VOICE PLAN SELECTED]
□ Do you want to port an existing number or get a new one?
  If porting: have your current carrier account number ready.

[IF VOICE PLAN SELECTED]
□ Your Google account (for Calendar sync)
□ Your business hours
□ Your inventory website URL (optional)

QUESTIONS?
──────────────────────────────────
Email us at support@dealerwyze.com or call (XXX) XXX-XXXX.
We're real people and we're happy to help.
```

---

## 8. Admin Panel — Onboarding Status View

The SuperAdmin needs visibility into each dealer's onboarding progress to know who to follow up with.

Add to `/admin/orgs/[id]` detail page:

| Field | Source |
|-------|--------|
| Signup date | `organizations.created_at` |
| Approved date | `organizations.approved_at` |
| Wizard completed | `org_settings.onboarding_completed_at` |
| Lead email connected | `email_accounts` count for org |
| Phone provisioned | `org_settings.twilio_phone_number IS NOT NULL` |
| Voice agent live | `org_settings.retell_agent_id IS NOT NULL` |
| Emails sent | `onboarding_emails` log table |
| Last login | `profiles.last_sign_in` (from Supabase auth) |

Add to `/admin` dashboard:
- "In Onboarding" count (approved + `onboarding_completed_at IS NULL`)
- "Stalled" count (approved 7+ days ago, wizard not complete)

---

## 9. Onboarding Email Delivery Infrastructure

### Provider
Use **Resend** (already integrated) with a `DealerWyze <onboarding@dealerwyze.com>` from address.

### Templates
All emails are stored as code (not a WYSIWYG editor) for v1. Use Resend's API with plain-text + minimal HTML.

### Logging
All outbound onboarding emails logged to `onboarding_email_log` table:
```
id, org_id, email_type, sent_at, recipient_email, resend_message_id
```
This table powers the admin visibility view and prevents duplicate sends.

### Unsubscribe
All onboarding emails include:
```
To stop these emails, visit dealerwyze.com/unsubscribe?token=[JWT]
```
Unsubscribe sets `org_settings.onboarding_emails_unsubscribed = true`.

---

## 10. Success Metrics

| Metric | Target | How Measured |
|--------|--------|--------------|
| Wizard completion rate | >85% within 48h of approval | `onboarding_completed_at` set |
| Lead email connected rate | >80% at wizard completion | `email_accounts` row exists |
| Time to first lead | <24h after wizard complete | `customers.created_at` after `onboarding_completed_at` |
| Day 7 retention | >90% still active | session/activity check |
| Support tickets in first 30 days | <1 per dealer | `support_tickets` count |

---

## 11. Out of Scope (v1)

- Video walkthroughs / screen recordings
- In-app guided tours (tooltips)
- Automated phone call to new dealers
- White-label onboarding for enterprise dealers
- Multi-location onboarding (multiple orgs per dealer group)
