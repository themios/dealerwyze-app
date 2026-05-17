# Apollo CRM — Enhancements log

Shipped product changes with migration pointers and rationale. See also `docs/enhancements.md` for the broader backlog.

---

## 2026-05-17 — Multi-location post-audit hardening (Codex audit follow-up)

- **Category:** Quality / Multi-location
- **Migration:** none
- **Why:** Codex re-audit found four functional gaps and two test/doc gaps versus the multi-location PRD. All addressed.
- **What was fixed:**
  - **HIGH** `app/api/customer-sequences/route.ts` — `POST` now enforces the unresolved-lead 422 gate (matching bulk-enroll). Multi-location orgs with no `location_id` on the customer are blocked from sequence enrollment.
  - **MEDIUM** `lib/voice/ingest.ts` — Voice confirmation SMS now resolves outbound identity via `resolveLeadOutboundIdentity` (location name/phone when available, org fallback when not). Previously used `org_settings` directly.
  - **MEDIUM** `components/customer/LeadLocationBlockingModal.tsx` — Converted from `fixed inset-0` full-screen overlay to an inline amber banner. Notes, activity history, and parsed lead content are now readable beneath it per PRD Phase 6 "must allow" requirement. PRD-exact copy restored: heading `"Assign a location to continue"`, body `"This lead must be linked to a store…"`.
  - **LOW** `app/api/settings/locations/[id]/staff/route.ts` — Response now returns `{ location: { id, name, address, phone, is_active }, staff: [...] }` per PRD Phase 8 contract.
  - **LOW** `lib/__tests__/multi-location-routes-tenancy.test.ts` — Tests strengthened: enrollment gate tests now verify 201 + `ok: true` through a full mock chain (not just `not 422`); web lead test now asserts both `applyLeadLocationDetection` and `applyAutoLeadAssignment` invoked. Suite: 2 files, 18 tests.
  - **DOC** `docs/multi-location-project-plan.md` — Phase 5/6/8/10 checklists updated with post-audit fix notes; Phase 10 `console.log` checkmark corrected to unchecked with a note that `lib/voice/ingest.ts` and `lib/social/autoPost.ts` still have operational logs to review.

---

## 2026-05-17 — Platform email log

- **Category:** Platform admin
- **Migration:** `supabase/migrations/164_platform_email_log.sql`
- **Why:** Admin panel needs a full comms history of system-to-dealer emails (follow-ups, onboarding nudges, etc.).
- **What was built:**
  - `platform_email_log` table — `id`, `org_id`, `to_email`, `subject`, `email_type`, `sent_at`; indexed on `(org_id, sent_at DESC)`.
  - Backfill from `admin_alerts` dedup markers for the four existing email types (`dealer_followup_d1/d3/d7`, `onboarding_nudge`).

---

## 2026-05-16 — Multi-location Phase 10: cleanup, audit logs, and tests

- **Category:** Quality / Multi-location
- **Migration:** none
- **Why:** Harden multi-location rollout with audit trails, tenancy checks, and automated coverage per project plan.
- **What was built:**
  - `lib/locations/logLocationAudit.ts` — audit_log + org_audit_log for location/staff/lead mutations.
  - Audit hooks on settings locations POST/PATCH/DELETE, staff PATCH, customer location PATCH, team user location PATCH.
  - `lib/locations/uiRules.ts` — shared multi-location UI visibility helpers.
  - `lib/__tests__/multi-location.test.ts`, `lib/__tests__/multi-location-routes-tenancy.test.ts` — plan-listed scenarios + API tenancy.

---

## 2026-05-16 — Multi-location Phase 9: team settings location assignment

- **Category:** UX / Multi-location
- **Migration:** none
- **Why:** Admins need to see and change which store each team member belongs to without altering role management.
- **What was built:**
  - `app/api/admin/users/route.ts` — returns `location_name` per user and `active_locations` list.
  - `app/api/admin/users/[id]/location/route.ts` — PATCH `profiles.location_id` (null = none).
  - `app/(app)/settings/users/page.tsx` — location label per row; admin/owner shows "All locations"; change-location picker (active locations + None).

---

## 2026-05-16 — Multi-location Phase 8: settings location manager

- **Category:** UX / Multi-location
- **Migration:** none
- **Why:** Replace JSONB location editor with `dealer_locations` table CRUD and per-location staff assignment; stop writing to `org_settings.locations`.
- **What was built:**
  - `app/api/settings/locations/route.ts`, `[id]/route.ts`, `[id]/staff/route.ts` — GET/POST/PATCH/DELETE (soft) + staff assign/remove on `profiles.location_id`.
  - `lib/settings/locationsAdmin.ts`, `lib/settings/locationsTypes.ts` — admin auth + shared types.
  - `components/settings/LocationsManager.tsx`, `app/(app)/settings/locations/page.tsx` — location cards, add form, staff picker.
  - `lib/settings/config.ts` — Settings → Locations nav item.
  - Removed `LocationsSection.tsx` from Organization settings; `app/api/settings/org/route.ts` no longer PATCHes JSONB `locations`.

---

## 2026-05-16 — Multi-location Phase 7: customer list location filter

- **Category:** UX / Multi-location
- **Migration:** none
- **Why:** Multi-location orgs need to filter the leads list by store; single-location orgs must not see location UI.
- **What was built:**
  - `app/api/customers/route.ts` — GET accepts optional `location_id` (UUID or `unassigned`).
  - `lib/customers/listQuery.ts` — shared location filter + org location validation.
  - `app/(app)/customers/page.tsx` — server list filtered via `?location_id=`; fetches active locations for chips.
  - `components/customer/CustomersListClient.tsx` — pill filter: All locations, each store, Unassigned (multi-location only).

---

## 2026-05-16 — Multi-location Phase 6: lead detail location badge and picker

- **Category:** UX / Multi-location
- **Migration:** none
- **Why:** Multi-location orgs must assign a store on lead detail before assignment and outreach; single-location orgs see no location UI.
- **What was built:**
  - `app/api/customers/[id]/location/route.ts` — PATCH sets `location_id` + `location_source = 'manual'`.
  - `components/customer/LeadLocationBadge.tsx`, `components/customer/LeadLocationBlockingModal.tsx` — badge, edit picker, blocking modal with spec copy.
  - `app/(app)/customers/[id]/page.tsx`, `CustomerDetailClient.tsx` — `isMultiLocation` from active locations count; blocks assign/SMS/email/sequences until location set.
  - `components/customer/AssignDropdown.tsx`, `components/sms/TemplatePicker.tsx`, `components/customer/EmailButton.tsx`, `components/sequences/AutoresponderCard.tsx` — `locationBlocked` prop.

---

## 2026-05-16 — Multi-location Phase 5: outbound identity in templates and messages

- **Category:** Integrations / Multi-location
- **Migration:** none
- **Why:** SMS, email, sequences, and compose UIs should use location name/phone/address/inventory URL when `customers.location_id` is set, with org-level fallback.
- **What was built:**
  - `lib/locations/templateVars.ts`, `lib/locations/getLeadTemplateVars.ts` — `resolveLeadOutboundIdentity` wired into template var maps (spec + legacy placeholder names).
  - `app/api/customers/[id]/outbound-vars/route.ts`, `hooks/useLeadTemplateVars.ts` — location-aware vars for client compose.
  - `lib/email/sendSequenceEmail.ts`, `app/api/cron/send-sequences/route.ts`, `lib/sequences/sendAutoResponseStep1.ts`, `lib/sms/sendConsent.ts` — server-side substitution.
  - `lib/calendar/confirmAppointment.ts`, `lib/cron/jobs/appointmentRemindersV2.ts`, `app/api/customers/review-request/route.ts`, `lib/cron/jobs/reviewRequests.ts`, `app/api/leads/create-from-scan/route.ts` — customer-facing dealer name from identity.
  - `components/sms/TemplatePicker.tsx`, `components/customer/EmailButton.tsx` — manual SMS/email compose uses per-lead outbound vars.

---

## 2026-05-16 — Multi-location Phase 4: location-aware lead assignment

