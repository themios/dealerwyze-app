# DealerWyze — Post-PRD Enhancements

Tracks features and improvements added outside the original SAAS_MASTER_PLAN.md scope.
Each entry includes the date, category, migration (if any), and what was built.

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
