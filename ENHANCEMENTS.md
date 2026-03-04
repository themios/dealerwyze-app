# DealerWyze — Post-PRD Enhancements

Tracks features and improvements added outside the original SAAS_MASTER_PLAN.md scope.
Each entry includes the date, category, migration (if any), and what was built.

---

## 2026-03-04 — Security Gap Closure (Session 3)

### Gap Closure: All Implementable P0 + P1 Controls
**Category:** Security
**Migration:** `045_security_caps.sql`

**Why:** After creating the comprehensive LAUNCH_SECURITY_ASSESSMENT.md, all code-implementable gaps were closed in one session. Config-only items (Retell dashboard, Stripe Radar, A2P 10DLC) remain as manual actions.

**What was built:**

#### Migration 045 — `supabase/migrations/045_security_caps.sql`
- `security_events` table: logs sig failures, rate-limit triggers, caller abuse anomalies (`event_type`, `ip`, `org_id`, `details JSONB`)
- `org_settings.voice_enabled BOOLEAN DEFAULT true` — kill switch per org
- `org_settings.voice_minutes_cap INT DEFAULT 60000` — 1,000 min × 60 sec monthly hard cap
- `org_settings.voice_minutes_month INT DEFAULT 0` — running monthly usage counter
- `org_settings.autofill_topups_today SMALLINT DEFAULT 0` — daily charge counter
- `org_settings.autofill_topups_month SMALLINT DEFAULT 0` — monthly charge counter

#### Voice Caps — `app/api/voice/retell-callback/route.ts`
- **Per-caller daily abuse detection**: counts `voice_calls` from same `from_number` in last 24h; if ≥2 → insert `security_events` (`caller_abuse`) + `admin_alerts`
- **Monthly minute cap**: after each call, sums all `duration_seconds` for current calendar month; if `totalSecs ≥ voice_minutes_cap` → sets `org_settings.voice_enabled = false` + `admin_alerts` (`voice_cap_reached`)
- **Retell sig failure logging**: on bad signature → insert `security_events` (`sig_failure`, provider: retell)

#### Stripe Sig Failure Logging — `app/api/stripe/webhook/route.ts`
- On signature failure → insert `security_events` (`sig_failure`, provider: stripe) before returning 400

#### SMS Velocity — `lib/sms/rateLimit.ts`
- MAX_PER_MINUTE tightened: **50 → 20** (per security plan spec)
- Added **300/day per org** check: counts outbound `activities` in last 24h — blocks with clear error message
- `checkRateLimit()` now returns `{ allowed, count, reason? }` — send route uses `reason` directly

#### Disposable Email Detection — `app/api/auth/register/route.ts`
- Added `DISPOSABLE_DOMAINS` Set (33 known throwaway providers: mailinator, guerrillamail, tempmail, yopmail, etc.)
- On signup: if `emailDomain` matches → insert `abuse_flags` (`disposable_email`, severity: medium) for admin review
- Non-blocking — doesn't prevent signup; admin sees flag at approval queue

**Confirmed as already done (were listed as gaps — not gaps):**
- Twilio `X-Twilio-Signature` HMAC-SHA1 verification: fully implemented in `app/api/twilio/inbound/route.ts` lines 23–87
- Fax file type validation (PDF/JPEG/PNG/TIFF): `app/api/fax/send/route.ts` line 11
- Fax max size (10 MB): `app/api/fax/send/route.ts` line 10
- SMS per-minute rate limit: already existed at 50/min (now tightened to 20)

**What still needs manual action (P0 — cannot be done in code):**
1. Retell dashboard: set max call duration = 180s, max turns = 12
2. Retell agent system prompt: add AI bot disclosure + call recording consent disclosure
3. Stripe dashboard: Radar rules — block if CVC fails, block if ZIP fails
4. Twilio Trust Hub: A2P 10DLC brand + campaign registration (3–5 business days)
5. Signup register page: add "I agree to Terms + AUP" clickwrap checkbox (frontend)

---

## Phase 3 — SaaS Multi-Tenancy (Per-Org Infrastructure)

### Per-Org Twilio Phone Provisioning (Phase 3A)
**Category:** Platform Ops / Integrations
**Migration:** none

**Why:** Each org needs its own Twilio phone number for SMS/voice — numbers can't be shared across tenants.

**What was built:**
- `app/api/admin/provision-phone/route.ts` — search + purchase available Twilio numbers OR accept BYON input; updates `organizations.twilio_phone_number`
- BYON path validates number format; purchase path searches local area then falls back to any US number
- Admin panel org detail — "Provision Phone" action button

**Design decisions:**
- Admin-only action (SuperAdmin provisions for each org at onboarding)
- Area code derived from org_settings phone if available

---

### Multi-Account Email Lead Sync (Phase 3B)
**Category:** Integrations
**Migration:** `023_email_accounts.sql` — `email_accounts` table

**Why:** Dealers use multiple email providers (Gmail, Yahoo, iCloud, Outlook) to receive leads. Single-account Gmail polling can't serve multi-tenant needs.

**What was built:**
- `email_accounts` table — per-org credential store (Gmail OAuth tokens or IMAP credentials)
- `lib/leads/pollImap.ts` — IMAP polling for Yahoo/iCloud/Outlook/generic accounts
- `app/api/integrations/gmail/connect/route.ts` + `/callback/route.ts` — Gmail OAuth flow storing tokens per org
- `app/api/cron/sync-leads/route.ts` — polls all `email_accounts` per org every 15 min via cron-job.org
- Settings page — "Email Integrations" card: OAuth button for Gmail; host/user/password form for IMAP

**Supported providers:** Gmail (OAuth), Yahoo, iCloud, Outlook, generic IMAP

---

### Per-Org Retell Voice Agent (Phase 3C)
**Category:** Platform Ops / Integrations
**Migration:** none

**Why:** Each org needs its own Retell AI agent with a different system prompt and phone number binding. A shared agent can't handle multi-tenant call routing.

**What was built:**
- `lib/voice/provision.ts` — `provisionVoiceAgent(orgId)`: creates Retell agent with org-specific system prompt, binds to org Twilio number, stores `retell_agent_id` on org_settings
- `app/api/admin/provision-voice/route.ts` — SuperAdmin triggers voice provisioning for an org
- Admin panel org detail — "Provision Voice" action (enabled when org has a phone number)

---

## Phase 4 — Admin Panel Foundations

### Support Ticket System (Phase 4B)
**Category:** Platform Ops / UX
**Migration:** `026_tickets.sql` — `support_tickets` + `support_ticket_messages` tables

**Why:** No support channel existed between dealers and DealerWyze staff — dealers had to email directly with no tracking.

**What was built:**
- `support_tickets` table — org_id, subject, body, status (open/in_progress/resolved/closed), priority (normal/high/urgent/low), created_by, timestamps
- `support_ticket_messages` table — threaded replies with `is_staff` flag; `first_staff_response_at` tracked for SLA
- `app/(app)/support/page.tsx` — dealer-facing: open ticket + view history + reply thread
- `app/(app)/admin/tickets/page.tsx` — staff view: all tickets with filters, reply, status/priority controls, SLA badge
- API: `GET/POST /api/support/tickets`, `GET/PATCH /api/support/tickets/[id]`
- "Support" link in BottomNav More page

---

## Phase 5 — Dealer Onboarding Wizard

### 5-Step Onboarding Wizard
**Category:** UX / Platform Ops
**Migration:** `027_onboarding.sql` — `onboarding_step` + `onboarding_completed_at` on `org_settings`

