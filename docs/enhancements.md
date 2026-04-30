# DealerWyze — Enhancement Backlog

Strategic ideas captured here. Promote to ROADMAP.md when ready to schedule.

---

## Done — 2026-04-29: PLAN-D & PLAN-E service-role remediation

Support, pulse (authenticated routes), sales rep APIs, onboarding GET/PATCH, push subscribe, auth/me, vehicle PATCH + AI description + market-check, split email/fax as documented; eight RSC settings/analytics pages use `await createClient()`; `lib/sms/quota.ts` threads one service client through `checkQuota` helpers. See repo root `enhancements.md` and `.planning/service-role-remediation/PLAN-D-support-pulse-misc.md`, `PLAN-E-pages-lib.md`.

---

## Done — 2026-04-29: PLAN-C service-role remediation

Customers/receipts (DB paths), activities, calendar events, reports, and dashboard stats use `await createClient()` under `requireProfile()`; service client remains only for Supabase Storage (customer documents, receipt signed URLs / upload / delete). See repo root `enhancements.md` and `.planning/service-role-remediation/PLAN-C-customers-receipts.md`.

---

## Done — 2026-04-29: PLAN-B service-role remediation

Sequences seed helper, onboarding step, and automation settings no longer use `createServiceClient()` where `requireProfile()` + RLS suffice. See repo root `enhancements.md` and `.planning/service-role-remediation/PLAN-B-PROGRESS.md`.

---

## Security, Reliability & Performance Sprint — COMPLETED 2026-04-25

All 26 tasks from the 10-audit plan executed. 25 commits, build passing, 20 tests green.

### Completed (2026-04-25)
- **Critical CVEs fixed:** protobufjs (arbitrary code exec), loader-utils (prototype pollution), Next.js bumped 16.1.6→16.2.4 (CSRF bypass, request smuggling) ✅
- **Unused packages removed:** `kokoro-js` (100MB, unused), `@remotion/player` (unused) ✅
- **Pulse/Retention/Sequences gated** on active `subscription_status` — no more cost for canceled orgs ✅
- **OAuth CSRF fixed:** Gmail and Calendar callbacks now verify `state` param with HMAC-signed nonce stored in DB ✅
- **Secrets moved from URL to headers:** `gmail/watch`, `leads/poll` no longer log secrets in access logs ✅
- **Twilio legacy fallback:** `timingSafeEqual` + Authorization header (was `===` + URL param) ✅
- **4 routes fixed:** `leads/ingest`, `reset-billing-cycle`, `telegram/webhook`, `voice/tools` — all use `timingSafeEqual` ✅
- **Read-only staff impersonation:** write blocking already implemented in `proxy.ts` (confirmed) ✅
- **Registration rate limit:** 5 attempts/hour/IP ✅
- **SMS quota blocks on DB error** instead of granting unlimited sends ✅
- **DB migration 102:** 6 missing composite indexes, 3 CASCADE gap fixes, 2 CHECK constraints ✅
- **DB migration 103:** OAuth CSRF columns on `org_settings` and `org_google_tokens` ✅
- **DB migration 101:** `activities(user_id, created_at DESC)` index for reports query ✅
- **API surface:** `requireProfile()` in `leads/sync` + `push/subscribe`; 500 on DB error in `tasks/count` + `admin/alerts`; top 5 raw error leaks sanitized ✅
- **Billing page:** all Stripe fetch calls now check `res.ok` with user-facing error messages ✅
- **cron_runs tracking** added to `data-retention` and `process-render-queue` ✅
- **Stripe webhook logging:** structured `console.info` on all 5 event types ✅
- **Per-job cron isolation:** all 16 jobs in `check-tasks` wrapped in `runJob()`; `finishCronRun` always called ✅
- **Cron scan limits:** `.limit(500)` on `dormantCustomers`, `.limit(200)` on `responseTimeAlerts` ✅
- **N+1 fixes:** `inventoryAging` (batch tasks lookup), `reviewRequests` (org-grouped with `.in()` queries) ✅
- **Stripe null guard:** `user!.email` crash path fixed in `checkout`, `video-pack`, `overage-topup` ✅
- **TypeScript any fixed:** `retell-callback` payload typed as `RetellCallbackPayload`; `appointmentRemindersV2` `CustRow` type ✅
- **Audit log:** user deactivation now writes to `admin_audit_log`; impersonation end event includes `target_org_id` ✅
- **V1 appointment reminders removed:** duplicate SMS eliminated, `appointmentReminders.ts` deleted ✅
- **xlsx replaced with exceljs:** permanent CVE (prototype pollution + ReDoS, no upstream fix) ✅
- **Font loading optimized:** Lora/Oswald only loaded for orgs that selected classic/bold theme preset ✅
- **Public images compressed:** `DealerWyseLogoWithName.png` + `og.png` 456KB→122KB each (73% reduction) ✅
- **Accessibility:** `aria-label` on icon buttons, `aria-pressed` on filter pills, `scope="col"` on table headers, `aria-hidden` on decorative icons, `aria-label` on unlabeled inputs ✅
- **Vitest infrastructure added:** `vitest.config.ts`, `npm test` script, 20 unit tests for utils + validateCronAuth ✅