- **Category:** Leads / Multi-location
- **Migration:** `supabase/migrations/160_location_rr_index.sql`
- **Why:** Round-robin and manual pickers must respect store location; unresolved multi-location leads stay unassigned until a human sets location.
- **What was built:**
  - `supabase/migrations/160_location_rr_index.sql` — `dealer_locations.round_robin_index` for per-location rotation.
  - `lib/leads/assignLead.ts` — multi-location round-robin uses location staff pool + `round_robin_index`; unresolved skips assignment; single-location unchanged (`org_settings.lead_assignment_rep_index`).
  - `lib/leads/filterAssignableMembers.ts` — filters manual assignee pickers by lead `location_id`.
  - `lib/leads/ingest.ts` — location detection before `applyAutoLeadAssignment`.
  - `components/leads/AssigneeBadge.tsx`, `components/customer/AssignDropdown.tsx`, customers list/detail pages — location-scoped picker when multi-location.

---

## 2026-05-16 — Multi-location Phase 3: lead ingest auto-detection

- **Category:** Integrations / Leads
- **Migration:** none (uses `157_dealer_locations.sql`, `158_location_id_columns.sql` from Phase 1)
- **Why:** Automatically assign `location_id` on new leads when the channel provides enough signal; send a one-time generic SMS for unresolved multi-location leads without blocking ingest.
- **What was built:**
  - `lib/leads/detectLeadLocation.ts` — detection order (`inbound_sms` → `email_parsed` → `auto_single`), customer update, one-time fallback SMS via org `twilio_phone_number`.
  - `lib/leads/ingest.ts` — calls `applyLeadLocationDetection` after customer row exists; optional `location` context on `IngestLeadOptions`.
  - `lib/leads/poll.ts`, `lib/leads/pollImap.ts`, `lib/gmail/processHistory.ts` — pass email subject/body into ingest; direct Gmail customer insert wired.
  - `app/api/leads/paste/route.ts`, `app/api/twilio/inbound/route.ts` — location detection on paste and Twilio inbound paths.

---

## 2026-05-15 — Dealer communication system: onboarding sequence, owner notifications, weekly AI digest

- **Category:** Growth / Retention / Operator Tooling
- **Migration:** none (uses existing `admin_alerts` table for dedup)
- **Why:** New dealers were receiving no emails after signup due to an unverified Resend domain. Rebuilt the full dealer communication layer and added platform owner visibility into signups, stale accounts, and at-risk orgs.
- **What was built:**
  - `lib/email/onboarding.ts` — refactored all dealer email templates with shared `sig()`, `footer()`, and `helpCta()` helpers. Consistent Tim Harmantzis signature with phone and dealerwyze.com link on every email. No em dashes. Plain conversational English aligned with Million Dollar Message tone guidelines.
  - `buildDayThreeFollowUpHtml`, `buildDaySevenFollowUpHtml` — new D+3 check-in and D+7 re-engage templates added to onboarding.ts.
  - `lib/cron/jobs/dealerFollowUps.ts` — D+1 day-one tips, D+3 check-in (if onboarding incomplete), D+7 re-engage (if onboarding incomplete). Deduplicated via `admin_alerts`. Fires one step per org per cron run.
  - `lib/cron/jobs/platformOwnerDigest.ts` — daily digest to `PLATFORM_OWNER_EMAIL`: new signups (48h), stale dealers (onboarded but 5+ days inactive), at-risk/critical orgs by attrition score. Skips if nothing to report. Deduplicated once per calendar day.
  - `lib/cron/jobs/weeklyOwnerSummary.ts` — Monday 9am PT AI-generated SaaS health briefing. Collects 7-day metrics (signups, active orgs, subscription breakdown, onboarding completion, attrition), calls Claude Haiku for a plain-English narrative, sends structured email with at-a-glance stats.
  - `app/api/cron/weekly-summary/route.ts` + `vercel.json` cron `0 17 * * 1` — dedicated Monday cron route.
  - `app/api/auth/register/route.ts` — enriched platform owner signup notification with dealer email (mailto link), phone (sms link), and "Email now / Text now / Admin panel" action buttons.
  - Both new cron jobs wired into `app/api/cron/check-tasks/route.ts`.
- **Env vars required:**
  - `PLATFORM_OWNER_EMAIL=support@dealerwyze.com`
  - `RESEND_FROM_DOMAIN=dealerwyze.com`
- **Infrastructure fixed:** `dealerwyze.com` verified in Resend. Cloudflare Email Routing configured for `support@`, `tim@`, `reviewer@`, `info@`, `noreply@` — all forwarding to `dealerwyze@gmail.com`.

---

## 2026-05-08 — Admin observability: platform health, feature adoption, backup download, deleted-customer search

- **Category:** Observability / Admin / Reliability
- **Migration:** `supabase/migrations/150_data_recovery_archive.sql`, `supabase/migrations/151_recovery_log.sql`
- **Why:** Ship the monitoring + admin observability + backup workflow per the hardening standard (no PII in analytics/logs) and add admin tooling for recovery + backups.
- **What was built:**
  - `app/api/admin/platform-health/route.ts`, `app/(app)/admin/platform-health/page.tsx` — platform health API + UI (Sentry issues/volume + internal counts).
  - `app/api/admin/feature-adoption/route.ts`, `app/(app)/admin/feature-adoption/page.tsx` — PostHog query API aggregation + adoption UI.
  - `app/api/admin/orgs/[id]/health/route.ts` — per-org system health API (last active, recovery pending, Sentry issues).
  - `app/api/admin/data-recovery/search/route.ts`, `app/(app)/admin/data-recovery/page.tsx` — “Find Deleted Customer” search across all orgs and restore action.
  - `app/api/admin/backup-download/route.ts`, `app/(app)/admin/backup-status/page.tsx` — signed R2 download URLs + download buttons.
  - `.github/workflows/db-backup.yml`, `lib/backup/r2Client.ts`, `docs/BACKUP_RESTORE.md` — nightly encrypted backups + R2 client + restore docs.
  - `app/api/health/route.ts`, `app/layout.tsx` — uptime endpoint and Vercel Speed Insights/Analytics.

## 2026-05-06 — Leads list: faster filter/sort (memo + transitions)

- **Category:** Performance / UX
- **Migration:** none
- **Why:** DevTools reported long `change` handlers (700ms+) when changing Stage/Intent/sort on large lead lists; work was repeated every render and blocked the main thread.
- **What was built:**
  - `components/customer/CustomersListClient.tsx` — memoized filtered/sorted lists and option counts (single pass over `afterRepFilter`); `startListTransition` for Stage, Intent, sort, direction, and associate `<select>` so updates don’t block the native control’s `change` event.

## 2026-05-06 — Leads list: Stage + Intent as dropdowns (one row)

- **Category:** UX
- **Migration:** none
- **Why:** Reduce clutter at the top of the Leads (`/customers`) screen by collapsing pipeline and intent filters from two scrolling chip rows into side-by-side selects that still show counts inside each option.
- **What was built:**
  - `components/customer/CustomersListClient.tsx` — Stage + Intent labeled selects; `customerMatchesIntentFilter` helper; “Any intent” label for the all-intent option.

## 2026-05-06 — Intelligence: richer inventory recommendations (market comps + target price)

- **Category:** Intelligence / UX
- **Migration:** none
- **Why:** Make inventory recommendations concrete: include fair market value/range, comps count, and a suggested test price + next actions, instead of generic “consider a price drop.”
- **What was built:**
  - `lib/intelligence/recommendations.ts` — inventory rules now use `vehicles.market_data_json` + `lib/pricing/pricingAssessment.ts` to generate FMV-aware, action-oriented copy (target price test, merchandising + follow-up playbook).

## 2026-05-05 — Intelligence DMAIC Phase 3: recommendations engine + UI