**Why:** New dealers signed up and immediately saw a blank CRM with no guidance. Drop-off was high before the first lead was entered.

**What was built:**
- 5-step wizard: Business Info → Plan Selection → Email Setup → Invite Team → Done
- `app/(app)/onboarding/page.tsx` — step-by-step client component; each step auto-saves to org_settings
- `app/(app)/layout.tsx` — redirects to `/onboarding` if `onboarding_completed_at` is null on first login
- `OnboardingChecklist` widget — shown on Today page for 7 days post-completion; 5 items (customer, email, SMS template, team member, plan); localStorage dismiss
- Plan step — tier feature comparison; Tier 1 never sees voice setup

**Design decisions:**
- `onboarding_completed_at` = null gate — single column, no extra tables
- `hasPlan` checks `organizations.stripe_customer_id` (not org_settings)
- Step progress saved immediately — page refresh doesn't lose progress
- Checklist dismiss via localStorage — no DB write per dismissal

---

## Phase 6 — Growth Features

### Lead State Machine + Pipeline Kanban (Phase 6A)
**Category:** UX / CRM
**Migration:** `028_lead_state.sql` — `lead_state` column + `advance_lead_state()` RPC

**Why:** Leads had no lifecycle tracking. Salespeople couldn't see where deals stood without reading every activity.

**What was built:**
- `lib/leads/states.ts` — `LEAD_STATE_CONFIG` + `PIPELINE_STATES` (8 states: new_lead → contacted → appointment_set → shown → negotiating → deal_made → financed → lost)
- `advance_lead_state()` Supabase RPC — returns BOOLEAN (false = blocked backward transition)
- `app/api/customers/[id]/state` PATCH — 409 on backward transition
- `LeadStateSelector.tsx` — dropdown badge with pipeline color; no UI desync on 409
- `/pipeline` page — horizontal kanban, 8 columns (dormant filtered out); drag-to-advance
- Pipeline tab in BottomNav
- Auto-advance: voice call detected → `contacted`; AI-detected appointment → `appointment_set`

**Design decisions:**
- State machine enforced at DB level via RPC (not just UI)
- Backward transitions blocked; forward-only except explicit admin overrides
- `dormant` state exists in DB but excluded from kanban view

---

### Facebook Marketplace Lead Capture (Phase 6B)
**Category:** Integrations
**Migration:** none (lead_source is free-text)

**Why:** Facebook Marketplace is a major lead channel for used-car dealers but FB shields buyer email/phone. Lead emails arrive from `facebookmail.com` with no standard format.

**What was built:**
- `lib/leads/parser.ts` — `parseFacebookMarketplaceLead()`: sender domain `facebookmail.com` as primary signal; body + subject pattern matching as secondary
- `lib/leads/poll.ts` — added `from:facebookmail.com` to Gmail search query

**Note:** FB shields buyer contact info. Lead name + vehicle interest are extracted; salesperson must reply via FB Marketplace directly.

---

### Lead Response Time Tracking (Phase 6C)
**Category:** CRM / Analytics
**Migration:** `029_response_tracking.sql` — `first_response_at`, `response_time_seconds` on `customers`

**Why:** Industry benchmark is <5 min lead response. No visibility into actual rep response times existed.

**What was built:**
- `first_response_at` + `response_time_seconds` stamped atomically in `app/api/sms/send/route.ts` using `.is('first_response_at', null)` guard (one-time stamp only)
- Cron Job 6 in `check-tasks` — fires once per lead when response time > 30 min via `response_alert` task dedup
- `ResponseTimeWidget.tsx` — avg 7-day response time; green (<5 min) / yellow (5–30 min) / red (>30 min); on Today page

---

### Per-Dealer Analytics Dashboard (Phase 6D)
**Category:** UX / Analytics
**Migration:** none

**Why:** Dealers had no visibility into their own performance. Admin analytics was staff-only.

**What was built:**
- `app/api/analytics/route.ts` — 6 sections via `Promise.allSettled`: leads funnel, SMS stats, voice calls, BHPH collection, response time, inventory; date range params
- `AnalyticsDashboard.tsx` — client component; preset pills (7/30/90/365d); CSS bar charts; CSV export
- `/analytics` route; `BarChart2` icon in Today TopBar

**Design decisions:**
- Funnel excludes lost/dormant (pure pipeline health)
- SMS shows Sent + Replied + Reply Rate (no "Delivered" — outbound delivery not reliably tracked)
- BHPH collection rate = `total_paid / loan_amount` (down_payment excluded per data model)

---

### Google Business Profile Review Alerts (Phase 6E)
**Category:** Integrations / UX
**Migration:** `030_gbp_reviews.sql` — `gbp_reviews` table, `UNIQUE(org_id, review_id)`, RLS

**Why:** Google reviews directly affect dealer reputation and local search ranking. No way to monitor or respond from within the CRM existed.

**What was built:**
- `lib/google/gbp.ts` — `fetchGbpReviews()` + `replyToGbpReview()` via `GMAIL_CALENDAR_REFRESH_TOKEN`
- `app/api/cron/poll-reviews/route.ts` — atomic INSERT (dedup via 23505 unique conflict); push notify on new reviews
- `app/api/reviews/[id]/reply/route.ts` — POST to GBP API + persist reply locally
- `ReviewCard.tsx` + `ReviewsSection.tsx` — star rating, color border, inline quick-reply
- Env vars: `GBP_LOCATION_ID` (uses `accounts/-` wildcard for `GBP_ACCOUNT_ID`)
- Cron: `/api/cron/poll-reviews` at 4-hour interval

**Note:** Requires `GMAIL_CALENDAR_REFRESH_TOKEN` with `business.manage` scope re-authorized.

---

### Inventory Auto-Sync to CarGurus + Facebook (Phase 6F)
**Category:** Integrations / Platform Ops
**Migration:** `031_inventory_sync.sql` — 6 feed sync stat columns on `org_settings`

**Why:** Dealers manually post inventory to CarGurus and Facebook separately, costing hours per week.

**What was built:**
- `lib/inventory/feeds.ts` — `getAvailableVehicles()` (price > 0 filter); `buildCarGurusCSV()`; `buildFacebookCSV()`
- Slug-based public feed routes: `/api/inventory/cargurus-feed/[slug]` + `/api/inventory/facebook-feed/[slug]` — 503 on DB error (never empty CSV)
- `app/api/cron/sync-inventory/route.ts` — smoke-test + row-count validation; preserves `synced_at` on partial error
- `vercel.json` cron: `5 10 * * *` (10:05 UTC ≈ 2 AM PT)
- Settings page — Inventory Feed Sync status card (last synced, vehicle count)

**CarGurus headers:** StockNumber, ExteriorColor, ImageURLs (camelCase, no spaces)
**Manual step:** Register slug-based feed URLs in CarGurus dealer portal + Facebook Business Manager

---

## 2026-02-28 — Platform Hardening + Voice Inventory

### Platform Hardening (Phase 7)
**Category:** Security / Reliability
**Migration:** `032_performance_indexes.sql` — 9 composite indexes (no CONCURRENTLY — Supabase-safe)

**Why:** Pre-launch security sweep revealed: no rate limiting, no webhook signature validation, no structured logging, slow queries on large orgs.