### Remaining Known Debt (from this sprint — lower priority)
- **Custom dropdown ARIA** in `NewLeadCard.tsx` and `LeadStateSelector.tsx` — need shadcn Select/Popover conversion (deferred, larger refactor)
- **Focus management** for inline panels in `CustomerDetailClient.tsx` (appointment picker, snooze, archive) — needs `autoFocus` or shadcn Dialog
- **`sequenceDelivery.ts` + `fullAutoSequence.ts` N+1** — complex refactor, deferred (timeout risk at scale)
- **`process-render-queue` subscription_status check** — canceled org renders still dispatched to Lambda
- **`lib/env.ts`** — consolidate env var validation at startup instead of scattered `process.env.VAR!` assertions
- **Per-user SMS rate limit** — currently only org-level (20/min, 300/day); no per-rep limit
- **In-memory rate limiters** (`leads/web`, `register`) not shared across Vercel instances — replace with Upstash Redis when scaling

---

## Code Quality / Refactoring — COMPLETED 2026-04-24

All 9 issues from the graphify audit resolved. All 16 readability audit issues resolved.

### Completed (2026-04-24)
- **Dead code deleted:** `app/(app)/reports/ReportsClient.tsx` ✅
- **SMS parsers relocated:** `lib/sms/parse*.ts` → `lib/leads/parse*.ts` ✅
- **`scoreColor()` consolidated:** `lib/pulse/scoreColor.ts` ✅
- **`normalizePhone()` consolidated:** `lib/utils/phone.ts` (was 7 copies) ✅
- **`formatPhone/formatPhoneForTel` consolidated:** `lib/utils/phone.ts` (moved from `lib/utils.ts`) ✅
- **`formatRelativeTime` consolidated:** `lib/utils/relativeTime.ts` (moved from `lib/utils.ts`) ✅
- **`apiError/apiOk` created:** `lib/api/respond.ts` ✅
- **Cron jobs extracted:** 16 job files in `lib/cron/jobs/`; `check-tasks/route.ts` is now 70 lines ✅
- **Cron auth timing-safe:** `lib/cron/validateCronAuth.ts` used by all 10 cron routes ✅
- **Org settings page split:** 9 section components in `settings/organization/sections/` ✅
- **LandingPage split:** 19 section files in `components/landing/sections/` ✅
- **Vehicle route client comments:** 41 comments across 23 files explaining createServiceClient vs createClient ✅
- **V1/V2 appointment reminders documented:** both files explain the relationship and deprecation plan ✅
- **README rewritten:** real project README with setup, structure, architecture, cron table, deploy, gotchas ✅
- **`.env.example` created:** all 60 env vars with descriptions ✅
- **20 root planning docs moved:** to `docs/archive/` (preserved, not deleted) ✅
- **`org_settings` upsert bug fixed:** `app/api/settings/org/route.ts` now uses `.update().eq()` ✅

### Remaining Known Debt (lower priority)
- **102 client-side `fetch()` calls** without `res.ok` check — add an `apiFetch()` wrapper or ESLint rule to enforce going forward
- **`catch (err: any)` in API routes** — replace with `err instanceof Error ? err.message : String(err)` pattern
- **Raw role checks in 3 org settings sections** — `PhoneSection`, `VoiceAgentSection`, `DangerZoneSection` use `role === 'admin'` strings; should use `isDealerAdmin(role)`
- **7 org settings sections each call `/api/settings/org` on mount** — future: shared `useOrgSettings` SWR hook
- **Several settings sections show "Saved!" on API error** — need `res.ok` check before setting saved state
- **`app/(onboarding)/onboarding/page.tsx`** — 926 lines; add orientation comment block at top
- **`app/(app)/customers/[id]/CustomerDetailClient.tsx`** — 861 lines; add orientation comment block
- **`app/(app)/admin/orgs/[id]/page.tsx`** — 813 lines; add orientation comment block

---

## Consumer-Side Growth (Marketplace / Pillar 1+3)

### SEO Strategy
- Every published VDP = an indexed page on dealerwyze.com. At 500 dealers x 50 cars = 25,000 SEO pages at launch.
- Need: intentional metadata, JSON-LD schema (done), sitemap per dealer (done), internal linking between vehicles, fast page load.
- Add: auto-generated "Used [Make] for sale in [City]" meta descriptions per VDP.
- Add: a `dealerwyze.com/cars` index page aggregating all published inventory for SEO.