- **Category:** Intelligence / UX / API
- **Migration:** `supabase/migrations/146_recommendations.sql`, `supabase/migrations/147_org_settings_performance_cache.sql`
- **Why:** Persist actionable intelligence as dismissible recommendations; surface org-wide alerts on Today and vehicle-specific banners on VDP; nightly cron generates and upserts rows.
- **What was built:**
  - `supabase/migrations/146_recommendations.sql` — `recommendations` table, indexes, RLS aligned with org-scoped auth pattern.
  - `supabase/migrations/147_org_settings_performance_cache.sql` — `org_settings.performance_cache` jsonb for timing-rule inputs.
  - `lib/intelligence/recommendations.ts` — rule engine, purge/insert, `generateRecommendationsForOrg`.
  - `app/api/intelligence/recommendations/route.ts` — GET list; `recommendations/[id]/dismiss`, `recommendations/[id]/acted` — POST state updates.
  - `components/intelligence/IntelligenceAlerts.tsx` — client fetch on mount, dismiss/acted actions.
  - `app/(app)/today/TodayContent.tsx` — alerts above main Today content.
  - `app/(app)/vehicles/[id]/page.tsx` — server-side vehicle rec fetch in `Promise.all`, read-only banner when active.
  - `lib/cron/runDailyIntelligence.ts` — calls `generateRecommendationsForOrg`, returns `recommendations_written`.

## 2026-05-05 — BHPH Phase 3: Two-tier reminders + PAID / manual P2P

- **Category:** Finance / UX / Integrations
- **Migration:** `supabase/migrations/144_bhph_manual_payment_settings.sql`
- **Why:** SMS reminders with card + ACH + P2P copy; inbound PAID workflow; dealer confirmation API and UI; org-level payment-method toggles.
- **What was built:**
  - Migration `144_bhph_manual_payment_settings.sql`; `lib/bhph/messages.ts` + `send.ts`; `app/api/bhph/remind/route.ts`; `app/api/bhph/webhook/route.ts` PAID handling; `confirm-manual-payment` API; `settings/bhph-payment-methods` API; organization `BhphPaymentMethodsSection`; BHPH detail pending banner + confirm flow; tests under `lib/__tests__/bhph/`.

## 2026-05-05 — BHPH ACH Phase 1 (Financial Connections + auto-pull)

- **Category:** Finance / Payments / Integrations
- **Migration:** `supabase/migrations/143_bhph_ach.sql`
- **Why:** ACH direct debit for monthly BHPH installments; signed SMS setup links; separate Stripe webhook; ledger-only failed pulls.
- **What was built:**
  - Migration `143_bhph_ach.sql` — contract ACH fields, `bhph_payment_methods`, `failed_ach` + `record_bhph_manual_payment` extension.
  - `lib/bhph/achSetupToken.ts`, `twilioOutbound.ts`, `achPull.ts`; API routes `setup-ach`, `confirm-ach`, `send-ach-prompt`; `app/api/stripe/bhph-ach/route.ts`; `remind` ACH pass; public `app/pay/ach/[token]`; BHPH detail payment method UI; env validation; tests under `lib/__tests__/bhph/`.

## 2026-04-30 — Dealer Security Audit Log + GET /api/audit

- **Category:** Security / Compliance / UX
- **Migration:** none
- **Why:** Surface `audit_log` to dealers with filters and nav; shared API for legacy org audit rows.
- **What was built:**
  - `app/api/audit/route.ts`, `lib/audit/clampAuditDays.ts`, `app/(app)/admin/security-audit/*`, `components/layout/DesktopSidebar.tsx`, `lib/auth/dealerRoles.ts`, tests under `lib/__tests__/audit/`.

## 2026-04-30 — BHPH Phase 2: payment UI, sale interest/principal seed, ledger API

- **Category:** Finance / UX (BHPH)
- **Migration:** `supabase/migrations/142_bhph_sale_interest_principal.sql`
- **Why:** Contract detail UX for APR/principal/interest paid, in-app manual payments, ledger history, and seeding interest + principal on new BHPH sales.
- **What was built:**
  - `supabase/migrations/142_bhph_sale_interest_principal.sql`, `app/api/bhph/create/route.ts`, `app/api/bhph/[id]/ledger/route.ts`, BHPH detail + `MarkSoldSheet` updates, `lib/__tests__/bhph/ledger-route.test.ts`.

## 2026-04-30 — BHPH: interest accrual, append-only ledger, manual payments

- **Category:** Finance / Payments (BHPH)
- **Migration:** `supabase/migrations/141_bhph_interest_ledger.sql`
- **Why:** Annual interest allocation, principal tracking, immutable payment history, and in-person/cash recording without Stripe.
- **What was built:**
  - `supabase/migrations/141_bhph_interest_ledger.sql` — contract columns; `bhph_payment_ledger`; `finalize_bhph_payment_v1` + new `finalize_bhph_payment`; `record_bhph_manual_payment`.
  - `lib/bhph/interestAllocation.ts`, `types/index.ts` updates, `app/api/bhph/[id]/payment/route.ts`, pay route payment date, `lib/auth/profile.ts` `normalizeOwnerRole`.
  - Tests under `lib/__tests__/bhph/` (interest, manual route, finalize integration).

## 2026-04-30 — Service-role: ingest, social tokens, autoPost, org lookup

- **Category:** Security
- **Migration:** none
- **Why:** Tighter org boundaries for ingest, OAuth token persistence, auto-post, and webhook org resolution queries.
- **What was built:**
  - `lib/leads/ingest.ts`, `lib/social/tokenRefresh.ts`, `lib/social/autoPost.ts`, `lib/orgs/lookup.ts` — guards / bounded queries as above; `lib/sms/quota.ts` unchanged (already single client in `checkQuota`).

## 2026-04-30 — Push subscriptions: org_id NOT NULL + send tests

- **Category:** Security / Privacy
- **Migration:** `supabase/migrations/140_push_subscriptions_org_id_not_null.sql`
- **Why:** Cross-org lead push must be impossible at the DB and query layer; orphans without a profile org must not keep ambiguous rows.
- **What was built:**
  - `supabase/migrations/140_push_subscriptions_org_id_not_null.sql` — `org_id` FK/backfill/cleanup/`NOT NULL`/index (extends 108).
  - `lib/__tests__/push/send-lead-notification.test.ts` — org-scoped query and no leak to another org’s subscription.

## 2026-05-05 — DealerWyze v1.1 Phase 5: audit_log, writeAuditLog, deploy checklist + CLAUDE audit policy

- **Category:** Security / Operability
- **Migration:** `supabase/migrations/139_audit_log.sql`
- **Why:** Central append-only audit trail and documented release gates for v1.1 hardening.
- **What was built:**
  - `supabase/migrations/139_audit_log.sql`, `lib/audit/log.ts`, wiring across impersonation, BHPH confirm, export, settings, role change, Twilio/cron/Gmail webhook failures.
  - Tests under `lib/__tests__/audit/`, `.planning/DEPLOY_CHECKLIST.md` and `CLAUDE.md` updates.

## 2026-05-05 — DealerWyze v1.1 Phase 4: distributed export limiter, DOMPurify signatures, Zod parseRequest, public route tests

- **Category:** Security / Reliability / Validation
- **Migration:** none
- **Why:** Multi-instance export limits, safer HTML signatures, and consistent JSON/query validation at public and Stripe webhook boundaries.
- **What was built:**
  - `lib/rateLimit/upstash.ts` — `orgExportLimiter` (1/org/hour); `app/api/settings/data-export/route.ts` uses it.
  - `lib/validation/parseRequest.ts`, `lib/validation/stripeWebhookObjects.ts`, schema tweaks in `lib/validation/schemas.ts`.
  - `lib/security/html.ts` — DOMPurify allowlist; dropped `sanitize-html`.
  - `app/api/stripe/webhook/route.ts`, `app/api/unsubscribe/route.ts`, `app/api/leads/web/route.ts`, `app/api/book/[slug]/route.ts`, `app/api/pay/[token]/route.ts` — wired to shared validation / behavior above.
  - `CLAUDE.md` — legacy Gmail push remains deleted.
  - New/updated tests under `lib/__tests__/public-routes/`, `lib/__tests__/webhooks/twilio-sig.test.ts`, and related suites.

## 2026-05-05 — DealerWyze v1.1 Phase 2: service-role narrowing, impersonation RLS, tenant isolation tests