**What was built:**
- **Rate limiting** — `proxy.ts` in-process sliding window Map (60/30/10 req/min per IP by route tier); no Redis dependency
- **Twilio HMAC-SHA1** — `app/api/twilio/inbound/route.ts` validates `X-Twilio-Signature`; dual-auth: HMAC valid OR legacy `?secret=` (when `TWILIO_LEGACY_FALLBACK_ENABLED=true`); logs WARN on legacy fallback
- **Retell HMAC-SHA256** — `app/api/voice/retell-callback/route.ts`; hard-fails 503 if neither `RETELL_API_KEY` nor `RETELL_WEBHOOK_SECRET` set; signs `rawBody + timestamp` (no separator); handles ms vs. s timestamp magnitude detection
- **Structured logging** — `lib/logger.ts`: JSON → stderr; `fatal` fires push notification
- **Performance indexes** — 9 indexes: customers(org_id, created_at), activities(customer_id, created_at), tasks(org_id, due_date), bhph_payments(loan_id), and others

**Design decisions:**
- In-process rate limiting acceptable at current scale (single-region)
- `TWILIO_LEGACY_FALLBACK_ENABLED=true` transition aid — set to false after Twilio callback URL updated
- Logger wrapped in try/catch — logging failure never crashes route handlers

---

### Voice Agent Inventory Lookup + Vehicle Documents (Phase 8)
**Category:** Integrations / AI
**Migration:** `022_vehicle_docs.sql` — `vehicle_documents` table

**Why:** The Retell voice agent could answer basic questions but had no access to live inventory. Callers asking about specific vehicles got no useful answer.

**What was built:**
- `lib/voice/inventoryTools.ts` — `searchInventory()` (sanitized ilike, capped at 5 results); `getVehicleDetails()` (status=available only)
- `app/api/voice/tools/route.ts` — Retell `tool_call` webhook handler; event-type validated; orgId resolution with fallback
- `lib/voice/summarizeVehicleDoc.ts` — Claude Haiku Vision at upload time; explicit MIME allowlist; generates `voice_summary` text
- `app/api/vehicles/[id]/documents/route.ts` — upload → summarize → insert → recompute vehicle aggregate `voice_summary`
- Vehicle detail page — document upload UI + summary preview
- Storage bucket: `vehicle-docs` (create in Supabase dashboard)
- Retell config: Tool Call Webhook URL = `/api/voice/tools?secret=<LEADS_POLL_SECRET>`

**Retell tools:**
- `search_inventory` — params: make, model, year_min, year_max, max_price, min_price, color
- `get_vehicle_details` — param: stock_no

---

## 2026-03-01 — Nav, Fax, Contacts, SMS Tiers (Phases 6G–6J)

### Twilio Programmable Fax (Phase 6G)
**Category:** Integrations
**Migration:** `033_faxes.sql` — `faxes` table

**Why:** Some lenders, auction houses, and dealers still send/receive documents by fax. No fax capability existed.

**What was built:**
- `lib/fax/send.ts` — Twilio Programmable Fax send helper
- `app/api/fax/send/route.ts` — POST: send fax (to number + document URL)
- `app/api/fax/route/route.ts` — Twilio inbound fax routing webhook
- `app/api/fax/callback/route.ts` — Twilio status callback (delivered/failed)
- `app/(app)/fax/page.tsx` — send form + inbound/outbound fax history
- Storage bucket: `fax-docs`

---

### Contacts + Business Card Scanner (Phase 6H)
**Category:** UX / Integrations
**Migration:** `034_contacts.sql` — `contacts` table

**Why:** Sales staff collect business cards at auctions and events. No contact book separate from the lead/customer pipeline existed.

**What was built:**
- `contacts` table — org_id, name, company, title, phone, email, fax, address, notes, card_image_url
- `lib/contacts/vision.ts` — Claude Haiku Vision OCR for business card images; JSON field extraction
- `app/api/contacts/scan/route.ts` — POST multipart; OCR → pre-filled fields response
- `app/api/contacts/route.ts` — GET list + POST create
- `app/(app)/contacts/page.tsx` — contact list + scan button + manual add form
- Web Share API integration — share contact card from mobile
- Storage bucket: `contact-cards`

---

### Navigation Redesign (Phase 6I)
**Category:** UX
**Migration:** none

**Why:** BottomNav had grown beyond 5 primary items; mobile navigation was cluttered.

**What was built:**
- BottomNav reduced to 5 primary tabs: Today, Customers, Pipeline, Inventory, More
- Pipeline kanban toggle moved into `/customers` page header (list ↔ kanban view)
- "More" page — secondary links: Support, Fax, Contacts, Analytics, Settings
- Today TopBar cleaned up; `BarChart2` icon → `/analytics`

---

### SMS Tier Upgrades (Phase 6J)
**Category:** Billing
**Migration:** none (uses existing `organizations.sms_plan` column)

**Why:** Single SMS add-on tier ($14.99/1k) didn't scale for high-volume dealers.

**What was built:**
- `lib/stripe.ts` — `SmsTier` type: `smsTier1` (1k/$14.99) / `smsTier2` (3k/$29.99) / `smsTier3` (10k/$59.99)
- Billing page — three SMS tier upgrade cards with per-tier feature comparison

**Manual step:** Create 3 Stripe products at $14.99/$29.99/$59.99 and set env vars: `STRIPE_PRICE_ID_SMS_1K`, `STRIPE_PRICE_ID_SMS_3K`, `STRIPE_PRICE_ID_SMS_UNL`

---

## 2026-03-02 — DealerWyze Rebrand + Multi-Tenant SaaS Transition

### DealerWyze Rebrand + Full Multi-Tenant Conversion
**Category:** Platform Ops / Architecture
**Migration:** `035_slug.sql` + `035b_org_settings.sql` — slug on orgs, 12 new org_settings columns, `org_google_tokens` table; Apollo Auto org seeded

**Why:** The app was hard-coded with Apollo Auto data (phone, dealer name, TCPA messages). A true SaaS requires all per-dealer content served from org_settings.

**What was built:**
- Two Vercel projects: `apollo-crm` (staging at apollo-crm.vercel.app) + `dealer-wyze` (production at dealerwyze.com)
- `deploy-staging.sh` + `deploy-prod.sh` — manual deploy scripts; NO GitHub auto-deploy on production
- All hardcoded dealer data replaced with org_settings queries: `dealerName`, `dealerPhone`, `tcpaOptOutMsg`, `tcpaOptInMsg`
- BHPH messages use `dealerName` from org_settings via `MessageVars` interface
- Slug-based inventory feed URLs: `/api/inventory/cargurus-feed/[slug]` + `/api/inventory/facebook-feed/[slug]`
- Template tokens `{dealerName}` + `{dealerPhone}` wired into SMS/email template system
- `localStorage` keys renamed to `dealerwyze-*` prefix
- `org_google_tokens` table — per-org Google OAuth tokens (moved from shared env vars)
- `APOLLO_USER_ID` env var removed; `lib/orgs/lookup.ts` DB-only lookup

**Design decisions:**
- NO GitHub auto-deploy on production — all prod deploys are intentional manual pushes
- Staging = Tim's Apollo Auto tenant; production = multi-tenant SaaS platform
- Slug uniqueness enforced at DB level; used in public inventory feed URLs
- `accounts/-` wildcard used for GBP (no `GBP_ACCOUNT_ID` env var needed)

---

## 2026-03-03

### Data Export (Multi-Sheet Excel)
**Category:** UX / Compliance
**Migration:** none

**Why:** Dealers need a full data export for compliance, migration, or offline backup. No export mechanism existed.