### Consumer Trust Signals
- Verified dealer reviews (only buyers who transacted can post — not Google, internal).
- "X vehicles sold through DealerWyze" badge on dealer public page.
- Vehicle history report link (Carfax affiliate = revenue share, ~$3-5/click).
- Days on lot counter (creates urgency for consumers).

### Trade-In Estimator
- Widget on VDP: Year, Make, Model, Mileage, Condition → estimated range.
- Phase 1: Lead capture only (consumer enters info, dealer gets notified with trade-in details).
- Phase 2: Real-time valuations via MarketCheck API (~$200/mo) or Kelley Blue Book API.
- Revenue: dealer closes more deals; potential referral from lenders.

### Consumer Pre-Qualification
- "See what you're pre-qualified for — no impact to your credit score" button on VDP.
- Soft pull credit via Prism Data or similar.
- Dealer receives lead with "Pre-qualified up to $X" — closes deals faster.
- Partners to evaluate: Prism Data, RouteOne, DealerSocket credit tools.

---

## Dealer-Side Growth (CRM / Pillar 1+2)

### Per-Org Theme Customization — BUILT ✅ (2026-04-22)
- Paid feature (growth/pro plans). Settings > Appearance.
- 6 presets: DealerWyze, Midnight, American Red, Clean Green, Premium Black, Sky Blue.
- Custom mode: free-pick primary + accent hex colors with live preview.
- Font styles: Modern (Barlow + Archivo), Classic (Lora serif), Bold (Oswald uppercase).
- Dark mode: HSL auto-soften (cap sat 65%, L 58-72%) so any color stays readable.
- DealerWyze branding is always retained — no white-label. Colors/fonts only.
- CSS vars injected server-side in app layout; public inventory pages also pick up the theme.
- Clean-up SQL for existing JSON-body timeline artifacts: `UPDATE activities SET body = '__sequence_sent__' WHERE body LIKE '{"to":"%' AND body LIKE '%"sequence_day":%';`

### Vehicle Staging & Reconditioning (BUILT - 2026-03-11)
- Pre-sale workflow for purchased cars not yet ready for the lot.
- Reconditioning checklist (Detail, Oil, Brakes, Tires, Smog, etc.) with per-item cost + notes + completion tracking.
- Investment rollup: Purchase Price + Recon Costs + Ledger Expenses = Total Investment + Est. Profit vs list price.
- Document attachments (receipts, smog cert, invoices) via existing vehicle doc system.
- Receipt scanning expenses assignable to staging vehicles.
- "Mark Ready" promotes vehicle to available; required checklist items gate the promotion.
- Org-level customizable checklist template in Settings.
- **Pending:** Context-aware scanner fix (Lead screen = lead, Inventory = vehicle, Staging = staging vehicle).

### Share Vehicle via Text (BUILT - 2026-03-10)
- One-tap button on vehicle detail page sends VDP link to a customer via SMS.
- Only shows when vehicle is published and has a public_slug.
- Pre-filled message: "Check out this [vehicle]: [URL]"

### Dealer Analytics for Public Pages (BUILT - 2026-03-10)
- Views per vehicle, total views, inquiry count.
- Top vehicles by views.
- Shows on Website Settings page.

### AI Pricing Intelligence — BUILT ✅ (2026-03-11)
- **Live:** 3-tier pricing (Fast Sale / Fair Market / Max Return) on every vehicle detail page.
- **Sources:** MarketCheck (live comps) + Groq Compound AI report (web-search) + SerpAPI (KBB snippets) + NHTSA recalls — 4 sources in parallel.
- **Cost:** ~$0.01-0.03/check; 7-day cache keeps monthly cost under $1/dealer for 100-car lots.
- **Dealer Brief integration:** Daily AI brief now includes `pricing_insight` — calls out overpriced vehicles by name, avg premium vs. market, turn rate impact.
- **Pending Phase B:** Wire `computeDealRating()` to public VDP pages (CarGurus-style deal badge).

### AI Listing Description — BUILT ✅ (2026-03-12)
- One-tap "Generate" button in Market Intelligence card on vehicle detail page.
- Calls `POST /api/vehicles/[id]/ai-description` → returns a ready-to-use listing description.
- Copy-to-clipboard button included. "Regenerate" available after first generation.
- Not shown on sold vehicles.

### Inventory Performance Score
- Per-vehicle score: views, days on lot, price vs. market, inquiry rate.
- Red/yellow/green indicator on inventory list.
- Low-score vehicles trigger a "what to do" prompt: drop price / add photos / push to wholesale.
- Makes dealers log in daily to check their "dashboard."
- **Note:** Market data (price vs. FMV) is already computed — this just needs an inventory list UI layer.