- **Category:** Security / Multi-tenancy
- **Migration:** `supabase/migrations/138_authenticated_social_and_video_rls.sql`
- **Why:** Authenticated org workflows should use RLS-scoped clients; staff impersonation must not expose a service-role client to the rest of the app.
- **What was built:**
  - `lib/supabase/scopedHelpers.ts` — typed helpers for vehicles, customer documents, BHPH contract fetch, aligned with auth client + RLS.
  - `lib/supabase/impersonation.ts` — JWT minting for impersonated org; service role confined to loading profile + signing.
  - `lib/supabase/forRequest.ts` — staff path always uses scoped impersonation (write included).
  - `supabase/migrations/138_authenticated_social_and_video_rls.sql` — authenticated policies for social/video/pipeline/inventory inquiry surfaces.
  - Broad route/page migration from `createServiceClient` to `createClient` where `requireProfile()` applies (20+ call sites).
  - `lib/__tests__/tenancy/isolation.test.ts`, `lib/__tests__/forRequest.test.ts` — tenancy and impersonation tests.
  - `lib/social/autoPost.ts` — use `postReelToFacebook` for Facebook video auto-post (matches `lib/social/facebook.ts` exports).

## 2026-05-05 — BHPH pay confirm: atomic finalize_bhph_payment RPC (v1.1 Phase 1)

- **Category:** Reliability / Payments (BHPH)
- **Migration:** `supabase/migrations/137_finalize_bhph_payment_rpc.sql` (122 was already used by `122_leads_assignee_index.sql`)
- **Why:** The public pay confirm path performed three separate DB writes (token, activity, contract); a failure mid-flight could leave inconsistent financial state. Sequential HTTP replays with the same PaymentIntent also needed a clear 200 idempotent response.
- **What was built:**
  - `supabase/migrations/137_finalize_bhph_payment_rpc.sql` — `finalize_bhph_payment` SECURITY DEFINER function (single transaction), partial UNIQUE index on `stripe_payment_intent_id`, optional `p_amount` check, JSON results `{ ok, already_processed }` / `{ conflict: true }`.
  - `app/api/pay/[token]/route.ts` — confirm branch uses only this RPC for the three mutations; paid + same PI short-circuit returns 200 without a second RPC; passes `p_amount` from the token row.
  - `lib/__tests__/bhph/pay-confirm.test.ts` — sequential idempotency test (two POSTs), RPC param expectations including `p_amount`, paid + different PI → 409.
  - `lib/__tests__/bhph/finalize-bhph-payment.rpc.integration.test.ts` — idempotent RPC expectation aligned with `{ ok: true, already_processed: true }`.

## 2026-04-30 — Free vs paid feature inventory: spreadsheet CSV export

- **Category:** Documentation / Product
- **Migration:** none
- **Why:** The feature inventory is easier to audit and filter in a spreadsheet (tier, section, surfaces).
- **What was built:**
  - `docs/features-free-vs-paid-inventory.csv` — one row per inventory feature with columns `section_num`, `section_name`, `feature`, `surfaces`, `tier`, `notes`.
  - `docs/features-free-vs-paid-inventory.md` — link to the CSV for discoverability.

## 2026-05-02 — Facebook API error messages: full error propagation

- **Category:** Reliability / DX
- **Migration:** none
- **Why:** Facebook API errors were truncated to 200 chars and wrapped in a generic prefix, making it impossible for users to read the real Facebook error (e.g. 2FA requirement, page-admin role issue) and self-serve a fix.
- **What was built:**
  - `lib/social/facebook.ts` — all four `res.ok` failure branches now parse the JSON body and extract `error.message` before throwing; truncation removed. Full Facebook error surfaces in the sheet toast and server logs.

## 2026-05-02 — Social accounts architecture fix: unified table + DELETE disconnect

- **Category:** Bug fix / Security
- **Migration:** `supabase/migrations/135_social_publish_log_carousel.sql`
- **Why:** `GET /api/social/accounts` was reading from `org_social_posting` (legacy auto-post config) instead of `social_accounts` (OAuth source of truth), causing all Instagram and Facebook sheets to show "No account connected" despite a valid OAuth connection. The DELETE disconnect button returned 405 because the handler was missing. The `social_publish_log.placement` CHECK constraint omitted `'carousel'`, silently blocking all carousel log inserts.
- **What was built:**
  - `supabase/migrations/135_social_publish_log_carousel.sql` — drops and recreates `social_publish_log_placement_check` to include `'carousel'`.
  - `app/api/social/accounts/route.ts` — GET rewired to `social_accounts` table; returns all active accounts with connected page metadata. DELETE handler added (soft-delete via `is_active = false`).
  - `app/api/vehicles/[id]/carousel/route.ts` — credential fetch switched to `social_accounts` with `.order('connected_at').limit(1)`.
  - `app/api/vehicles/[id]/facebook-post/route.ts` — same `social_accounts` fix + `page_id ?? platform_account_id` fallback.

## 2026-05-02 — Vehicle detail: "Social Media" section + dedicated Carousel button

- **Category:** UX / Social Media
- **Migration:** none
- **Why:** "Photos & video" was a misleading label once the section hosted social posting actions. The Instagram Carousel was buried inside the "Create Video" sheet as a hidden tab.
- **What was built:**
  - `app/(app)/vehicles/[id]/page.tsx` — section heading and nav label changed to `Social Media`.
  - `components/vehicles/CarouselSheet.tsx` — new standalone sheet for Instagram carousels (extracted from `VideoOptionsSheet`). Photo selector, editable caption with defaults injection and "Reset to defaults", slide count, success screen with post link.
  - `components/vehicles/VehicleVideoSection.tsx` — dedicated "Carousel" button (Instagram gradient icon) opens `CarouselSheet`. Button row: Carousel | Facebook | Generate Video.
  - `components/vehicles/VideoOptionsSheet.tsx` — reverted to video-only; carousel mode removed.

## 2026-05-02 — Instagram carousel end card: full dealership contact card

- **Category:** UX / Social Media / Branding
- **Migration:** none
- **Why:** The final carousel slide only had dealer name, phone, and a generic CTA — not enough to drive a contact action. Dealers wanted a complete branded card.
- **What was built:**
  - `lib/social/carouselComposer.ts` — `endCardSvg()` now renders dealer name, tagline, full address (street + city/state), phone, website, and CTA in a structured dark card layout. `CarouselBranding` type extended with `tagline`, `address`, `city`, `state`, `website`.
  - `app/api/vehicles/[id]/carousel/route.ts` — `org_settings` query extended to select `address`, `city`, `state`, `social_tagline`, `dealer_website_url`; all forwarded to `composeCarouselSlides`.

## 2026-05-02 — Social posting enterprise hardening (post-implementation audit)

- **Category:** Security / Reliability / Testing
- **Migration:** `supabase/migrations/133_org_social_posting_enterprise_rls.sql`
- **Why:** Post-implementation enterprise-standards audit of the Meta social posting feature identified 6 issues across security, reliability, and test coverage before the feature was considered production-ready.
- **What was built:**
  - `supabase/migrations/133_org_social_posting_enterprise_rls.sql` — `ENABLE ROW LEVEL SECURITY` + `REVOKE ALL` (anon + authenticated) on `org_social_posting` and `social_publish_log`; `CHECK` constraints locking platform/placement/status enums.
  - `lib/social/metaGraph.ts` — added `AbortSignal.timeout(30_000)` to every `fetch` call; without this, a hung Meta API response could exhaust the serverless function's `maxDuration`.
  - `lib/social/publishListingMedia.ts` — reduced Instagram container polling cap from 50→30 iterations (100s→60s) to stay safely inside `maxDuration: 120`.
  - `lib/env/validate.ts` — added `RENDER_WEBHOOK_SECRET` to required startup vars; if missing the render webhook silently returns 401 and auto-posting never fires.
  - `lib/social/runOrgSocialPublish.ts` — log insert errors now surfaced via `console.error`; previously swallowed silently.
  - `lib/security/outboundPublicMediaUrl.ts` — fixed hostname block check from `.endsWith()` to `.includes()` so `metadata.google.internal` (and any future variant) is correctly blocked.
  - `app/api/social/accounts/route.ts`, `app/api/settings/social-posting/route.ts`, `app/api/vehicles/[id]/video/route.ts` — added required service-role justification comments per CLAUDE.md policy.
  - `lib/social/applyRenderWebhook.ts` — added `.eq('user_id', row.org_id)` belt-and-suspenders to vehicle lookup.
  - `lib/__tests__/social-posting.test.ts` — 26 new tests covering `verifyRemotionWebhookSignature`, `assertSafeOutboundMediaUrl` (12 cases including SSRF vectors), and `assertListingPhotoBelongsToVehicle`.

