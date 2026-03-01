# Apollo CRM — SaaS Roadmap

## Product
Mobile-first CRM for small independent used car dealerships (owner + 2–4 staff, <100 cars).
Target price: **$49.95/month** (includes taxes). 14-day free trial.

## Tech Stack
- **Frontend:** Next.js 16 App Router, Tailwind CSS, Radix UI, shadcn/ui
- **Backend:** Supabase (Postgres + Auth + RLS), Vercel serverless
- **Billing:** Stripe Subscriptions + Checkout + Customer Portal
- **SMS:** Twilio (master account, provision per-dealer)
- **Email leads:** Gmail IMAP OAuth (per-dealer)
- **Push:** Web Push (VAPID)

## Multi-Tenant Architecture
- `org_id` = owner's `auth.users.id` — shared across all team members
- All data tables (`customers`, `activities`, `vehicles`, etc.) scoped by `user_id = org_id`
- `organizations` table: Stripe billing state per org
- `org_settings` table: Twilio phone, Gmail tokens, business info per org

---

## Phase 1 — SaaS Foundation ✅/🔄
*Goal: Any dealer can sign up, subscribe, and use the full product.*

| Task | Status |
|---|---|
| Stripe Checkout + webhook + portal | ✅ Done |
| `organizations` + `org_settings` DB tables | ✅ Done |
| Billing settings page | ✅ Done |
| Subscription gating middleware | 🔄 In progress |
| Per-org business settings form | 🔄 In progress |
| Admin tenant dashboard | 🔄 In progress |
| Post-signup → Stripe checkout redirect | 🔄 In progress |

---

## Phase 2 — Per-Dealer Integrations
*Goal: Each dealer has their own SMS number and Gmail connected.*

| Task | Notes |
|---|---|
| Twilio number provisioning | Buy number via Twilio API, store in org_settings |
| Route inbound SMS by org phone | webhook reads org_settings.twilio_phone_number |
| Gmail OAuth per dealer | OAuth flow, store refresh_token in org_settings |
| Settings UI: active integrations | Connect/disconnect buttons per integration |

---

## Phase 3 — Marketing & Launch
*Goal: Public-facing funnel, email lifecycle, referrals.*

| Task | Notes |
|---|---|
| Public landing page (/) | Currently redirects to /today |
| Pricing page | Single plan $49.95/month |
| Trial expiring emails | Resend/SendGrid — 3 days before, day of |
| Payment failed emails | With portal link to fix |
| Referral tracking | Simple UTM-based, track in organizations |

---

## Subscription Gating Rules
```
Allow through (no auth check):
  /login, /signup, /auth/*, /api/auth/*, /api/stripe/webhook

Require active subscription:
  All /(app)/* routes

Grace states:
  trialing + trial_ends_at in future → ALLOW
  trialing + trial_ends_at past     → redirect /settings/billing
  active                            → ALLOW
  past_due                          → ALLOW with banner warning
  canceled                          → redirect /settings/billing
  no org record                     → create org, redirect /settings/billing
```

---

## File Map (Key SaaS Files)
```
middleware.ts                          ← subscription gating (Phase 1)
lib/stripe.ts                          ← Stripe client + constants
app/api/stripe/
  checkout/route.ts                    ← create checkout session
  portal/route.ts                      ← billing portal redirect
  webhook/route.ts                     ← subscription lifecycle events
  billing-status/route.ts              ← current plan for UI
app/api/settings/
  org/route.ts                         ← GET/PATCH org + org_settings
app/(app)/settings/
  billing/page.tsx                     ← plan & billing UI
  organization/page.tsx                ← business info form (Phase 1)
app/(app)/admin/
  page.tsx                             ← tenant dashboard (admin only)
supabase/migrations/
  009_saas.sql                         ← organizations + org_settings
```

---

## Env Vars Reference
```
# Stripe
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...
STRIPE_PRICE_ID=price_1T5B27Df0XLMh0XGGaTO616O

# App
NEXT_PUBLIC_APP_URL=https://apollo-crm.vercel.app

# Twilio (master account — provisions per dealer)
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_MESSAGING_SERVICE_SID=MG...

# Gmail (Phase 2: moves to org_settings per dealer)
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
```

---

## Revenue Model

### Plans
| Plan | Price | Details |
|---|---|---|
| CRM | $49.95/mo | Full CRM, dealer uses own number |
| CRM + SMS Add-on | +$14.95/mo = $64.90 total | Managed Twilio number + 1,000 msgs/mo |
| Overage | $0.03/msg | Auto-billed via Stripe invoice item |

### SMS Cost Structure
- 95% SMS × $0.011/msg + 5% MMS × $0.025/msg + $1.15 number = ~$12.85/mo at max (1,000 msgs)
- Average dealer uses 400–600 msgs/mo → ~$6.80 cost → ~$8.15 profit on add-on
- Overage at $0.03/msg is highly profitable (cost ~$0.013)

### Stripe Products
- Base: STRIPE_PRICE_ID (CRM, $49.95/mo)
- SMS Add-on: STRIPE_SMS_PRICE_ID (SMS, $14.95/mo) — separate subscription item

### Projections
- 10 dealers (50% on SMS): ~$750/mo
- 50 dealers (50% on SMS): ~$3,750/mo
- 100 dealers (50% on SMS): ~$7,500/mo

## Twilio Sub-Account Strategy
- Each dealer on SMS add-on gets a Twilio sub-account (isolated, own A2P brand)
- You fund sub-accounts from master account
- Monthly cron: query Twilio Usage Records API per sub-account
- If usage > 1,000 msgs: create Stripe invoice item for overage at $0.03/msg
- Dealer sees itemized bill: base plan + SMS add-on + any overage

## Document Storage
- Supabase Storage bucket: customer-docs (private)
- Per-dealer scoped by org_id in file path
- 2GB soft limit per dealer
- Types: JPEG, PNG, WebP, PDF — max 10MB per file
- Labels: Driver's License, Insurance Card, Vehicle Title, Bill of Sale, Other