### Vehicle Want List — BUILT ✅ (2026-03-13)
- Customers can be added to a want list with fuzzy criteria: year range, vehicle type (pickup/SUV/etc.), make/model optional, max price, notes.
- Bell icon on customer detail page opens WantListSheet (pre-fills from linked vehicle).
- Match engine fires when a vehicle is added, status-changed to available, or promoted from recon.
- Dealer gets push + Telegram alert: "X want list match(es) for [vehicle]."
- Matches appear as Tier 1 blue cards on Today screen (dealer verifies before reaching out).
- Dismiss card when done; customer stays in want list until explicitly cancelled.
- **Pending:** Migration 072 must be applied. `body_style` field not yet in vehicle edit form.
- **Pending Phase B:** Dealer-to-dealer wholesale matching via want list (see Wholesale Network section).

### Video Auto-Poster — BUILT ✅ (2026-03-29)
Dealers click "Generate Video" on any vehicle. The system creates a branded, narrated MP4 and auto-posts to connected social platforms.

**What's built:**
- 3 Remotion templates: VehicleModernDark (16:9 40s), VehicleReelsPortrait (9:16 30s), VehiclePhotoSlideshow (16:9 35s)
- Google Cloud TTS Neural2 narration (auto-generated from vehicle + dealer data, cached in R2)
- Remotion Lambda render (~45s per video, ~$0.002/render)
- Cloudflare R2 video storage at `videos/{org_id}/{vehicle_id}/`
- Photos pulled from `vehicle_photos` Supabase Storage (no re-upload needed)
- VideoOptionsSheet: dealer picks photos, template, voice, platforms (smart defaults pre-filled)
- RenderStatusBadge: auto-polls every 5s, shows queued/rendering/complete/failed
- SocialPostStatus: per-platform icons with posted links
- Social OAuth: Facebook, Instagram, TikTok, YouTube (dealers connect their own accounts)
- Auto-post toggle per org (fires on vehicle status → available)
- Quota: 50 renders/month on $150 plan, unlimited on $350 plan
- Settings > Video (preferences) + Settings > Social (connected accounts)
- Onboarding step: "Connect Social Media"
- Landing page pricing updated with video features

**Infrastructure set up:**
- AWS Lambda: `remotion-render-4-0-441-mem2048mb-disk2048mb-120sec` (us-east-1)
- Remotion site: `dealerwyze-vehicles` on S3
- R2 bucket: `dealerwyze-videos` (public reads enabled)
- Meta app ID: `1127948526124238` (Business type, Development mode)
- Migration 089 applied

**Pending:**
- Add `refreshAllExpiringTokens()` to `/api/cron/check-tasks` cron
- Meta app: submit for App Review before going live with real dealers (requires business verification)
- TikTok Content Posting API: submit application (2-4 week review)
- Test first end-to-end render on a vehicle with photos

### CSV / DMS Import
- Most independent dealers use Frazer, Dealer Center, or DealerSocket.
- Frazer exports a standard CSV format — one-click import to DealerWyze.
- Eliminates re-entry friction; critical for adoption.
- Effort: low (parse CSV, map fields, bulk insert vehicles).

### Sequences / Autoresponder System — BUILT ✅ (2026-03-13)
- Per-channel (SMS/email) sequences with configurable day offsets and send times.
- Manual / semi-auto / full-auto modes per customer (overrideable globally).
- Re-enrollment capability, STOP/unsubscribe handling (keyword SMS + HMAC email link).
- Settings UI: `app/(app)/settings/sequences/` — list, create, edit steps.
- EnrollSheet component for enrolling customers from Today/customer pages.
- **Pending:** Migration 071 must be applied before feature activates.
- **2026-03-14 fix:** Added backward-compatible enrollment insert path for older DB schemas where `activities.type` still only allows `email/sms` (not `email_followup/sms_followup`). Cancel/unsubscribe/full-auto checks now handle both type styles when `customer_sequence_id` is present.

### Autoresponder V2 — BUILT ✅ (2026-03-15)
**Phase 1 - Foundation:** Migration 073 adds `channel`, `start_at`, `stop_reason`, `stopped_at`, `last_step_sent_at` to `customer_sequences`. Partial unique index prevents double-enrollment per channel. GET API returns channel-aware `{ email, sms }` response. POST accepts `start_at` for scheduled delivery, stores channel snapshot, cancels conflicting same-channel enrollment. PATCH records stop_reason + stopped_at.

**Phase 2 - Contact UI:** `AutoresponderCard` on every contact page — Email and SMS rows with status badges (Not active / Active / Paused / Customer replied), next send time, and action buttons (Start / Pause / Resume / Cancel / Restart with new campaign). EnrollSheet updated with date/time picker for scheduled start.

**Phase 3 - Auto-stop consistency:** `lib/sequences/stopSequenceOnReply.ts` shared helper wired into Twilio inbound SMS, Gmail poll, IMAP poll, and check-tasks cron. On customer reply: pauses enrollment with `stop_reason='replied'`, cancels pending steps, creates deduped "take over" task (priority: must). STOP keyword uses `cancelSequenceOnUnsubscribe` (stop_reason='unsubscribed'). IMAP `seen:false` filter removed — Thunderbird/desktop clients mark emails read before cron fires, so dedup is now message-ID based only.