## 2026-05-01 — Meta listing & video posting + AI daily spotlight

- **Category:** Integrations / Marketing automation
- **Migration:** `supabase/migrations/132_org_social_posting.sql`
- **Why:** Dealers need to push inventory and rendered videos to Facebook/Instagram and optionally automate a daily spotlight; UI referenced `/api/social/accounts` and posting flows without backends.
- **What was built:**
  - `supabase/migrations/132_org_social_posting.sql` — `org_social_posting` (Page token, IG Business user id, feed/story toggles, daily AI opt-in + `last_daily_post_at`) and `social_publish_log` audit/history.
  - `lib/social/metaGraph.ts`, `publishListingMedia.ts`, `runOrgSocialPublish.ts`, `generateListingCaptionGroq.ts`, `applyRenderWebhook.ts` — Graph posting, captions, webhook completion + auto-post.
  - `app/api/webhooks/render-complete/route.ts` — verified Remotion Lambda webhook (`RENDER_WEBHOOK_SECRET`).
  - `app/api/social/accounts/route.ts`, `vehicles/[id]/video/route.ts`, `vehicles/[id]/post/route.ts`, `settings/social-posting/route.ts`.
  - `app/api/cron/daily-social/route.ts` + `vercel.json` — scheduled daily spotlight (cron auth + Groq).
  - `app/(app)/settings/organization/sections/SocialPostingSection.tsx`; `VehicleVideoSection.tsx` / `SocialPostStatus.tsx` — UX + skipped status.

## 2026-05-02 — Public dealer site: bordered main content area

- **Category:** UX / Public site
- **Migration:** none
- **Why:** `main` had no gutters; listings and especially VDP sat flush against the viewport while header/footer did not.
- **What was built:**
  - `components/dealer-public/DealerPublicChrome.tsx` — outer **`max-w-6xl`** + horizontal padding + inner **rounded bordered** warm-white panel with light shadow around all `{children}` in `main`.
  - `app/[slug]/inventory/page.tsx` — dropped redundant `px-4` on inventory stack (inner panel already pads).

## 2026-05-02 — Vehicle detail: one gallery for listing + social video

- **Category:** UX / Integrations
- **Migration:** none
- **Why:** Video used a second photo list (server prefetch) while uploads lived in `VehiclePhotos` — duplicate sources and stale clip choices.
- **What was built:**
  - `components/vehicle/VehiclePhotos.tsx` — optional `showVideoSection` + `vehicleLabel`; embeds `VehicleVideoSection` under the gallery; fetches listing photos when collapsed if video is enabled.
  - `components/vehicles/VehicleVideoSection.tsx` — consumes `listingPhotoUrls` from the gallery + `listingPhotosLoading`; **Generate Video** disabled until gallery has images.
  - `components/vehicles/VideoOptionsSheet.tsx` — selection syncs when gallery URLs change; copy clarifies clips = listing images.
  - `app/(app)/vehicles/[id]/page.tsx` — removed redundant `vehicle_photos` prefetch and separate video block.

## 2026-05-02 — Vehicle detail: documents in Website & Inventory tabs (no Documents tab)

- **Category:** UX / Admin
- **Migration:** none
- **Why:** Shopper-facing files belong with listing/website workflow; dealer-private files belong under inventory/back-office cues.
- **What was built:**
  - `lib/vehicles/vehicleDetailSectionIds.ts` — removed `documents`; added **`inventory`** section id (`vehicle-detail-inventory`).
  - `components/vehicle/VehicleDocuments.tsx` — **`documentScope`**: `'website'` | `'inventory'` | `'both'` (default); single-scope view is always expanded (no inner accordion toggle).
  - `app/(app)/vehicles/[id]/page.tsx` — picker label **Inventory** with private-doc panel; **Website** combines overview + shopper documents; **Listing** includes shopper documents when the Website tab is omitted (e.g. sold).
  - `components/vehicle/VehicleDetailSectionPicker.tsx` — legacy hash `#vehicle-detail-documents` resolves to Inventory.

## 2026-05-01 — Vehicle detail: section dropdown (one panel at a time)

- **Category:** UX / Admin
- **Migration:** none
- **Why:** Single long page and horizontal pill scrolling were awkward on phones; dealers only need one work area visible at once.
- **What was built:**
  - `components/vehicle/VehicleDetailSectionPicker.tsx` — full-width sticky `Select` under `TopBar`; only **one** panel rendered; `#section-id` hash honored on load; hash updated on change.
  - `app/(app)/vehicles/[id]/page.tsx` — builds `panels` map on the server (same visibility rules), passes `uniqSections` + panels into picker.
  - Removed `VehicleDetailSectionNav.tsx` (pill strip + scroll anchors).

## 2026-05-02 — Vehicle documents: `inventory` (private) vs `website` (shopper + AI)

- **Category:** Admin / Public site / Privacy / AI
- **Migration:** `131_vehicle_documents_scope.sql`
- **Why:** Dealers store sensitive files (BOS, smog, mechanic receipts) alongside Carfax-style reports; only the latter should feed listing AI and appear on the public VDP.
- **What was built:**
  - `supabase/migrations/131_vehicle_documents_scope.sql` — `vehicle_documents.document_scope` (`inventory` | `website`), default **`website`** for backward compatibility.
  - `app/api/vehicles/[id]/documents/route.ts` — POST accepts `document_scope`; **AI summarization only for `website`**.
  - `lib/vehicles/recomputeVoiceSummary.ts` — `voice_summary` includes **website** docs only.
  - `components/vehicle/VehicleDocuments.tsx` — two panels: **Website & shopper documents** vs **Inventory (private)**.
  - `lib/vehicles/publicVehicleDocuments.ts`, `components/dealer-public/PublicVehicleReportDownloads.tsx` — signed download links on VDP for **website** docs only.
  - `app/[slug]/inventory/[vdp]/page.tsx` — renders shopper report downloads.
  - `app/(app)/vehicles/[id]/page.tsx` — overview staleness uses **website** doc timestamps only.
  - `types/index.ts` — `VehicleDocument.document_scope`.
  - `VehicleOverviewSection` copy updated for the split.

**Update (same flow):** The admin vehicle screen no longer has a separate Documents tab; website-scoped uploads live under **Website**, inventory-scoped under **Inventory**.

## 2026-05-02 — Public VDP “Overview”: scannable sections, admin edit + enrichment, AI prompt refresh

- **Category:** Public site / UX / Admin / AI
- **Migration:** `130_vehicle_overview_enrichment.sql`
- **Why:** “AI Overview” paragraphs are hard to skim; dealers need to fix mistakes; Carfax/KBB context should feed regeneration without showing raw paste on the site.
- **What was built:**
  - `supabase/migrations/130_vehicle_overview_enrichment.sql` — `vehicles.overview_enrichment_text` (dealer paste for AI only).
  - `lib/vehicles/overviewSections.ts` — parse sectioned overview text; `flattenOverviewForMeta` for SEO snippets.
  - `lib/vehicles/recomputeVoiceSummary.ts` — shared `voice_summary` rebuild after document upload/delete.
  - `components/dealer-public/PublicVehicleOverview.tsx` — public “Overview” with short blocks + disclaimer.
  - `components/vehicle/VehicleOverviewSection.tsx` — editable overview + enrichment textarea, Save (PATCH), Regenerate (reanalyze); placed after Documents.
  - `app/[slug]/inventory/[vdp]/page.tsx` — Overview before long Description; JSON-LD/meta use flattened overview.
  - `app/api/vehicles/[id]/route.ts` — PATCH `ai_description`, `overview_enrichment_text`.
  - `app/api/vehicles/[id]/reanalyze/route.ts` — sectioned, punchy output; includes enrichment + doc summaries.
  - `app/api/vehicles/[id]/documents/[docId]/route.ts` — recompute `voice_summary` after delete.
  - `types/index.ts` — `overview_enrichment_text` on `Vehicle`.
  - Removed `VehicleReanalyzeButton.tsx` (replaced by `VehicleOverviewSection`).
  - **Follow-up:** `lib/vehicles/overviewSections.ts` — removed comma-splitting; optional `mergeContinuationLines` for bad line breaks; single paragraph stays one block (prose on VDP).
  - `app/api/vehicles/[id]/overview/reflow/route.ts` — **Smart sections (AI)**: reflow line breaks without changing facts (uses textarea or DB text).
  - Reanalyze / `ai-description` prompts — require **one complete sentence per line** after section titles.