**What was built:**
- `app/api/export/route.ts` — GET endpoint; queries 7 tables scoped to org, builds a multi-sheet XLSX workbook, returns as binary download. Gated behind `canAccessReports` (admin/manager only). Activities and ledger capped at 5000 rows.
- `components/settings/ExportDataButton.tsx` — client button with loading state; fetches `/api/export`, triggers browser download
- Settings page updated: "Export All Data" button added under the Reports section (admin-gated)
- `xlsx` (SheetJS) package added to `package.json`

**Sheets in export:**
- **Customers** — name, phone, email, lead source, pipeline state, tags, notes, response time
- **Vehicles** — stock #, VIN, year/make/model, price, status, sold info
- **Activities** — type, direction, outcome, body, duration, customer name (up to 5k rows)
- **BHPH** — loan details, payments, vehicle + customer name
- **Ledger** — date, vendor, amount, memo (up to 5k rows)
- **Tasks** — title, type, status, priority, due/completed dates, linked customer/vehicle
- **Contacts** — name, company, phone, email, fax, address

**Design decisions:**
- XLSX over ZIP-of-CSVs: single file, opens in Excel/Google Sheets with named tabs ("tabbed CSV" UX)
- No new date range filter — export is all-time (use analytics page for date-filtered views)
- `Promise.allSettled` so a single failing table never blocks the entire export
- Filename: `dealerwyze-export-YYYY-MM-DD.xlsx`

---

### Business Transfer / Ownership Transition
**Category:** Platform Ops / Tenant Lifecycle
**Migration:** `040_business_transfers.sql` — apply manually in Supabase SQL editor

**Why:** When a dealership is sold, the new owner needs to inherit all data (customers, BHPH
loans, inventory, history) without any manual DB work. No mechanism existed for this.

**What was built:**
- `business_transfers` table: tracks transfer lifecycle from initiation → claim → SuperAdmin approval → execution
- `POST/GET/DELETE /api/settings/transfer` — dealer admin initiates, views, or cancels a transfer
- `GET /api/transfer/[token]` — public endpoint: verifies token + returns data snapshot for new owner to review
- `POST /api/transfer/[token]` — authenticated: new owner claims the transfer
- `GET /api/admin/transfers` — SuperAdmin lists all pending transfers with enriched profile/org names
- `POST /api/admin/transfers/[id]/approve` — executes transfer: new owner → dealer_admin, old owner → deactivated
- `DELETE /api/admin/transfers/[id]/approve` — rejects and cancels transfer
- `app/(app)/settings/transfer/page.tsx` — two-state UI: initiate form (with data disclosure checklist) → active transfer with copyable claim URL
- `app/transfer/[token]/page.tsx` — public claim page showing data snapshot; new owner signs in and accepts
- `components/admin/PendingTransferQueue.tsx` — admin dashboard queue showing pending/ready-to-approve transfers
- "Transfer Business Ownership" link in Settings → Organization (Danger Zone section, dealer_admin only)
- `app/(app)/admin/page.tsx` updated to query + render pending transfers

**Flow:**
1. Dealer admin: Settings → Organization → Transfer Business Ownership
2. Enters new owner email + optional notes → gets copyable claim URL (14-day TTL)
3. New owner: opens URL → sees data counts (customers, vehicles, BHPH balance) → signs in → accepts
4. SuperAdmin: sees "Ownership Transfers" queue in `/admin` → reviews → approves
5. On approval: new owner becomes dealer_admin, old owner deactivated + signed out globally

**Design decisions:**
- Old owner fully deactivated (not downgraded) on completion
- New owner can be an existing DealerWyze user (multi-location ownership supported)
- Data stays in-place (same org_id) — only the dealer_admin profile changes
- Only 1 active transfer per org allowed at a time
- Token-based (no email sending infrastructure required) — dealer shares URL manually

---

### SaaS Multi-Tenant Conversion
**Category:** Platform Ops / Architecture
**Migration:** `039_roles.sql` — expand `profiles.role` enum to 7 values; apply manually in Supabase SQL editor
**PRD/Plan:** `SAAS_MASTER_PLAN.md` · `SAAS_CHECKLIST.md`

**Why:** The app was built for a single dealer (Apollo Auto) with all config in Vercel env vars. Converting to a true multi-tenant SaaS requires per-org data isolation, a 7-role permission model, a SuperAdmin control plane, and an org approval gate.

**What was built:**
- Migration `039_roles.sql` — expands `profiles.role` CHECK to `dealer_admin | dealer_manager | dealer_finance | dealer_rep | dealer_staff | admin | agent`; `admin`/`agent` kept as legacy aliases
- `organizations.approved_at` — NULL = pending approval; `approved_at IS NOT NULL` gate in middleware redirects unapproved orgs to `/pending`
- Application-layer RBAC — role enforcement in route handlers and server components; not RLS (all DB access is server-side)
- Platform staff impersonation — cookie `dealerwyze_staff_org_id` (2hr TTL); middleware enforces read-only; all mutations return 403
- `profiles.deactivated_at` — soft-delete for dealer users; assigned leads/data preserved on deactivation
- Settings UI — role management per org; SuperAdmin org management at `/admin/orgs`
- Env var cleanup — `APOLLO_USER_ID` removed; `lib/orgs/lookup.ts` DB-only; org-specific tokens moved to `org_google_tokens` table
- `SAAS_CHECKLIST.md` — 214-checkbox tracking document across 11 phases + external systems

**Flow:**
1. Dealer signs up → org created with `approved_at = NULL` → redirected to `/pending`
2. SuperAdmin reviews at `/admin` → approves → dealer gets access + approved email
3. Dealer admin adds team members → assigns roles (manager/finance/rep/staff)
4. Platform staff uses impersonation cookie to read any org; write attempts blocked

**Design decisions:**
- 7-role enum (not a permissions table) — sufficient complexity for a dealership; avoid over-engineering
- Approval gate via `approved_at` NULL check — one column, zero extra tables
- Read-only impersonation enforced at middleware level — no per-route changes needed
- Old owner fully deactivated (not downgraded) on business transfer completion
- SuperAdmin sentinel org UUID `00000000-0000-0000-0000-000000000001` — platform staff profiles point here

---

### Dealer Automated Onboarding
**Category:** Platform Ops / UX
**Migration:** `040_onboarding_emails.sql` — `onboarding_email_log` table + `onboarding_emails_unsubscribed` / `onboarding_unsubscribe_token` columns on `org_settings`
**PRD/Plan:** `ONBOARDING_PRD.md` · `ONBOARDING_EXECUTION_PLAN.md`

**Why:** New dealers need clear guidance on what to have ready before setting up DealerWyze, and what the DealerWyze team handles vs. what the dealer handles. No onboarding email sequence or `/pending` waiting-room page existed.

**What was built:**
- `lib/email/onboarding.ts` — complete email module: `buildOrgContext()`, `alreadySent()` idempotency guard, Resend send helper, 6 email functions (welcome, approved, setup-complete, day-3, day-7, day-14)
- Email triggers wired into: `app/api/auth/register/route.ts` (welcome), `app/api/admin/orgs/[id]/approve/route.ts` (approved), `app/api/settings/org/route.ts` (setup-complete)
- Cron Job 7 in `app/api/cron/check-tasks/route.ts` — drip sequence (day 3/7/14 relative to `approved_at`)
- `app/(app)/pending/page.tsx` — plan-aware waiting-room page with checklist of what the dealer needs to prepare
- Onboarding wizard refinements — plan-aware step gating (Tier 1 never sees voice setup)
- Admin visibility — `/admin/orgs` shows onboarding email log per org