**Phase 4 - QA + polish:** ActivityTimeline shows Bot icon + step label badge (`[Auto: Day 1 - Name]`) for automated messages. Sent activities prefixed `[Auto: stepLabel]` in body. Starter campaigns: `POST /api/sequences/seed-starters` creates 3 ready-to-use campaigns (5-step email follow-up, 3-step SMS follow-up, 3-step re-engagement). "Load starter campaigns" button in Settings empty state.

**Bug fixes bundled:** Sequence cancel logic now cancels ALL pending steps (not just day 3+) in pollReplies, check-tasks Job 11 send query, and Job 11 cancel block. Step scheduling anchored to `start_at` not enrollment time.

### Hot Lead Detection + Flame Badge — BUILT ✅ (2026-03-25)
- `lead_rating` column (`hot/warm/cold`) added to `customers` table (migration 085).
- CarGurus parser detects "Hot Lead" text in lead block body; sets `is_hot=true` on `ParsedLead`.
- AutoTrader parser detects "Shopper Reminder" in subject (re-engagement) and "high intent" signals.
- `ingestLead()` sets `lead_rating='hot'` when: source flags hot, source flags re-engaged, OR existing customer re-inquires (match by email or phone = `isReInquiry`).
- Flame badge (orange) shown in: customer list cards, pipeline board cards, customer detail TopBar header.
- Push + Telegram notifications include fire emoji and "HOT" / "Returning Customer" label.
- **Pending:** Apply migration 085 in Supabase SQL editor.

### Performance Hub (Analytics - Performance Tab) — BUILT ✅ (2026-03-25)
- Merged into `/analytics` as a second tab ("Overview" = existing metrics, "Performance" = new drill-down).
- `/reports` redirects to `/analytics`. Accessible on mobile via More > Analytics.
- **Overview tab** (existing): leads by source, response time, SMS stats, conversion funnel, voice, revenue, BHPH.
- **Performance tab** (new): response rate vs 80% target, avg response time vs 15-min target, activity breakdown by type, call outcomes, lead source ranking, pipeline funnel, rep performance table, vehicle activity table, customer drill-down thread view, CSV export on each section.
- **Rep drill-down:** outbound, calls (answered/VM/no-answer), SMS, email, avg response time, autoresponder count, color-coded vs benchmarks.
- **Vehicle drill-down:** inquiries, unique customers, outbound contacts per vehicle; click row to see customer activity thread.
- **AI Performance Brief:** "Generate Insights" button streams Groq analysis - What's Working / Gaps / Action Plan using actual org metrics and rep data.
- Date range: 7d / 30d / 90d presets + custom range; switching period auto-reloads active tab.
- API: `GET /api/reports?section=overview|reps|vehicles|customer&from=&to=` (service client, org-scoped).
- AI: `POST /api/reports/ai-brief` streams from Groq `llama-3.3-70b-versatile`.

### Landing Page Elevator Pitch — BUILT ✅ (2026-03-25)
- `ElevatorPitchSection` added between Hero and Pain sections on `LandingPage.tsx`.
- Full-width orange panel with first-person pain indictment, transformation promise, and navy CTA button.
- All em-dashes removed from entire landing page (replaced with hyphens per style rule).

### Next Best Lead Scoring — BUILT ✅ (2026-03-14)
- Decision scoring engine on Today queue: `priorityScore`, `winLikelihood`, `delayRisk`, `nextBestAction`, `reasons` per queue item.
- Ranks within each tier by score (freshness, delay risk, intent cues, contactability, recent replies) rather than time alone.
- "Do This Now" banner at top of Today — single clickable card linking directly to the top lead's customer page.
- Per-card rank number, recommended action, and win-likelihood % badge.
- Feature-flagged via `NEXT_PUBLIC_NEXT_BEST_LEAD_V1=true` env var — UI is off by default, scoring always runs.
- Today queue auto-refreshes on mount and on tab visibility change (fixes stale queue after replying from customer page).
- Realtime UPDATE subscription on activities — addressed/completed leads drop off queue instantly without navigation.
- **Phase B:** Intent score + ghost risk pipeline using last N customer/rep messages (AI-read history).

### Today Queue Cross-Page Sync — BUILT ✅ (2026-04-20)
- `addressed_at` column (migration 047) now applied — DB-level filter excludes acted-on leads from all Today queries.
- Realtime INSERT handler extended: outbound activity created from any page triggers Today queue refresh.
- `dismissedIds` useRef Set — optimistic local removal prevents refresh from restoring cards the rep just dismissed.
- Day 1 sequence emails (type=email, sequence_day=1) now correctly routed to `EmailFollowUpItem` via queueSort.ts fix (was falling to `TaskItem` and rendering raw JSON).
- `activities POST` route: when rep logs any outbound action, sets `addressed_at` on all pending inbound leads for that customer.