## 2026-05-02 — Public dealer layout 404: include `public_inventory_enabled` in org SELECT

- **Category:** Public site / Bug
- **Migration:** none
- **Why:** `DealerPublicLayout` gates on `org.public_inventory_enabled === true`, but **`ORG_PUBLIC_SELECT` never requested the column**, so the value was always `undefined` and every public dealer route 404’d after a successful org match.
- **What was built:**
  - `app/[slug]/layout.tsx` — add **`public_inventory_enabled`** to `ORG_PUBLIC_SELECT`.

## 2026-05-02 — Public dealer routes: multi-row-safe org lookup by slug (`ilike` + `maybeSingle` fix)

- **Category:** Public site / Bug
- **Migration:** none
- **Why:** PostgREST errors when **more than one** `organizations` row matches `slug ILIKE …` (e.g. duplicate casing). That surfaced as `error` + null `data`, so the app treated a valid dealer as missing → **404** even when `public_inventory_enabled` was true.
- **What was built:**
  - `lib/dealer-public/publicOrgBySlug.ts` — `loadOrganizationsMatchingPublicSlug`, `pickUniqueOrgSlugMatch` (prefer exact path casing when multiple ILIKE matches).
  - `app/[slug]/layout.tsx`, `app/[slug]/inventory/page.tsx`, `app/[slug]/inventory/[vdp]/page.tsx` — replaced `.ilike(…).maybeSingle()` org fetches with the helper; dev `notFound` warn includes `ambiguous` and `matchCount`.

## 2026-05-02 — Dealer public 404 UX: slug vs theme path, dev diagnostics, correct public URL in settings

- **Category:** Public site / DX / SEO
- **Migration:** none
- **Why:** `/apollo-auto/inventory` 404s often come from assuming the org slug matches the `dealer-themes/apollo-auto` asset folder; settings always linked to production host; local dev needed `NEXT_PUBLIC_APP_URL` + service role clarity.
- **What was built:**
  - `app/[slug]/layout.tsx` — `console.warn('[dealer-public] notFound', …)` in **development** with slug, Supabase error, `public_inventory_enabled`.
  - `components/settings/WebsiteSettingsClient.tsx` — public link uses **`getPublicAppBaseUrl()`**; note that path slug ≠ theme folder name.
  - `app/[slug]/not-found.tsx` — copy for service role, `NEXT_PUBLIC_APP_URL`, and theme-folder mix-up.
  - `lib/dealer-public/site.ts` — comment on **`DEALER_THEME_DEFAULT_LOGO_PATH`**.

## 2026-05-01 — Enterprise audit: HTTPS sanitizers, sitemap batching, breadcrumbs, `updated_at`

- **Category:** Security / SEO / Performance / Data integrity
- **Migration:** none
- **Why:** Align public-site URL handling and structured data with enterprise bar (no mixed `http:` in stored social/CTA URLs), fix duplicate breadcrumb URLs for Rich Results, stamp org row updates on website PATCH, and remove sitemap N+1 queries.
- **What was built:**
  - `lib/dealer-public/personalization.ts` — social + absolute CTA URLs normalized to **https** only (`http:` upgraded to `https:`).
  - `app/api/settings/website/route.ts` — sets **`updated_at`** on successful PATCH.
  - `app/sitemap.ts` — one **batched** `vehicles` query via `.in('user_id', orgIds)`; **`lastModified`** from vehicle `created_at` / org `updated_at`.
  - `app/[slug]/layout.tsx`, `app/[slug]/inventory/[vdp]/page.tsx` — **BreadcrumbList** position 1 uses dealer **site root** `/{slug}`; VDP adds explicit **Inventory** step (3 items).
  - `lib/__tests__/dealer-public-url-sanitizers.test.ts` — Vitest coverage for the above sanitizers.

## 2026-05-01 — Public website batch: personalization v2, VDP/inventory SEO, sitemaps, settings UI

- **Category:** Public site / SEO / UX / Settings
- **Migration:** `129_website_personalization_v2.sql`
- **Why:** Extend dealer-facing pages with hero copy, trust signals, CTA, OG/favicon, GTM/verification, noindex control, structured data, and discoverability (sitemap/robots) without fighting Next.js metadata route conflicts.
- **What was built:**
  - `supabase/migrations/129_website_personalization_v2.sql` — hero, specialty tags, service area, awards, established year, CTA, OG/favicon URLs, robots noindex, Google verification, GTM; larger OG bucket limit.
  - `lib/dealer-public/openingHours.ts`, `lib/dealer-public/personalization.ts` — hours → schema, sanitizers, `extractCityFromAddress`, `vdpMetaDescriptionFallback` (safe mileage copy).
  - `lib/dealer-public/site.ts` — `resolvePublicCtaUrl` for public CTAs.
  - `app/api/settings/website/route.ts`, `og-image/route.ts`, `favicon/route.ts` — GET/PATCH and uploads aligned with new columns.
  - `app/[slug]/layout.tsx` — `DealerPublicOrgRow` cast for typings; metadata/JSON-LD/GTM (from prior batch) unchanged structurally.
  - `components/dealer-public/DealerPublicChrome.tsx` — optional header CTA, footer established/awards, logo `fetchPriority`/`decoding`.
  - `app/[slug]/inventory/page.tsx` — dynamic hero, specialty chips, service area, lazy list images, metadata robots/OG.
  - `app/[slug]/inventory/[vdp]/page.tsx` — local title + description fallback, robots/noindex, richer OG images, JSON-LD `@graph` (Car + BreadcrumbList + AutoDealer).
  - `app/[slug]/inventory/[vdp]/PhotoCarousel.tsx` — lazy non-primary slides, async decode, fetch priority hints.
  - `app/sitemap.ts`, `app/robots.ts` — dynamic flat sitemap of inventory + VDPs (excludes noindex orgs); robots points at `/sitemap.xml` (Next metadata conventions, not `*.xml/route` handlers).
  - `app/(app)/settings/website/page.tsx` — wider layout, org + `org_settings` for preview name, all new fields passed through.
  - `components/settings/WebsiteSettingsClient.tsx` — hero, trust, CTA, OG/favicon uploads, advanced (noindex, verification, GTM); two-column + preview.
  - `components/settings/WebsitePreviewPanel.tsx` — compact hero/header preview using live theme colors.

## 2026-05-02 — Vehicle photos: drag-to-reorder (listing, carousel, video)

- **Category:** UX / Inventory / Video
- **Migration:** none
- **Why:** Dealers need control over photo sequence for public gallery, carousel, and video clips without re-uploading.
- **What was built:**
  - `app/api/vehicles/[id]/photos/reorder/route.ts` — PATCH validates a full `orderedIds` list and rewrites `position` + `vehicles.photo_url`.
  - `components/vehicle/VehiclePhotos.tsx` — thumbnail grid with grip-handle HTML5 drag-and-drop; persists order to the API.
  - `components/vehicles/VideoOptionsSheet.tsx` — “Video order” strip with drag reorder; grid tap adds/removes; `photoUrls` sent in chosen order.

## 2026-05-01 — Website settings: public site personalization & SEO / AI signals