**Flow:**
1. Dealer registers → welcome email sent immediately (what to have ready, what DealerWyze handles)
2. SuperAdmin approves → approved email sent → dealer gains access
3. Dealer completes key setup steps → setup-complete email triggered
4. Drip: day 3 (check in), day 7 (tips + common mistakes), day 14 (30-day plan)
5. Dealer can unsubscribe from drip via token link (welcome/approved emails always sent)

**Design decisions:**
- `alreadySent()` guard — idempotent sends; safe to re-trigger on retry
- Plan-aware email content — Tier 1 never sees voice setup instructions
- `after()` from `next/server` for non-blocking email sends (no latency impact on API routes)
- Unsubscribe via token link — no auth required, one-click opt-out from drip only
- Email provider: Resend (transactional, no cold-email risk)

---

### World-Class Admin Panel ✅ COMPLETE (2026-03-03)
**Category:** Platform Ops / Admin
**Migration:** `041_admin_alerts.sql` — apply manually in Supabase SQL editor

**Why:** The admin panel was a basic DB viewer. As DealerWyze scales past a handful of tenants, platform staff need at-a-glance health signals, proactive churn alerts, Stripe billing controls, support SLAs, and cron reliability monitoring — without leaving the app.

**What was built:**

#### Phase A — Org Health Dashboard
- `app/api/admin/orgs/route.ts` — enriched with `health_score` (0–100), `last_active_at` (via `auth.admin.listUsers`), `sms_used_pct`, `has_active_email`, `onboarding_done`, `suspended_at`
- Health score: +30 active sub, +20 login <7d, +20 has email, +15 onboarding done, +15 SMS used >10%, −40 past_due, −20 no login 14d
- `app/(app)/admin/page.tsx` — colored health dot (green ≥70 / yellow 40–69 / red <40) per org row; SMS progress bar; "No Email" badge; humanized `last_active_at`
- Red alert banner: "X alerts need attention" → `/admin/alerts`
- Cron health widget: 3 rows (check-tasks / sync-leads / poll-reviews) with status dot; red badge if >25h since last success

#### Phase B — Alert System
- `admin_alerts` table — `UNIQUE NULLS NOT DISTINCT (org_id, alert_type, resolved_at)` dedup; types: `trial_expiring | no_activity | past_due`; severity: `critical | warning`
- `app/(app)/admin/alerts/page.tsx` + `app/api/admin/alerts/route.ts` — unresolved alert list with Resolve button
- `app/api/admin/alerts/[id]/resolve/route.ts` — POST sets `resolved_at = NOW()`
- Cron Job 8 in `check-tasks` — idempotent `INSERT ... ON CONFLICT DO NOTHING` for trial_expiring (≤3d), past_due, no_activity (21d)

#### Phase C — Stripe Billing Controls
- `app/api/admin/orgs/[id]/route.ts` — GET returns last 12 Stripe invoices (when `stripe_customer_id` set); PATCH handles `set_trial_end`, `cancel_subscription`, `add_credit` via Stripe SDK
- `app/(app)/admin/orgs/[id]/page.tsx` — Stripe billing card: invoice history with PDF links and status badges; trial end date override; manual credit (amount + description); cancel at period end vs. cancel now

#### Phase D — Org Suspend / Unsuspend
- `organizations.suspended_at` + `organizations.suspension_reason` columns
- Suspend / Unsuspend action on org detail with confirm dialog + reason input; all actions audited
- `proxy.ts` — checks `suspended_at`; redirects to `/suspended` before the subscription gate
- `app/(auth)/suspended/page.tsx` — "Account suspended. Contact support@dealerwyze.com." with sign-out link

#### Phase E — Org Activity Feed + Feature Heatmap
- `app/api/admin/orgs/[id]/activity/route.ts` — merged timeline (activities + voice_calls + new leads, last 20 events); feature heatmap: Email Sync / Voice / Pipeline / BHPH / Analytics / Fax / Contacts (boolean: used in last 30d)
- Org detail page: timeline feed + color-coded feature pills (green = active in 30d, gray = unused)

#### Phase F — MRR Accuracy Fix
- `app/api/admin/analytics/route.ts` — `BASE_PLAN_MRR` (tier1=$49 / tier2=$99 / tier3=$249) + `SMS_ADDON_MRR` (smsTier1=$14.99 / smsTier2=$29.99 / smsTier3=$59.99); true composite MRR per org
- Added `arr` (MRR × 12) and `net_new_mrr_30d` to analytics response

#### Phase G — Ticket SLA
- `support_tickets.sla_breach_at` — computed on ticket creation: urgent=+2h, high=+8h, normal=+24h, low=+72h; backfilled for existing open tickets in migration
- `support_tickets.first_staff_response_at` — stamped on first staff reply (via PATCH action `reply`)
- `app/(app)/admin/tickets/page.tsx` — SLA countdown badge ("2h 15m left" / "SLA BREACHED" in red); red row highlight for breached tickets; breach count banner

#### Phase H — Audit Log Filters + CSV Export
- `app/api/admin/audit-log/route.ts` — `?org_id=`, `?admin_id=`, `?from=`, `?to=`, `?format=csv` query params; CSV: `Content-Type: text/csv` stream with escape-quoted fields
- `app/(app)/admin/audit-log/page.tsx` — org picker, date range inputs, Apply Filters, Export CSV button

#### Phase I — Cron Health Monitor
- `cron_runs` table — `job_name`, `started_at`, `finished_at`, `status` (`running | success | error`), `orgs_processed`, `error_msg`; indexed per job newest-first
- `lib/cron/runLogger.ts` — `startCronRun(jobName)` inserts row + returns ID; `finishCronRun(runId, status, orgsProcessed)` updates row; both non-fatal (wrapped in try/catch)
- All 3 crons wrapped: `check-tasks`, `sync-leads`, `poll-reviews`

**Flow (operator usage):**
1. SuperAdmin opens `/admin` → sees health dots, alert banner, cron status at a glance
2. Clicks alert banner → `/admin/alerts` → one-click Resolve
3. Opens org detail → sees Stripe invoices, feature heatmap, recent activity timeline
4. Suspends ToS violator → dealer redirected to `/suspended`
5. Opens `/admin/tickets` → SLA countdown badge per ticket; replies stamp `first_staff_response_at`
6. Opens `/admin/audit-log` → filters by org + date → exports CSV

**Design decisions:**
- `UNIQUE NULLS NOT DISTINCT` on `admin_alerts` — Postgres 15+ idiom; prevents duplicate open alerts while allowing re-open after resolution
- Health score server-computed in API (not stored) — avoids stale cache; fast enough for a list of <100 orgs
- `auth.admin.listUsers` for `last_sign_in_at` — only way to get this without exposing auth tables via RLS
- `proxy.ts` suspension gate sits before subscription gate — suspended orgs always redirected, even if paid
- Cron runLogger is non-fatal — logging failure never kills the actual job

---

### Visual Lead Scanner ✅ BUILT (2026-03-03)
**Category:** Integrations / UX
**Migration:** `042_scan_quotas.sql` — `monthly_scan_image_count` / `monthly_scan_pdf_count` on `organizations`; `increment_org_scan_counter` RPC; `ai_scan_log` table (apply manually in Supabase SQL editor)

**Why:** Lead ingestion is limited to recognized email patterns (CarGurus, AutoTrader, OfferUp, Facebook). Leads arriving as screenshots, photos, handwritten forms, PDFs, or SMS screenshots require manual entry — or get lost. The existing business card scanner proved the vision approach works; this extends it to lead capture.