### Todo Item Actionable Links — BUILT ✅ (2026-04-20)
- Task detail sheet now shows all linked entities (customer + vehicle + receipt), not just one.
- Customer card: Call (tel:) and Text (sms:) quick-action links + Open → /customers/[id].
- Vehicle card: Open → /vehicles/[id].
- Fixed else-if chain that silently dropped the customer card when a task had both customer and vehicle linked.

### Sold Vehicle Notifications — BUILT ✅ (2026-03-14)
- When a vehicle is marked sold via MarkSoldSheet, buyer's pending inbound lead activities are auto-closed (`completed_at`).
- Step 3 of the Mark Sold flow surfaces a send-messages panel: buyer (thank-you) + all other interested customers (sold notification).
- Buyer card is green-tinted with a "Buyer" badge; pre-filled: personalized thank-you message.
- Other interested customers: pre-filled "it sold, we may have something else" message.
- Rep edits each message before sending — Send Text / Send Email / Skip per customer.
- Sending routes through existing `/api/sms/send` + `/api/email/send`, which auto-set `addressed_at` and drop leads off Today.

### Customer Retention Suite — BUILT ✅ (2026-03-20)
- **Trigger engine:** Daily cron (`retention-triggers`) auto-enrolls customers into sequences based on: birthday, sale anniversary, service due, post-sale thank you, referral thank you.
- **Configuration:** `Settings > Retention` — assign a sequence to each trigger type, configure day offsets (e.g. 7 days after sale, 60 days since last service, 0 days before birthday).
- **Card mailing:** Two delivery modes per org:
  - **Print and Mail:** Every Monday, batch HTML card file generated (multi-page, one card per customer), uploaded to `card-batches` Supabase Storage bucket, receptionist task created with download link, digest email sent to dealer admin.
  - **PostGrid:** Each card submitted to PostGrid API automatically using dealer's own API key (stored in org_settings.postgrid_api_key).
- **Referral tracking:** `customers.referred_by` FK + `referral_source` text. Auto-enrolls referrer in thank-you sequence when new referral is created. Analytics page at `/analytics/referrals` shows top referrers, referral counts, source breakdown.
- **Customer form:** Address (street, city, state, ZIP), birthday, last service date, referral source fields added to edit form.
- **Sequences UI:** Trigger type badge (orange) on sequences assigned to retention triggers.
- **New DB tables:** `retention_settings` (per org), `card_mailings` (mailing log).
- **Cron schedule:** `retention-triggers` = daily 9am PT; `card-batch` = Mondays 6am PT.
- **Storage bucket:** `card-batches` (created in Supabase dashboard).
- **Per-dealer PostGrid:** Each dealer brings their own PostGrid API key - no platform-level PostGrid account needed.
- **Migration 076:** Applied (customers address/retention fields, org_settings postgrid_api_key, sequences trigger_type/channel extension, retention_settings, card_mailings).

### BHPH Stripe Payment Link — BUILT ✅ (2026-03-20)
- Customer receives a pay-from-phone link in their BHPH payment reminder SMS.
- Each link is a one-time secure token (7-day TTL) stored in `bhph_payment_tokens`.
- Public page at `/pay/[token]` - no login required; shows dealer name, vehicle, amount due.
- Dealer provides their own Stripe publishable + secret keys (money goes directly to their Stripe account - no platform Connect needed).
- Payment flow: Stripe Elements → `PaymentIntent` → `stripe.confirmPayment()` → confirm API → auto-logs `bhph_payment` record + advances `total_paid` + `next_due_date`.
- Settings at `Settings > Payments & Booking` (admin only).
- `lib/bhph/paymentToken.ts` - token generation, URL builder, `getOrCreatePaymentToken()` (reuses existing pending token).
- Migration 080 adds `stripe_dealer_publishable_key`, `stripe_dealer_secret_key`, `booking_enabled`, `booking_intro_text` to `org_settings` + creates `bhph_payment_tokens` table.

### Public Customer Booking Page — BUILT ✅ (2026-03-20)
- Public page at `/book/[slug]` - customers self-schedule test drives or drop-ins.
- Available Mon-Sat, 9am-6pm, 30-min slots, 14-day lookahead.
- Form: name (required), phone (required), email (optional), date, time, notes.
- On submit: finds-or-creates customer record, creates appointment activity (priority: high), creates `appointment_confirm` task for dealer.
- Booking toggle + welcome message configured in `Settings > Payments & Booking`.
- Booking URL copyable from settings page; shared with customers via SMS/email.
- Fires `appointment_created` outbound webhook on booking.