- **Category:** Public site / SEO / UX
- **Migration:** `128_website_personalization.sql`
- **Why:** Dealers need a story, optional contact overrides, palette, typography, and explicit SEO fields so the public inventory site outperforms generic listing templates (structured data, `sameAs`, rich copy).
- **What was built:**
  - `supabase/migrations/128_website_personalization.sql` — `website_about`, hours, public phone/address overrides, `website_social` jsonb, `website_theme` jsonb, `website_font_preset`, meta description/keywords columns.
  - `lib/dealer-public/personalization.ts` — theme merge, social URL sanitization, font preset map, meta description builder, JSON-LD `sameAs` helper, inline CSS var builder.
  - `app/[slug]/layout.tsx` — loads Google font presets, applies palette + font CSS variables, enriched `AutoDealer` / `WebSite` JSON-LD (`description`, `sameAs`).
  - `components/dealer-public/DealerPublicChrome.tsx` — hours column, social links, About nav when story exists.
  - `components/dealer-public/DealerPublicAboutSection.tsx` — semantic `#about` block on inventory.
  - `app/[slug]/inventory/page.tsx` — renders About section; inventory metadata uses shared description + keywords.
  - `app/api/settings/website/route.ts` — PATCH/GET for new fields with validation.
  - `app/(app)/settings/website/page.tsx` — passes personalization defaults into the form.
  - `components/settings/WebsiteSettingsClient.tsx` — story, hours, overrides, social, color pickers, font preset, SEO fields.

## 2026-05-02 — Public inventory list: fix `stock_no` column (empty grid)

- **Category:** Bug / Public site
- **Migration:** none
- **Why:** Inventory query selected non-existent `stock_number`; PostgREST rejected the select and the page showed no vehicles even when published.
- **What was built:**
  - `app/[slug]/inventory/page.tsx` — use `stock_no` in `.select()` and listing UI (matches `vehicles` schema and VDP).

## 2026-05-02 — Marketing landing: public dealer website & SEO

- **Category:** Marketing / SEO
- **Migration:** none
- **Why:** Ship messaging for the new public inventory site, trial/free inclusion, and structured-data-friendly pages on the homepage.
- **What was built:**
  - `components/landing/sections/FeaturesSection.tsx` — **Public Dealer Website** feature card.
  - `components/landing/sections/HeroSection.tsx` — hero copy + trust line mention SEO inventory site.
  - `components/landing/sections/HowItWorksSection.tsx` — step 3 mentions public website.
  - `components/landing/sections/PricingSection.tsx` — free + paid feature bullets for public site.
  - `components/landing/sections/FAQSection.tsx` — new FAQ + Complete CRM answer updated.
  - `app/page.tsx` — meta description/keywords/OG/Twitter, `SoftwareApplication` description, FAQPage JSON-LD entry.

## 2026-05-02 — Public dealer website: not a paid-tier gate; trial messaging

- **Category:** Billing / Product / UX
- **Migration:** none
- **Why:** Public inventory site should be available on **every plan including free** after the 30-day trial; it is highlighted as part of the **demo during trial**, not locked behind paid membership only.
- **What was built:**
  - `lib/billing/assertFeature.ts` — `public_website` allowed for plan **`free`** (still blocked when suspended/canceled).
  - `app/(app)/settings/website/page.tsx` — removed “paid feature” gate on the public inventory toggle; added trial info banner when `trial_ends_at` is active.
  - `components/settings/WebsiteSettingsClient.tsx` — toggle always usable for dealer admins; removed `websiteGated` / redundant trial footnote.
  - `lib/__tests__/billing/assertFeature.test.ts` — asserts `public_website` on free after trial; upgrade-message tests use `video` instead.

## 2026-05-02 — Public website APIs: billing gate, audit log, image content validation

- **Category:** Security / Compliance / Billing
- **Migration:** none
- **Why:** Logo upload and website settings should match enterprise patterns used elsewhere (plan gates, audit trail, don’t trust client-reported image types).
- **What was built:**
  - `app/api/settings/website/logo/route.ts` — **POST** calls `assertCanUseFeature(…, 'public_website')` (402 when not entitled); **magic-byte** sniff via `sniffImageMime` for upload `Content-Type`; `logOrgAudit` on upload/remove with client IP.
  - `app/api/settings/website/route.ts` — `logOrgAudit` on successful PATCH (`website_settings_updated`).
  - `lib/uploads/sniffImageMime.ts`, `lib/__tests__/sniffImageMime.test.ts` — JPEG/PNG/WebP header detection.
  - `lib/audit/requestIp.ts` — `x-forwarded-for` / `x-real-ip` for audit entries.

## 2026-05-01 — Public dealer website: Apollo theme, SEO, branding settings

- **Category:** Public site / SEO / Branding
- **Migration:** `126_public_website_branding.sql` (`organizations.website_logo_url`, `organizations.website_contact_email`); **`127_dealer_branding_storage.sql`** (Supabase Storage bucket `dealer-branding` + public read policy for uploaded logos)
- **Why:** Dealer inventory pages looked like a gray placeholder; dealers need a credible, SEO-friendly storefront and optional logo + public email.
- **What was built:**
  - `public/dealer-themes/apollo-auto/default-logo.png` — default theme logo when no upload.
  - `lib/dealer-public/site.ts` — canonical base URL helpers + safe JSON-LD stringification.
  - `components/dealer-public/DealerPublicChrome.tsx` — navy/gold/cream shell: header with logo/name/tagline/CTA, skip link, footer with address/phones/email from settings.
  - `app/[slug]/layout.tsx` — Google fonts (Cormorant Garamond, Poppins, Dancing Script), CSS variables, rich `generateMetadata` (canonical, OG/Twitter, robots), `AutoDealer` + `WebSite` JSON-LD (`SearchAction`).
  - `app/[slug]/page.tsx` — redirect `/{slug}` → `/{slug}/inventory`.
  - `app/[slug]/inventory/page.tsx` — hero, themed cards, `ItemList` JSON-LD, inventory-specific metadata.
  - `app/[slug]/inventory/[vdp]/page.tsx` — canonical + OG/Twitter polish; theme-aligned typography/links.
  - `app/[slug]/inventory/InventoryFilters.tsx` — focus/brand styling.
  - `app/api/settings/website/logo/route.ts` — **POST** multipart logo upload to `dealer-branding` + update `website_logo_url`; **DELETE** clears DB URL and removes storage object.
  - `app/api/settings/website/route.ts`, `components/settings/WebsiteSettingsClient.tsx`, `app/(app)/settings/website/page.tsx` — public contact email + **upload/remove logo UI** (no manual logo URL on PATCH).

## 2026-05-01 — Unarchive / Restore from Archived Leads

- **Category:** UX / Data integrity
- **Migration:** none
- **Why:** Archived list had no way to move a lead back to the active pipeline without Supabase or API tinkering.
- **What was built:**
  - `components/customer/CustomersListClient.tsx` — **`handleUnarchive`** sets `archived: false` and clears `archived_reason`; **mobile** row action (archive-restore icon + `aria-label`); **desktop** table **Restore** outline button in the last column.

## 2026-05-01 — Leads list UI: Archived tab, sort row, compact bulk reassign

- **Category:** UX
- **Migration:** none
- **Why:** “Show Archived” wasted a full row; “Select to reassign” sat alone under Sort; bulk-assign bar was fixed at the bottom; selection cards were oversized.
- **What was built:**
  - `app/(app)/customers/page.tsx` — **Archived** link in the List/Pipeline/Segments pill group (after Segments); removed duplicate archive icon from TopBar actions.
  - `components/customer/CustomersListClient.tsx` — removed standalone archive row; single toolbar row **Sort** (dropdown + arrows) → **Associate** select → two-line **Reassign Lead** / **Cancel**; **Unassign / Assign** panel directly under that row when selections exist (removed fixed bottom bar); mobile selection rows are compact (name + small initials + checkbox only); removed duplicate in-list find field (TopBar **Search** → `/search` only); compact **Touch** legend for left-edge activity strip + per-card tooltips.

## 2026-05-01 — Web Leads entry on Dashboard (removed from Today)