**What was built:**
- `lib/leads/visionIngest.ts` — `LeadScanResult` interface (per-field `{ value, confidence }` with `high`/`medium`/`low`); `scanLeadImage()` (Claude Haiku); `scanLeadPdf()` (Claude Sonnet); JSON extractor; `scanResultToParsedLead()` converter to `ParsedLead`
- `lib/leads/scanQuota.ts` — `SCAN_QUOTA` config per tier; `checkScanQuota()` (monthly + daily burst via `ai_scan_log`); `incrementScanCount()` atomic via RPC
- `app/api/leads/scan/route.ts` — POST multipart file upload; quota check before AI call; 413/415/429 guarded; duplicate detection (phone + email); returns `{ scan, duplicate, isPdf }`
- `app/api/leads/create-from-scan/route.ts` — POST: applies user edits (overrides) on top of scan, calls `ingestLead()`, optional intro SMS via Twilio, async quota increment via `after()`
- `components/leads/LeadScanner.tsx` — 4-stage UI (pick → scanning → confirm → saving); `ConfBadge` per field (green ✓ / yellow ⚠ / red ✕); `ConfBanner` overall; duplicate warning ("View Existing" / "Add Anyway"); editable fields in confirm stage; `send_intro_sms` toggle
- `components/leads/ScanLeadButton.tsx` — Dialog wrapper with `ScanLine` icon trigger
- Customers page — `ScanLeadButton` added to TopBar right of `PasteLeadDialog`
- `app/api/stripe/billing-status/route.ts` — adds `monthly_scan_image_count` + `monthly_scan_pdf_count` to org select
- Billing page — AI Lead Scan Usage card with green/yellow/red quota bars for images + PDFs

**Quota limits by plan tier:**
| Tier | Monthly images | Monthly PDFs | Daily burst (images/PDFs) |
|------|---------------|--------------|--------------------------|
| Tier 1 (Basic) | 100 | 25 | 20 / 10 |
| Tier 2 (CRM+SMS) | 200 | 50 | 20 / 10 |
| Tier 3 (Voice) | 500 | 150 | 20 / 10 |

**Supported inputs:** Facebook/iMessage screenshots, photos of screens, business cards, handwritten forms, online application PDFs, multi-page credit apps (first 10 pages)

**Extracted fields:** first/last name, primary/secondary phone, email, city/state/ZIP, vehicle year/make/model/trim/budget/VIN, lead source (auto-detected from visual cues), notes, urgency signal, trade-in mention

**Flow:**
1. Salesperson taps "Scan Lead" on Customers page
2. Chooses Camera, Photos, or Files (images + PDFs accepted)
3. File uploaded to `/api/leads/scan` → quota checked → AI extracts fields (~3–5 sec)
4. Confirm screen: review fields with confidence badges; edit any field; see duplicate warning if match found
5. Tap "Save Lead" → customer created via `ingestLead()` → optional intro SMS sent

**Design decisions:**
- Haiku for images (fast + cheap), Sonnet for PDFs (better multi-page reasoning)
- Monthly + daily burst cap — prevents single-day abuse while allowing legitimate high-volume days
- Quota reset wired into existing `reset-billing-cycle` cron — no new cron job
- `after()` for async quota increment + log — no latency on save confirmation
- No new npm packages — Anthropic API native `document` content block handles PDFs directly
- Does not replace email lead ingestion — both run in parallel

---

## 2026-03-03 — Gap Analysis Fixes

### TCPA Opt-Out Enforcement in UI (G1 + G2)
**Category:** Legal / Compliance
**Migration:** none

**Why:** The server-side SMS send path already blocked opted-out customers, but two UI gaps remained: (1) the "Text" button in TemplatePicker was visible and clickable for opted-out customers, potentially confusing staff; (2) the native `sms:` URI path in TemplatePicker bypassed the API entirely (no opt-out check), and also incorrectly logged an activity before opening the Messages app.

**What was fixed:**
- `components/sms/TemplatePicker.tsx` — early return when `customer.sms_opt_out`: renders a disabled "SMS Off" button with `MessageSquareOff` icon instead of "Text". `handleOpenMessages()` also guards and returns early if opted out (prevents activity log + sms: link)
- `app/(app)/today/page.tsx` — new leads query now includes `sms_opt_out` field so TemplatePicker in NewLeadCard receives the correct value
- `components/leads/NewLeadCard.tsx` — customer type extended with `sms_opt_out?: boolean`

**Design decisions:**
- Disabled button (not hidden): staff can see the customer is blocked rather than wondering why there's no Text button
- Guard both paths (`sms:` URI + Twilio API) even though server blocks the API path — defense in depth

---

### Ticket Email Notifications (G29 + G30)
**Category:** Admin / Support
**Migration:** none

**Why:** Support staff had no notification when dealers submitted tickets. Dealers had no notification when staff replied. Both relied on manually checking the admin/support UI.

**What was built:**
- `lib/email/notify.ts` — `sendNotificationEmail({ to, subject, html, from? })`: lightweight Resend helper; non-fatal (no-ops if `RESEND_API_KEY` unset); fire-and-forget via `void`
- `app/api/support/tickets/route.ts` (POST) — after ticket creation, sends email to `SUPPORT_EMAIL` env var (fallback `support@dealerwyze.com`) with org name, priority, subject, message, and link to admin ticket page
- `app/api/admin/tickets/[id]/route.ts` (PATCH, action=reply) — after staff reply inserted, looks up ticket creator email via `supabase.auth.admin.getUserById(ticket.created_by)` and sends notification with reply body and link to `/support`

**Design decisions:**
- `void sendNotificationEmail(...)` — non-blocking; email failure never delays or fails the API response
- `SUPPORT_EMAIL` env var overrides default — allows routing to a ticketing system (Intercom, Freshdesk) later
- Only non-internal notes trigger dealer notification (internal_note action is staff-only by design)

---

### Task Assign-to-User UI (G13)
**Category:** CRM / Team
**Migration:** none

**Why:** The `assigned_to_user_id` column existed on the `tasks` table and the GET/PATCH API already supported it, but the POST API did not accept it and no UI existed to set it.

**What was built:**
- `app/api/tasks/route.ts` (POST) — `assigned_to_user_id` added to accepted body fields and inserted into tasks table
- `app/(app)/customers/[id]/CustomerDetailClient.tsx` — quick task row now loads team members (`profiles` table) when opened; adds an optional `<select>` assign dropdown (shown to admins only) below the title input; passes `assigned_to_user_id` to POST `/api/tasks`

**Design decisions:**
- Team members loaded lazily (on first open, cached in state) — no extra DB call on page load
- Assign picker shown only when `isAdmin` prop is true — reps don't assign tasks
- Optional (empty = unassigned) — same as current behavior when no assignee selected

---

### Communication Quota Verification (G4, G5, G6)
**Category:** Platform Ops / Billing
**Migration:** none

**Why:** Gaps listed in GAP_ANALYSIS.md — these were already implemented but not documented.

**What was verified:**
- `lib/sms/quota.ts` — `WARN_SOFT=0.80`, `WARN_HARD=0.95`. `MMS_CAP=50`. `checkQuota()` returns `warning_level` + `is_mms_blocked` + `reason`. `incrementUsage()` calls `increment_sms_usage` RPC with `p_is_mms` param
- `app/api/sms/send/route.ts` — `checkQuota()` called before every Twilio send; 402 returned on quota exceeded; `warning` field returned in response at 80%/95% thresholds

---

### Admin 2× Quota Alert (G22)
**Category:** Platform Ops / Admin
**Migration:** none

**Why:** ROADMAP Phase 7A deferred item — flag orgs using more than twice their monthly quota so platform staff can investigate potential abuse or recommend plan upgrades.