### Outbound Webhooks — BUILT ✅ (2026-03-20)
- Dealers can register HTTPS endpoints to receive real-time events: `new_lead`, `stage_change`, `appointment_created`, `bhph_payment_received`, or `*` (all events).
- Payloads signed with HMAC-SHA256 (`X-DealerWyze-Signature: sha256=<hex>`); 64-char auto-generated secret shown once on creation.
- Fire-and-forget; 8-second timeout; all errors silently swallowed (no retries for MVP).
- Settings UI: `Settings > Communication > Webhooks` - list active endpoints, create with event selector, delete.
- `lib/webhooks/dispatch.ts` - shared dispatch helper used across the codebase.
- Events currently wired: `new_lead` (OfferUp SMS, new dealer SMS customer), `stage_change` (lead state API), `appointment_created` (calendar sheet, dealer SMS, booking page), `bhph_payment_received` (pay link confirm).
- Migration 081 creates `org_webhooks` table with RLS + partial index on active rows.

### Smart Segments + Bulk Enroll — BUILT ✅ (2026-03-20)
- Dealers save named customer filter presets (segments) and bulk-enroll all matching customers into a sequence in one click.
- Filter criteria: lead source, lead state (pipeline stage), uncontacted only, dormant N+ days, assigned rep.
- Live customer count + preview list before enrolling.
- Bulk enroll: skips unsubscribed, skips already-active in same channel, caps at 200 per run. Returns enrolled/skipped/error counts.
- UI at `/customers/segments` (linked from settings + customers nav).
- Saved segments persist: create, load filters from saved, delete.
- API: `GET/POST/DELETE /api/segments` (CRUD), `POST /api/customers/segment` (live filter query), `POST /api/customers/segment/bulk-enroll` (enroll action).
- Migration 082 creates `saved_segments` table with JSONB filters column + RLS.

### Email Blast to Past Customers
- "Send your new inventory to your customer list" campaign tool.
- Dealer picks a vehicle or "all new arrivals," selects recipients, sends.
- Uses existing email infrastructure (Resend).
- TCPA compliance: only customers who haven't opted out.

---

## Wholesale Dealer Network (Pillar 2 — 12-18 months)

### Real-Time Inventory Matching Alerts
- Dealer A is working a customer who wants a 2019 Silverado 1500 LT.
- Dealer A clicks "Find this vehicle" in the customer record.
- DealerWyze pings all dealers within 100 miles who have a wholesale-eligible match.
- Push notification to Dealer B: "A nearby dealer is looking for your 2020 Silverado — respond to connect."
- Push, not pull. This is how you get adoption from dealers who won't log in proactively.

### Dealer Trust / Reputation System
- Dealers rate each other after wholesale transactions (1-5 stars, verified transactions only).
- "Reliable" badge for dealers with 10+ transactions and 4.5+ rating.
- Critical for trust in the P2P network.

### Condition Report Standard
- `condition_report_json` field already added to vehicles (migration 064).
- Define a standard schema: paint (1-5), interior (1-5), mechanical (1-5), tires (1-5), accident history (Y/N), known issues (text).
- Dealers fill this out when marking a vehicle wholesale_eligible.
- Integration opportunity: partner with Lemon Squad or similar mobile inspectors for verified reports ($75-125/inspection).

### Wholesale Transaction Facilitation
- Flat fee: $75-$125 per completed wholesale transaction.
- Escrow-style: Dealer A pays DealerWyze, DealerWyze pays Dealer B after confirmation.
- No auction, no bidding — fixed price, fast close.
- Integration: Stripe Connect for payouts to dealers.

---

## Revenue Expansion

### Lender Marketplace
- Independent dealers get rejected by banks constantly.
- DealerWyze connects them to a curated panel of subprime/BHPH-friendly lenders.
  (Westlake Financial, CAC, DriveTime wholesale, etc.)
- Every approved deal = referral fee ($200-$500/deal).
- Infrastructure: dealer submits credit app through DealerWyze, lender responds.

### White-Label for Dealer Groups
- A dealer group with 5-8 locations pays $500/mo for a branded version.
- Aggregates all location inventories under one consumer-facing URL.
- "Martinez Auto Group - Browse Our Inventory"
- 5x revenue per account, minimal extra work after initial build.
- Build after marketplace has traction.

### Carfax Affiliate Integration
- Add "View Vehicle History" link (Carfax affiliate) on every VDP.
- Revenue: ~$3-5 per click-through.
- Consumer trust signal — dealers benefit too.
- Implementation: 2 hours + Carfax affiliate application.

---

## North Star Metric

**Published vehicle listings across all dealers.**

Every other growth metric flows from this:
- More published = more SEO pages
- More SEO pages = more consumer traffic
- More consumer traffic = more web leads
- More web leads = dealer sees ROI = stays subscribed + upgrades

Track this weekly in admin dashboard. Target: 10,000 published listings within 6 months of marketplace launch.

---

## Quick Win Backlog (low effort, high impact)