- **Category:** UX / Navigation
- **Migration:** none
- **Why:** Dealers preferred Web Leads as a clear action from Home (`/dashboard`) instead of a Today feed section.
- **What was built:**
  - `app/(app)/dashboard/page.tsx` — TopBar **Web Leads** ghost button (inbox icon, optional 7-day count badge) linking to `/leads/web`; `hideSearch` + explicit search button to avoid duplicate search icons.
  - `app/(app)/today/page.tsx` — removed `inventory_inquiries` preview query and inline Web Leads block.
  - Removed `components/today/WebLeadsSection.tsx` (unused).

## 2026-05-01 — Public dealer site: force-dynamic, slug ilike, gtag client inject

- **Category:** Public site / Analytics / Routing
- **Migration:** none
- **Why:** VDP still 404’d after publish; React 19 still warned on `next/script` in root layout. Case-sensitive org `slug` + ISR could miss rows; inventory grid linked UUID when `public_slug` was null.
- **What was built:**
  - `components/analytics/GoogleAdsGtag.tsx` — mount-only gtag injection (no `next/script` in React tree).
  - `app/layout.tsx` — render `GoogleAdsGtag` in `<body>`, remove head `Script` tags.
  - `app/[slug]/layout.tsx`, `inventory/page.tsx`, `inventory/[vdp]/page.tsx` — `dynamic = 'force-dynamic'`; org lookup via `.ilike('slug', …)` + `public_inventory_enabled === true`; normalized path segments; VDP resolves vehicle by `public_slug` or UUID `id`, then **redirects** to canonical `/{org.slug}/inventory/{public_slug}`; links use `org.slug` from DB.
  - `inventory/page.tsx` — list/detail links use canonical `org.slug`.

## 2026-05-01 — Gtag Script hydration + publish revalidate public VDP

- **Category:** Analytics / Public site / Stability
- **Migration:** none
- **Why:** Inline `next/script` children triggered React 19 “script tag while rendering” during hydration; public VDP could stay 404 after publish because `revalidate = 300` cached `notFound()` until the window expired.
- **What was built:**
  - `app/layout.tsx` — gtag init `Script` uses `dangerouslySetInnerHTML` instead of JSX text children.
  - `app/api/vehicles/[id]/publish/route.ts` — `revalidatePath` for `/{orgSlug}/inventory` and `/{orgSlug}/inventory/{publicSlug}` after a successful publish update.

## 2026-05-01 — Vehicle detail VIN line vs Autoniq hydration

- **Category:** UX / Stability
- **Migration:** none
- **Why:** Extensions such as Autoniq inject `autoniq-vin-wrapper` spans around VIN text before React hydrates, causing a hard hydration failure on `/vehicles/[id]`.
- **What was built:**
  - `components/vehicle/VehicleVinLine.tsx` — client-only reveal of the formatted VIN after `useEffect` mount; placeholder `VIN: …` with `aria-label` for screen readers.
  - `app/(app)/vehicles/[id]/page.tsx` — use `VehicleVinLine` instead of inline `suppressHydrationWarning` VIN paragraph.

## 2026-05-01 — Public VDP JSON-LD escaping + metadata parity

- **Category:** SEO / Public site / Stability
- **Migration:** none
- **Why:** Unescaped `<` inside `application/ld+json` can terminate the script in the HTML parser when `ai_description` / notes contain angle brackets, causing React “script in component” / hydration warnings and flaky responses; `generateMetadata` also allowed titles when the live VDP would 404 (org gate mismatch).
- **What was built:**
  - `app/[slug]/inventory/[vdp]/page.tsx` — `jsonLdInline()` (`<` → `\u003c`); JSON-LD `<script>` moved after main markup; vehicle fetch uses `.neq('status','sold')` + `.maybeSingle()`; metadata org/vehicle filters aligned with the page.

## 2026-05-01 — AI reanalyze Groq model + VDP 404 clarity

- **Category:** AI / Public site / UX
- **Migration:** none
- **Why:** Groq decommissioned `llama-3.1-70b-versatile` (Jan 2025), causing 500s on “Generate AI overview.” Dealers toggled “Show on public website” per vehicle but VDP still 404s when org `public_inventory_enabled` is false—easy to miss vs vehicle publish.
- **What was built:**
  - `app/api/vehicles/[id]/reanalyze/route.ts` — default model `llama-3.3-70b-versatile`; safe FMV formatting for `market_data_json`; clearer JSON error when Groq returns model errors.
  - `components/vehicle/VehicleReanalyzeButton.tsx` — toast shows API `error` body when present.
  - `components/vehicle/VehiclePublishToggle.tsx` + `app/(app)/vehicles/[id]/page.tsx` — amber callout + link to `/settings/website` when vehicle is published but dealer public inventory is off.
  - `lib/intelligence/rootCause.ts` — same Groq default model bump.

## 2026-05-01 — Billing gates: public website + AI reanalyze; trial bypass; VDP SEO

- **Category:** Billing / SEO
- **Migration:** `124_trial_30days.sql` (default `trial_ends_at` → `now() + 30 days` for new org rows)
- **Why:** Require paid plan (or active trial) for public inventory and AI vehicle reanalysis; improve VDP metadata and JSON-LD from existing DB fields.
- **What was built:**
  - `lib/billing/assertFeature.ts` — `public_website`, `ai_reanalyze` features; `trial_ends_at` on org fetch; active trial bypass after suspend/cancel checks.
  - `app/api/settings/website/route.ts` — 402 when enabling `public_inventory_enabled` without entitlement.
  - `app/api/vehicles/[id]/publish/route.ts` — 402 when `published: true` without entitlement.
  - `app/api/vehicles/[id]/reanalyze/route.ts` — 402 without `ai_reanalyze` entitlement.
  - `app/(app)/settings/website/page.tsx` + `WebsiteSettingsClient.tsx` — paid-feature banner, gated toggle (off always allowed), trial end hint, `plan`/`trial_ends_at` fetch.
  - `app/[slug]/inventory/[vdp]/page.tsx` — `business_address` on org; meta title/description + JSON-LD `description`, `vehicleCondition`, seller `address`.
  - `components/vehicle/VehicleReanalyzeButton.tsx` — toast on 402 billing errors.

## 2026-05-01 — SMS MessageComposer + share sheet chips

- **Category:** UX / SMS
- **Migration:** none
- **Why:** Mobile-first compose on the lot: quick-insert chips for name, vehicle, price, VIN, VinWyze, and listing URL without changing the send payload or `/api/sms/send` contract.
- **What was built:**
  - `components/sms/MessageComposer.tsx` — controlled textarea + horizontal chip row, cursor-preserving insert via `selectionStart` / `selectionEnd`.
  - `components/vehicle/ShareVehicleSheet.tsx` — compose step uses `MessageComposer`; optional `vin` / `vehiclePrice` props; VinWyze URL derived from `publicUrl` host path + VIN.
  - `app/(app)/vehicles/[id]/page.tsx` — passes `vin` and `vehiclePrice` into `ShareVehicleSheet`.

## 2026-05-01 — Vehicle AI reanalyze + public VDP overview

- **Category:** AI / Inventory / Public site
- **Migration:** `123_vehicle_ai_last_analyzed.sql`
- **Why:** Let dealers refresh listing copy from specs, market intel, and document summaries on a cooldown; show shoppers AI overview with disclaimer and an independent VinWyze CTA.
- **What was built:**
  - `supabase/migrations/123_vehicle_ai_last_analyzed.sql` — `vehicles.ai_last_analyzed_at` for cooldown and staleness vs doc uploads.
  - `app/api/vehicles/[id]/reanalyze/route.ts` — POST, `requireProfile` + `canAccessLedger`, Groq listing copy, 4h cooldown, org-scoped updates via `createClientForRequest`.
  - `components/vehicle/VehicleReanalyzeButton.tsx` — internal vehicle page control with stale-doc badge and Sonner toasts.
  - `app/(app)/vehicles/[id]/page.tsx` — latest `vehicle_documents` timestamp vs `ai_last_analyzed_at` for staleness; renders reanalyze UI when editable and not sold.
  - `app/[slug]/inventory/[vdp]/page.tsx` — public `ai_description` block + VinWyze link-out.
  - `types/index.ts` — `Vehicle.ai_last_analyzed_at` optional field.