**What was built:**
- `app/api/cron/check-tasks/route.ts` Job 8 — allOrgs query now includes `monthly_message_count` + `sms_quota`. When `used > quota * 2`, inserts `alert_type='2x_quota_exceeded'` into `admin_alerts` (idempotent via unique constraint). Surfaces on `/admin/alerts`.

---

### Dunning Email on Payment Failure (G28)
**Category:** Billing / Retention
**Migration:** none

**Why:** When a Stripe payment fails, the org is marked `past_due` in DB but the dealer admin had no notification. Dealers may not realize they're at risk of access loss.

**What was built:**
- `app/api/stripe/webhook/route.ts` (`invoice.payment_failed`) — after marking org `past_due`, looks up `dealer_admin` profile for the org, fetches their auth email via `supabase.auth.admin.getUserById()`, fires `sendNotificationEmail()` with payment failure alert and CTA link to `/settings/billing`

**Design decisions:**
- Non-blocking (`void`) — email failure never fails the webhook response
- Only targets `dealer_admin` role (not managers/reps) — correct escalation path

---

### Data Retention — 90-Day Post-Cancel Purge (G9)
**Category:** Compliance / Platform Ops
**Migration:** `043_data_retention.sql` — adds `organizations.canceled_at TIMESTAMPTZ`

**Why:** GDPR/CCPA best practice and platform hygiene: tenant data should be hard-deleted after a reasonable post-cancellation window. Anonymized org + billing records are retained for revenue reporting.