| Feature | Effort | Impact | Status |
|---|---|---|---|
| Vehicle staging + recon workflow | 2 days | High - dealer retention | BUILT |
| Share vehicle via SMS to customer | 2 hrs | High - daily adoption | BUILT |
| Dealer analytics for public pages | 3 hrs | High - retention | BUILT |
| Trade-in estimator (lead capture) | 4 hrs | High - 3x lead volume | BUILT |
| Vehicle intake scanner (VIN barcode + photo AI + NHTSA decode + dupe match) | 1 day | High - intake speed | BUILT |
| Receipt delete on Needs Review cards | 30 min | Medium - UX | BUILT |
| Receipt upload cancel button | 30 min | Medium - UX | BUILT |
| Staging vehicles in receipt assign picker | 30 min | Medium - recon accuracy | BUILT |
| Scan button on Ledger page | 15 min | Low - convenience | BUILT |
| Today page motivational messages (rotating, short) | 1 hr | Low - engagement | BUILT |
| Sequences / Autoresponder (SMS + email, per-channel) | 2 days | High - dealer retention | BUILT (migration 071 pending) |
| Autoresponder V2 (per-contact card, schedule, auto-stop, takeover task, labels) | 2 days | High - usability | BUILT |
| Vehicle Want List (fuzzy match, Today Tier 1 alert) | 1 day | High - lead recovery | BUILT (migration 072 pending) |
| Add body_style field to vehicle edit form | 30 min | Medium - want list accuracy | Pending |
| Context-aware scanner (lead/contact/vehicle) | 2 hrs | Medium - UX correctness | Pending |
| Carfax affiliate link on VDP | 2 hrs | Medium - trust + revenue | Pending |
| CSV inventory import (Frazer) | 4 hrs | High - adoption | Pending |
| Days on lot counter on VDP | 1 hr | Medium - urgency | Pending |
| AI listing description generator (vehicle detail) | 1 hr | High - saves dealer time | BUILT |
| AI pricing deal badge on public VDP (computeDealRating wired) | 2 hrs | High - consumer trust | Pending |
| Inventory performance score | 6 hrs | High - engagement | Future |
| Next Best Lead scoring + Do This Now banner | 1 day | High - daily engagement | BUILT |
| Sold vehicle auto-close buyer leads + notify interested | 3 hrs | High - queue hygiene | BUILT |
| BHPH Stripe payment link (pay from phone) | 1 day | High - BHPH collections | BUILT |
| Public customer booking page (/book/[slug]) | 4 hrs | High - lead capture | BUILT |
| Outbound webhooks (new_lead, stage_change, appt, payment) | 1 day | Med - integrations | BUILT |
| Smart segments + bulk sequence enroll | 1 day | High - outreach scale | BUILT |
| Deal checklist on customer detail | 4 hrs | Med - workflow | BUILT |
| Vehicle acquisition buy sheet | 4 hrs | Med - cost tracking | BUILT |
| BHPH PAY reply handler (SMS confirm) | 1 hr | Med - UX | BUILT |
| Voice-to-task (callback intent from Retell) | 2 hrs | Med - workflow | BUILT |
| Customer merge UI + API | 4 hrs | Med - data hygiene | BUILT |
| Add body_style field to vehicle edit form | 30 min | Medium - want list accuracy | Pending |
| Context-aware scanner (lead/contact/vehicle) | 2 hrs | Medium - UX correctness | Pending |
| Email blast to customer list | 8 hrs | High - dealer value | Future |

---

## Apollo Auto Physical Space (Tim's Dealership — El Monte CA)

### Dealership Layout — 20ft × 50ft × 10ft ceilings, glass front wall

**File:** `/home/tim/Applications/ApolloCRM/apollo-auto-dealership-layout.html`
Interactive 3D Three.js render + SVG floor plan + zone psychology guide + Behr paint chip reference.

#### Color Scheme (Behr — Home Depot)
| Zone | Color | Behr Code |
|------|-------|-----------|
| Left wall top (7ft) | Navy / Commodore | M510-7 |
| Left wall bottom (3ft) + Right wall + Back wall | Warm White / Antique White | PPU5-12 |
| Right wall accent stripe (36" from floor) | Navy (matches left) | M510-7 |
| Floor | Cobblestone gray | PPU18-16 |

**Status:** Purchased paint and started painting (2026-04-07). Looks great.

#### Layout Decisions
- 4 L-shaped cherry desks (Option B: long leg perpendicular to wall, toward aisle)
- Staggered placement: door is left side of glass front, customers drift right on entry
  - Right wall: D3 z=12, D4 z=24 (closer to front — greet first)
  - Left wall: D1 z=17, D2/deal desk z=29 (set back — more private)
- Deal desk (2nd left, rear) has privacy partitions: 7ft wide x 4ft wood + 12" frosted plexiglass top
- 2 x 50" TVs: front left (entry zone, ~7ft high), back center (lounge/waiting area)
- Back door (rear right corner, 36"x6'8"): staff/storage only
- Frosted glass sign on front wall: APOLLO AUTO / ApolloAuto.US / (805) 404-3873