**What was built:**
- Migration `043_data_retention.sql` — `organizations.canceled_at` column
- `app/api/stripe/webhook/route.ts` (`customer.subscription.deleted`) — stamps `canceled_at = NOW()` (only on first cancellation; doesn't overwrite if already set)
- `app/api/cron/check-tasks/route.ts` Job 9 — finds orgs with `subscription_status='canceled'` AND `canceled_at < 90 days ago`; deletes `activities`, `voice_calls`, `tasks`, `receipts`, `vehicles`, `customers`, `support_tickets`; anonymizes org row (`name='[deleted]'`, `slug='deleted-{id}'`). `admin_audit_log` and billing fields preserved.

**Design decisions:**
- 90 days grace period before deletion (3 months post-cancel policy)
- Org row anonymized rather than deleted — preserves billing/revenue history
- `admin_audit_log` explicitly NOT deleted — compliance record
- Job runs daily (idempotent — no-op once purged)

---

### Desktop / Responsive Interface ✅ COMPLETE (2026-03-03)
**Category:** UX
**Migration:** none

**Why:** DealerWyze was built as a 100% mobile PWA locked to `max-w-md` (428px) with zero responsive breakpoints. The dealership owner needs a richer dashboard experience on a larger screen — multi-panel Today view, sortable data tables, and side-by-side analytics — that the phone form factor can't support.

**Approach:** Progressive responsive upgrade using `lg:` (1024px) breakpoints. Mobile experience is 100% preserved. No new routes — all pages work at both screen sizes.

**What was built:**

#### Phase 1 — Layout Shell
- `app/(app)/layout.tsx` — removed hard `max-w-md` lock; now `max-w-md mx-auto` on mobile, `flex h-dvh w-full` on desktop; added `<DesktopSidebar>` + org name fetch; `pb-20 lg:pb-0` for BottomNav clearance
- `components/layout/DesktopSidebar.tsx` *(new)* — `hidden lg:flex` left sidebar (240px, brand dark blue `#0D2B55`); fetches `/api/auth/me` for role; role-aware nav: BHPH hidden for `dealer_rep`, Analytics hidden for non-manager/admin; active state: orange `#F07018` text + `bg-white/10`; DealerWyze logo + org name at top; platform admin link at bottom
- `components/layout/BottomNav.tsx` — added `lg:hidden` to nav element
- `components/layout/TopBar.tsx` — added `lg:border-b lg:border-[#1B4A8A]`

#### Phase 2 — Today Page (Owner Dashboard)
- `app/(app)/today/page.tsx` — KPI strip (`hidden lg:grid lg:grid-cols-5`): New Leads, Appt Requests, Voice Leads, Waiting, Overdue — computed from existing data fetches; 3-column grid (`lg:grid-cols-3`): Left (DealerBrief + ResponseTimeWidget + Reviews + OnboardingChecklist), Center (TodayContent lead feed), Right (TodoSection); each column `lg:overflow-y-auto lg:h-full` for independent scroll

#### Phase 3 — Analytics
- `app/(app)/analytics/AnalyticsDashboard.tsx` — `lg:grid lg:grid-cols-2 lg:gap-6` for main sections (Leads by Source + Response Time + SMS on left, Conversion Funnel + Voice on right); Revenue + BHPH side-by-side at `lg:` below; mobile single-column unchanged

#### Phase 4 — Customer List Data Table
- `components/customer/CustomersListClient.tsx` — mobile card list wrapped in `lg:hidden`; new `hidden lg:block` table with columns: Name (avatar initials), Phone, Source (label map), State (colored badge), Assigned (agent name), Last Active (time-ago), Response Time (green/yellow/red); clickable column headers for Name + Last Active wire to existing sort state; per-row archive confirm; floating assign bar adjusted to `bottom-4` on desktop; `agentMap` memo for O(1) agent lookup

#### Phase 5 — Admin Panel Tables
- `app/(app)/admin/page.tsx` — stats grid `grid-cols-2 → lg:grid-cols-6` (single strip); quick links `grid-cols-2 → lg:grid-cols-4`; org list: mobile cards wrapped in `lg:hidden` + `hidden lg:block` table (Health dot, Name + Suspended/No-Email badges, Status, Plan, SMS mini progress bar, Last Active, Billing date)

**Design decisions:**
- CSS-only breakpoints (no JS media query detection) — no hydration mismatch
- Both views share the same data and state — no duplicate fetches
- `lg:hidden` / `hidden lg:block` pattern — clean separation, no conditional rendering
- DesktopSidebar is a client component (needs `usePathname`) — fetches role from `/api/auth/me` (already exists)
- BottomNav and DesktopSidebar are mutually exclusive — never both visible simultaneously
- Fixed: `import dynamic from 'next/dynamic'` naming conflict with `export const dynamic = 'force-dynamic'` in `today/page.tsx` — renamed import to `nextDynamic`

---

## 2026-03-04 — Risk Guardbands (Pre-Launch Security)

### Risk Guardbands — Abuse Protection & Launch Controls
**Category:** Security / Platform Ops / Compliance
**Migration:** `044_risk_guardbands.sql` — apply manually in Supabase SQL editor

**Why:** Financial model identified 10 abuse vectors that could materially increase COGS or allow platform gaming. These guardbands close the highest-impact vectors before first paying customers.

**What was built:**

#### Schema (migration 044)
- `org_settings.autofill_enabled` — dealer pre-approves $20 overage top-ups
- `org_settings.autofill_approved_at / autofill_approved_via` — tracks approval method (email/sms/voice)
- `org_settings.feed_token` — rotatable hex token required for inventory feed access; backfilled for all existing orgs
- `organizations.quota_soft_notified_at` — prevents duplicate 80% quota emails per billing cycle
- `organizations.signup_email_domain / signup_phone_normalized` — indexed for re-signup detection
- `organizations.churn_risk_flagged` — boolean set at signup if prior canceled org detected
- `organizations.signup_fingerprint` — device fingerprint placeholder (12-month post-cancel retention)
- `abuse_flags` table — consolidated abuse event log (`bulk_export`, `churn_reregister`, `quota_abuse`, `feed_scrape`, `multi_org_duplicate`, `trial_abuse`)

#### Trial Protections
- `app/api/export/route.ts` — blocks XLSX data export for `trialing` orgs (prevents "use → export → cancel" abuse)
- `app/api/admin/provision-phone/route.ts` — blocks DealerWyze-provisioned numbers during trial; BYON (bring-your-own-number) still allowed

#### Quota Notifications (lib/sms/quota.ts)
- MMS cap updated from 50 → **200/mo** to match new plan specs
- 80% and 95% thresholds trigger transactional email to dealer admin (once per billing cycle via `quota_soft_notified_at`)
- Notification email includes auto-refill CTA and link to billing settings
- `admin_alerts` row inserted (`quota_80pct` / `quota_exceeded`) for platform visibility

#### Inventory Feed Token Auth (Vector 9)
- `cargurus-feed/[slug]/route.ts` + `facebook-feed/[slug]/route.ts` — if `feed_token` is set, requests without `?token=<hex>` return 401
- Rate limit tightened: 6 requests per 10 minutes per IP (was 10/min) — blocks minute-by-minute scrapers
- Dealers register their feed URLs with token in CarGurus/Facebook portals; token is rotatable from settings

#### API Scraping Protection (Vector 8)
- `proxy.ts` — `/api/customers` and `/api/vehicles` added to rate-limited routes (100 req/min per IP)
- `lib/security/abuseDetector.ts` — NEW: `trackBulkFetch(orgId, count)` sliding 10-minute window; if >500 records fetched → logs to `abuse_flags` + `admin_audit_log`
- Export route wires `trackBulkFetch` to detect automated mass-export patterns

#### Churn / Re-signup Detection (Vector 10)
- `app/api/auth/register/route.ts` — on new dealer signup, checks `signup_email_domain` and `signup_phone_normalized` against prior canceled orgs
- If match found: `churn_risk_flagged = true` on new org + `abuse_flags` row inserted (`churn_reregister`, severity: high)
- SuperAdmin sees the flag on the approval queue — can deny trial and require immediate billing

**Design decisions:**
- Autofill config columns added but Stripe charge logic is deferred — requires dealer to have payment method on file (billing settings UI); columns are ready for wiring
- Feed token is optional per-org (not enforced until token is set) — allows existing feed URLs to keep working; admin can set token on org detail page
- Churn detection is non-blocking — doesn't prevent signup, only flags for admin review at approval
- All abuse flags are in one table for a single admin view (`/admin/alerts` expanded to include `abuse_flags`)
- `quota_soft_notified_at` stamped atomically before email send — prevents race condition on concurrent SMS sends

**What still needs manual configuration:**
- Run migration `044_risk_guardbands.sql` in Supabase
- Update Terms of Service to include: email domain / phone tracking for churn detection, device fingerprinting, feed token requirement
- Set feed tokens for existing orgs via admin panel after migration
- Wire autofill Stripe charge in `settings/billing` UI (future sprint)
- Add `abuse_flags` view to `/admin/alerts` page (future sprint)

---

---

## 2026-03-04 — Plan Change + Security Hardening (Session 2)

### Inventory Feed Deprecation
**Category:** Platform Ops
**Migration:** none

**Why:** Inventory will be sourced from the dealer's own website (www.apolloauto-em.com) rather than published as CarGurus/Facebook CSV feeds. The feed routes are no longer needed.

**What was built:**
- `app/api/inventory/cargurus-feed/[slug]/route.ts` — replaced with 410 Gone stub
- `app/api/inventory/facebook-feed/[slug]/route.ts` — replaced with 410 Gone stub
- `proxy.ts` — removed feed-endpoint rate-limit entries (routes now return 410 before middleware matters)
- Earlier feed token auth + CDN cache headers are now moot; stubs return no data

---

### Security Hardening Round 2 (Gap Analysis vs SECURITY_ABUSE_MITIGATION_PLAN.md)
**Category:** Security
**Migration:** none (code-only)

**Why:** Reviewed the security plan document against all implemented controls and found three quick wins: CDN caching on feeds (pre-deprecation), auth rate limiting, and Stripe event idempotency.

**What was built:**
- `proxy.ts` — added login rate limit: `/api/auth/login` → 8 attempts per 5 minutes per IP (Vector 12: credential stuffing)
- `proxy.ts` — added signup rate limit: `/api/auth/register` → 3 signups per 10 minutes per IP (Vector 1: trial farming)
- `app/api/stripe/webhook/route.ts` — added in-process event idempotency using a TTL Map (15-min window); returns `{received:true, duplicate:true}` on retried events — prevents double-billing and double-email on Stripe retries

**Design decisions:**
- Login rate limit set at 8/5min (permissive enough for slow typists; blocks brute-force)
- Signup rate limit set at 3/10min (a single person legitimately needs at most 1; 3 allows some retries)
- Stripe idempotency is in-process only (single serverless instance); cross-instance dedup requires a DB-backed `stripe_event_log` table — documented as P1 gap

---

### Comprehensive Security Assessment + Compliance Documents
**Category:** Security / Compliance
**Migration:** none

**Why:** Pre-launch readiness requires a single authoritative document covering all risks, implementation status, regulatory requirements, and launch checklist. Also required complete overhaul of Terms of Service and Privacy Policy to reflect DealerWyze brand, new plan pricing, and new features.

**What was created/updated:**
- `/home/tim/Applications/ApolloCRM/LAUNCH_SECURITY_ASSESSMENT.md` — NEW comprehensive 12-vector risk register, compliance requirements (TCPA, A2P 10DLC, CCPA, CA §632 recording consent, CA BPC §17941 AI disclosure, FTC AI voice rules, PCI DSS scope, CFPB/BHPH), vendor risk, infrastructure checklist, incident response runbook, P0/P1/P2 launch checklist, financial exposure model, and 15 items the operator may have missed
- `apollo-crm/public/terms.md` — REWRITTEN: DealerWyze brand, $99.95/$199 pricing, BHPH disclaimer (not a lender), Voice AI disclosure requirements, §5.4 re-registration restriction, §7.4 usage caps/throttling, Auto-Refill terms, 90-day data retention, AUP expanded, indemnification expanded
- `apollo-crm/public/privacy.md` — REWRITTEN: DealerWyze brand, all 9 sub-processors documented (added Retell, Anthropic, Groq, Resend), fraud prevention fingerprinting disclosed, voice recordings section, 90-day retention, BHPH data disclosed, signup fingerprint data disclosed

**Key compliance gaps documented (P0 — must fix before launch):**
1. Twilio `X-Twilio-Signature` verification — check `app/api/twilio/inbound/route.ts`
2. Retell call duration cap (180s) + turn limit (12) — Retell dashboard config
3. AI Bot Disclosure at call start — update all Retell agent system prompts
4. Call recording consent disclosure — first utterance of every Retell call
5. Stripe Radar rules (CVC + ZIP) — Stripe dashboard config
6. A2P 10DLC brand + campaign registration — Twilio Trust Hub (3–5 days)
7. Cross-tenant isolation automated test — CI pipeline
8. Data breach notification runbook — written + team briefed

---

## Template

```
### [Feature Name]
**Category:** [UX / Platform Ops / Billing / Integrations / Security]
**Migration:** [filename or "none"]

**Why:** [1-2 sentence rationale]

**What was built:**
- [files created/modified]

**Flow:**
1. [step]

**Design decisions:**
- [key choices made]
```
