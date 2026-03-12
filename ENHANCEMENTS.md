# DealerWyze — Post-PRD Enhancements

Tracks features and improvements added outside the original SAAS_MASTER_PLAN.md scope.
Each entry includes the date, category, migration (if any), and what was built.

---

## 2026-03-06 — Onboarding team invites use email-based signup

**Category:** UX / Onboarding
**Migration:** none

**Why:** On Step 4 (“Invite Your Team”), the frontend POSTed only `email` and `role` to `/api/admin/users`, but the API required `email, display_name, and password`. This always returned 400, so dealers saw “Could not send invites. You can add team members later in Settings,” and could not invite teammates during onboarding. We want invites to work with just an email, letting teammates set their own password on first login.

**What was built:**
- **`app/api/admin/users/route.ts`** — Changed POST handler to support two paths:
  - If `email, display_name, password` are provided (admin tools), create the user immediately as before.
  - If only `email` (and optional `role`) are provided (onboarding), generate a friendly `display_name` from the email, send a Supabase `inviteUserByEmail` with `redirectTo = APP_URL + '/login'`, and upsert a `profiles` row with the org’s `org_id` and assigned dealer role. The endpoint now only requires `email` and returns 409 with a clear message when the email already has an account.
- **`app/(onboarding)/onboarding/page.tsx`** — The Step 4 “Invite Your Team” flow continues to send `{ email, role }` per member, but now the backend treats this as an invite flow, so invites succeed and teammates set their password on first login from the emailed link.

---

## 2026-03-06 — Yahoo IMAP: App Password guidance and clearer 422 error

**Category:** UX / Integrations
**Migration:** none

**Why:** Users connecting Yahoo Mail in onboarding saw "Connection failed: Command failed: AUTHENTICATE Invalid credentials" (422) when using their normal Yahoo password. Yahoo requires an App Password for IMAP; the UI did not make this clear or surface a helpful message on failure.

**What was built:**
- **`lib/leads/pollImap.ts`** — Extended `formatImapError` to detect Yahoo (`host` includes `yahoo`) and, on invalid-credentials-style errors, append: "Yahoo requires an App Password, not your regular account password. Go to account.yahoo.com → Account Security → Generate app password, then enter that here."
- **`app/(onboarding)/onboarding/page.tsx`** — When provider is Yahoo, show an inline hint under the App Password field: "Yahoo does not accept your regular password. Create an App Password at account.yahoo.com → Account Security → Generate app password, then enter it above."

---

## 2026-03-10 — POST /api/vehicles for onboarding first vehicle

**Category:** UX / Onboarding
**Migration:** none

**Why:** The onboarding step "Add Your First Vehicle" sent POST to `/api/vehicles`, but no route existed, so the request returned 404 and the user saw "Could not add vehicle. Try again or skip this step."

**What was built:**
- **`app/api/vehicles/route.ts`** — New POST handler: accepts `vin`, `year`, `make`, `model`, `trim`, `price`, `mileage`, `status`; validates required year/make/model; generates `stock_no` from VIN suffix or timestamp; inserts vehicle with `user_id = profile.org_id` via server Supabase client (RLS + free-tier vehicle cap trigger apply). Returns `{ id }` on success; returns 403 with a clear message when free-tier 100-vehicle limit is hit.

---

## 2026-03-10 — Million-Dollar Message framework (Marketing)

**Category:** Marketing
**Migration:** none

**Why:** To uncover and sharpen DealerWyze's core message using a structured, AI-assisted process: intellectual inventory, demand alignment, emotional copy, clarity distillation, and visualization.

**What was built:**
- **`Marketing/MILLION_DOLLAR_MESSAGE.md`** — Step-by-step guide with six sections: application context (paste into prompts), intellectual inventory, relevance/demand match, emotional sales copy, clarity optimization (5→30 words), and guided visualization. Includes copy-paste prompts for ChatGPT/Claude tied to DealerWyze and the dealer audience.

## 2026-03-10 — Email “customer not found / no email” for pasted leads

**Category:** UX / Integrations
**Migration:** none

**Why:** When a lead was pasted (e.g. CarGurus digest) and matched an existing customer by phone, the customer record was never updated with the pasted email. Sending email then failed with “Customer not found or has no email address” even though the pasted text showed an email.

**What was built:**
- **`app/api/leads/paste/route.ts`** — When matching an existing customer (by phone or email), backfill `customers.email` if the customer currently has no email and the pasted lead has one (CarGurus digest loop and single-lead path). Aligns with `lib/leads/ingest.ts` behavior.
- **`app/api/email/send/route.ts`** — Split 404 handling: if customer exists and belongs to org but has no email, return a clear message: “This contact has no email on file. Add it under Edit lead, or paste the lead again so we can backfill it.”

---

## 2026-03-10 — Intervo Website Agent Widget on Landing Page

**Category:** UX / Support
**Migration:** none

**Why:** Needed a quick way to test a temporary website voice/chat agent on the public landing page without touching the authenticated app experience.

**What was built:**
- **`components/landing/LandingPage.tsx`** — Loads the Intervo widget script and applies a best-effort CSS override to float the widget on the right side (right-center) of the page.

---

## 2026-03-09 — Paperclip / Quick Document Attach on Customer & Lead Cards

**Category:** UX / Document Management
**Migration:** none

**Why:** The `CustomerCard` component had a paperclip button but was only used in search results. The main customers list (`CustomersListClient`) and the Today page lead cards (`NewLeadCard`) rendered their own UI without it, leaving the attach feature invisible to users in their primary workflows.

**What was built:**
- **`components/customer/CustomersListClient.tsx`** — Added `Paperclip` icon button on every mobile row (between the Link and archive button). Added a dedicated paperclip `<th>` + `<td>` column in the desktop table. Both share a single `uploadCustomerId` state — one `CustomerQuickUploadSheet` instance mounted outside the map loop handles all rows.
- **`components/leads/NewLeadCard.tsx`** — Added paperclip `<Button>` to the action row (alongside Call / SMS / Email). Opens `CustomerQuickUploadSheet` for that customer. Works on all viewport sizes.

---

## 2026-03-09 — Stripe Product & Billing Configuration

**Category:** Billing / Infrastructure
**Migration:** none (Stripe dashboard + Vercel env vars only)

**Why:** Storage pack Stripe products, webhook events, and customer portal plan-switching needed to be properly configured before go-live.

**What was configured:**
- **Products:** Tier 1 — Base OS ($150/mo), Tier 2 — Base OS + Voice Assistant ($350/mo), 10GB Storage Add-on ($4.99/mo), 25GB Storage Add-on ($9.99/mo)
- **Pricing:** All tax-exclusive (correct for B2B SaaS)
- **Webhook:** Added `invoice.payment_succeeded` → now 5 events total matching all code `case` handlers
- **Customer portal:** Plan switching enabled (Tier 1 ↔ Tier 2), proration set to "Prorate charges and credits", retention coupon added (20% off 3 months shown on cancel)
- **ACH Direct Debit:** Enabled (lower fees for B2B monthly billing)
- **Vercel env vars:** `STRIPE_PRICE_ID_STORAGE_10GB` + `STRIPE_PRICE_ID_STORAGE_25GB` added; all tier price IDs confirmed
- **Account cleanup:** Consolidated to single DealerWyze account structure

**Pending (go-live):**
- Copy all products to Stripe live mode
- Update Vercel prod env vars with live keys
- Complete Stripe "Action required" business verification
- Update support email to support@dealerwyze.com in Stripe Public details
- Add Stripe Radar rules: block if CVC fails, block if ZIP fails

---

## 2026-03-07 — Inventory Sync: Safe Removal with Dealer Review Queue

**Category:** Data Safety / Inventory
**Migration:** `056_sync_removed.sql` — adds `sync_removed_at timestamptz` to `vehicles` + partial index

**Why:** A failed or partial sync (e.g. dealer website blocking the scraper) was silently deleting all vehicles not returned by the scrape. This caused catastrophic data loss — 21 of 23 vehicles disappeared after one bad sync. Inventory data must never be auto-deleted by an automated process without dealer confirmation.

**What was built:**
- **`app/api/inventory/sync/route.ts`** — Replaced delete-to-archive logic with `status = 'sync_removed'` + `sync_removed_at` timestamp update. Vehicles not found in a sync are flagged, not deleted. Return key renamed `archived` → `needs_review`.
- **`app/api/vehicles/[id]/status/route.ts`** (new) — `PATCH` endpoint to restore a `sync_removed` vehicle to `available` (dealer confirms it's still in stock). Clears `sync_removed_at`. Scoped to `profile.org_id`.
- **`components/vehicle/SyncRemovedSection.tsx`** (new) — Amber warning banner at top of Inventory listing. Shows each flagged vehicle with two actions: **Still Here** (restore to available) and **Mark Sold** (opens existing `MarkSoldSheet` for full cash/finance/BHPH entry). Collapsible. Renders nothing when queue is empty.
- **`app/(app)/vehicles/page.tsx`** — Fetches `sync_removed` vehicles in parallel with main list. Excludes them from All/Available/Pending tab counts and from the main list query. Renders `SyncRemovedSection` above the inventory grid.
- **`components/vehicle/SyncInventoryButton.tsx`** — Updated result display: "+X added · Y need review" instead of "+X -Y archived".

---

## 2026-03-07 — Single Inventory Page URL (One Field)

**Category:** UX
**Migration:** none

**Why:** Two fields (Website URL + Inventory path) were confusing; users often pasted the full inventory page URL. One field is simpler and matches how the URL is used (single fetch URL).

**What was built:**
- **Settings → Organization:** Replaced "Website URL" and "Inventory path" with a single "Inventory page URL" field. Helper text and placeholder use a full URL example (e.g. `https://www.yourdealer.com/cars-for-sale`). Existing data: display value is computed from url + path so legacy base+path still shows as one URL; on save, full URL is stored in `dealer_website_url` and path is cleared.
- **`app/api/settings/org/route.ts`:** When PATCH receives `dealer_website_url` and does not receive `dealer_website_inventory_path`, set path to empty so sync uses the single URL.
- **`app/api/inventory/sync/route.ts`:** When `dealer_website_inventory_path` is empty, use `dealer_website_url` as the full fetch URL; otherwise keep backward-compat path append. Error message updated to "Add your inventory page URL in Settings → Organization (Inventory page URL)".

---

## 2026-03-07 — Inventory Sync URL Handling and Timeout (502 Fix)

**Category:** Integrations / Reliability
**Migration:** none

**Why:** Using the full inventory page URL (e.g. `https://www.apolloauto-to.com/cars-for-sale`) as the "Website URL" caused the sync to request a wrong URL (double path) and could contribute to 502s. The sync also had no fetch timeout, so slow or unresponsive dealer sites could hang and trigger gateway timeouts.

**What was built:**
- **`app/api/inventory/sync/route.ts`** — Normalized fetch URL so if the dealer website URL already ends with the inventory path, the path is not appended again. Added 20s fetch timeout (AbortController) and a browser-like User-Agent to reduce blocks. On timeout, return an actionable message ("Your site took too long to respond. Try again in a few minutes or contact support if it keeps happening."). Use request origin for building vehicle listing links so `/details/...` resolves correctly whether the user entered base URL or full inventory URL.

---

## 2026-03-07 — User-Friendly Messages and Error Copy (Non-Technical, Actionable)

**Category:** UX
**Migration:** none

**Why:** Messages, errors, directions, and tooltips needed to be understandable by non-technical users and actionable (tell them what to do). Technical terms like "webhook," "Twilio," "10DLC," "BYON" were confusing; API errors were not helpful.

**What was built:**
- **Settings → Organization (phone/SMS):** Replaced "SMS webhook automatically if the number is on our Twilio account" with "If we already manage this number for you, we'll connect it so texts and calls work right away. No extra setup needed." Clarified provision options (Toll-Free "Ready now," Local "May take a few days," "I have a number"). Release confirm and voice-agent copy made plain-language and actionable.
- **API errors:** provision-phone (trial, already has number, invalid number), provision-voice (need phone first), inventory sync (missing website, fetch failed, no vehicles found) now return clear, actionable messages.
- **Sync/scan UI:** Gmail sync error detail ("If you contact support, give them this code…"); Lead Scanner quota and error messages; Sync Inventory fallback and tooltip ("Pull latest vehicles from your dealership website"); DealerBrief error ("We couldn't load your brief right now" + Try again).
- **Customer/SMS:** "SMS Opted Out" → "This customer asked to stop texts. You can't send SMS to this number." TemplatePicker "Send Now delivers via Twilio" → "Send Now sends the text right away to the customer's phone." Gmail account helper text simplified.
- **Misc:** Voice provision failure and phone provision failure fallbacks; Voice agent "A phone number must be provisioned first" → "Add a business phone number first… Then you can turn on the AI voice agent."

---

## 2026-03-07 — Google Auth Transition to apolloai.us@gmail.com

**Category:** Integrations / Docs
**Migration:** none

**Why:** Standardize on apolloai.us@gmail.com for Google OAuth (Gmail, Calendar), support email forwarding, and one-off scripts instead of the previous account.

**What was built:**
- **`GOOGLE_AUTH_TRANSITION.md`** — Step-by-step: create/use Google Cloud project as apolloai.us@gmail.com, OAuth consent screen, redirect URIs, env vars (`GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`), optional IMAP/VAPID and support forwarding.
- **Docs/scripts** — Replaced kmaautosinc@gmail.com with apolloai.us@gmail.com in `scripts/get-refresh-token.mjs`, `SAAS_CHECKLIST.md`, `DEALERWYZE_MASTER_PLAN.md`, `ApolloCRM_PRD.md`.

---

## 2026-03-07 — Free Beta Tier

**Category:** Growth / Billing
**Migration:** `053_free_tier_caps.sql`

**Why:** Open the product to early users during active beta with no credit card required. Collect real feedback, validate the product, and build a user base before charging. Paid plans (Core $99.95, Core+Voice $199) launch after beta ends.

**What was built:**

- **Registration auto-approval** (`app/api/auth/register/route.ts`): new orgs created with `subscription_status = 'free'` and `approved_at = now()`. Redirect goes to `/today` directly (no pending queue). Abuse flags (IP clustering, device fingerprint, churn detection) still run before org creation.
- **Landing page** (`components/landing/LandingPage.tsx`):
  - Pricing section redesigned: **Beta Access ($0)** card featured in navy/orange; Core and Core+Voice shown greyed-out as "Coming Soon".
  - Orange beta notice banner above pricing cards explaining the testing phase and 30-day conversion notice commitment.
  - All hero and CTA copy updated: "Start Free — No Card Needed" / "Free during beta · No credit card · No commitment".
- **In-app Beta Banner** (`components/layout/BetaBanner.tsx`): dismissible amber banner at the top of every app page. Links to support@dealerwyze.com and reminds users they're in beta.
- **Feedback Button** (`components/layout/FeedbackButton.tsx`): floating navy button (bottom-right, above mobile nav). Opens a modal with type selector (Bug / Suggestion / Question / Compliment) and message field. Sends email to support@dealerwyze.com via Resend with user name and org ID.
- **Feedback API** (`app/api/feedback/route.ts`): authenticated POST — validates input, sends formatted email via `sendNotificationEmail()`.
- **Usage caps** (free tier: 200 contacts, 100 vehicles):
  - Client-side: count check before each insert in `customers/new/page.tsx` and `vehicles/new/page.tsx`; shows alert at limit.
  - DB-level: `053_free_tier_caps.sql` adds `BEFORE INSERT` triggers on `customers` and `vehicles` that raise an exception for `subscription_status = 'free'` orgs at the cap. Bypasses client entirely — protects against direct SDK calls.

**Beta transition plan (embedded in landing page):**
- Current: full access, no card, $0
- End of beta: 30 days notice minimum; early beta users get discounted rate
- After beta: Core $99.95/mo or Core+Voice $199/mo (both shown on pricing page)

---

## 2026-03-07 — Security Hardening (Critical + High Priority Fixes)

**Category:** Security
**Migration:** none (all code changes)

**Why:** Full security audit (report: `security-scan-20260306.md`) identified 3 Critical, 9 High, and 7 Medium findings. This batch addresses all Critical and most High items.

**What was built / fixed:**

- **C-1 — Deleted `/api/dev-login`**: Production backdoor (magic-link bypass protected only by a brute-forceable secret) removed entirely.
- **C-3 — Twilio HMAC on bhph/webhook and fax/callback** (`app/api/bhph/webhook/route.ts`, `app/api/fax/callback/route.ts`): added `validateTwilioSignature()` (HMAC-SHA1, `timingSafeEqual`) before reading any body params. Unauthenticated Twilio requests now return 403.
- **C-2 + M-1 — Deactivated user access** (`lib/auth/profile.ts`): `requireProfile()` now checks `deactivated_at` (signs user out + redirects) and null `org_id` (redirects to `/login?reason=no_org`).
- **H-5 — Staff session secret** (`lib/auth/staffSession.ts`): `STAFF_SESSION_SECRET` env var is now required — throws on missing (app crash on startup without it). Replaced fallback chain that silently used the Supabase service role key.
- **M-4 — Staff write-mode TTL** (`lib/auth/staffSession.ts`): Remote Admin (write-mode) impersonation TTL reduced from 2h to 30min. Read-only stays at 2h.
- **H-7 — VAPI callback timing-safe** (`app/api/voice/vapi-callback/route.ts`): replaced `!==` string comparison with `crypto.timingSafeEqual()`.
- **H-2 — Raw 'admin' role strings** (5 routes): replaced `role !== 'admin'` checks with canonical role helpers (`isDealerAdmin`, `canAccessBhph`, `requirePlatformSuperAdmin`):
  - `app/api/bhph/create/route.ts`
  - `app/api/receipts/ledger/[id]/route.ts`
  - `app/api/admin/provision-voice/route.ts`
  - `app/api/inventory/sync/route.ts`
  - `app/api/admin/provision-phone/route.ts`
- **M-7 — Data retention uses canceled_at** (`app/api/cron/data-retention/route.ts`): fixed org expiry query to use `canceled_at` (not `updated_at`) so orgs canceled but never updated don't skip purge.
- **H-9 — Analytics date range cap** (`app/api/analytics/route.ts`): added 365-day max validation; returns 400 on invalid or over-range dates.
- **M-2 — Receipt upload size cap** (`app/api/receipts/upload/route.ts`): added 4MB base64 length check before `Buffer.from()` to prevent memory exhaustion.
- **H-4 — Gmail webhook OIDC verification** (`app/api/gmail/webhook/route.ts`): added full Google OIDC JWT verification (fetches Google JWKs, validates signature, checks audience + expiry). Unauthenticated Pub/Sub pushes now return 401. **Requires Google Cloud Console Pub/Sub subscription to be configured with OIDC auth + audience `https://dealerwyze.com/api/gmail/webhook`.**
- **CLAUDE.md created** with security-first mindset section, architecture rules, webhook patterns, role helper reference, and pre-commit security checklist.

---

## 2026-03-07 — Abuse Mitigation at Registration

**Category:** Security / Abuse Prevention
**Migration:** none (register route + existing `abuse_flags` table)

**Why:** Fraudulent signups (multi-account abuse, bot farms, VoIP/SMS farming) needed detection at the registration boundary before an org gains access.

**What was built** (`app/api/auth/register/route.ts`):

- **IP /24 subnet clustering** (Vector 2): extracts client IP, derives /24 subnet, counts organizations from the same subnet registered in the last 7 days. If > 2 → inserts `abuse_flags` row (`flag_type: 'ip_clustering'`, severity: high, details: subnet + count).
- **Device fingerprint** (Vector 3): SHA-256 hash of `IP + normalized User-Agent`. Stored on the org row (`signup_fingerprint`). If another org used the same fingerprint in the last 30 days → inserts `abuse_flags` (flag_type: `device_fingerprint_match`, severity: high).
- Both checks are non-blocking (signup proceeds) but flag the org for admin review in the `abuse_flags` table. Combined with existing churn re-register detection and disposable email flagging.

---

## 2026-03-06 — Response Time Stamped for All Outbound Responses

**Category:** UX / Data
**Migration:** `052_stamp_response_time_on_activity.sql`

**Why:** Response time (`first_response_at`, `response_time_seconds`) was only updated when sending SMS via the Twilio API. Reps who responded by email or call did not get their response time recorded.

**What was built:**
- **Trigger** `trg_stamp_response_time_on_activity` (AFTER INSERT on `activities`): when an outbound activity (type `sms`, `email`, or `call`) with a `customer_id` is inserted, the trigger atomically updates the customer’s `first_response_at` and `response_time_seconds` if not already set. Response timestamp used is `COALESCE(completed_at, created_at)`.
- **API** `app/api/sms/send/route.ts` — removed duplicate application-level stamp; all channels now rely on the trigger so email and call responses also update response time.

---

## 2026-03-06 — Editable Notes (Creator or Admin)

**Category:** UX
**Migration:** `051_activities_created_by.sql`

**Why:** Notes should be editable by the person who created them or by an org admin. A dedicated permission model avoids accidental edits and supports accountability.

**What was built:**
- **DB:** `activities.created_by` (UUID, FK to auth.users, nullable). Trigger on INSERT sets `created_by = auth.uid()` when not provided, so all new activities (including notes) are stamped with the creator. Legacy notes have `created_by` null and are editable only by admin.
- **API:** `PATCH /api/activities/[id]` accepts `body` for type `note`; allows update only if the current user is the note creator (`created_by === profile.id`) or has dealer-admin role (`isDealerAdmin(profile.role)`). Returns 403 otherwise.
- **Types:** `Activity` includes optional `created_by`.
- **UI:** Customer detail page passes `currentUserId` (profile.id) and `isAdmin` (via `isDealerAdmin(profile.role)`) to `ActivityTimeline`. Timeline shows an Edit (pencil) button on notes when the user can edit; opening it shows a sheet with the note body; Save calls the PATCH and refreshes the activity list.

---

## 2026-03-06 — Author Name Prefix on Notes, Comments, and Tasks

**Category:** UX
**Migration:** none

**Why:** When multiple users leave notes, comments, or tasks for a lead/customer, the entry should show who wrote it. The user's name is now captured and prefixed to the body as `name: FirstName LastName` so every note/comment/task displays its author.

**What was built:**
- `lib/utils.ts` — **prefixWithAuthorName(displayName, body)** helper; prefixes body with `name: {displayName}\n` when displayName is present.
- `app/api/auth/me/route.ts` — GET response now includes **display_name** for use by client components.
- **Client components that create notes/tasks/appointments** now fetch display_name (from /api/auth/me when open) and prefix the saved body:
  - `components/customer/AddNoteModal.tsx` — note body prefixed before insert.
  - `components/call/VoiceRecorder.tsx` — voice note body prefixed before insert.
  - `components/call/AfterCallModal.tsx` — call outcome notes and follow-up task body prefixed.
  - `components/calendar/AddAppointmentSheet.tsx` — appointment body prefixed (profile select now includes display_name).
  - `components/customer/AddTaskModal.tsx` — task body prefixed before insert.
- **API routes** that create notes now prefix with profile.display_name:
  - `app/api/customers/[id]/state/route.ts` — lead state change note.
  - `app/api/leads/paste/route.ts` — pasted lead note (single and CarGurus digest).
- **Outbound email, SMS, and voice** now store the acting user’s name on the activity:
  - `components/customer/EmailButton.tsx` — outbound email body prefixed when logging.
  - `components/leads/NewLeadCard.tsx` — initial and scheduled follow-up email bodies prefixed.
  - `components/leads/EmailFollowUpItem.tsx` — follow-up email and next scheduled body prefixed.
  - `components/sms/TemplatePicker.tsx` — outbound SMS body prefixed when logging (native app and Twilio path).
  - `app/api/sms/send/route.ts` — outbound SMS body prefixed when logging (Twilio send).
  - `components/call/CallButton.tsx` — outbound call activity created with prefixed body (`name: …\nOutbound call`); `AfterCallModal` keeps author and uses notes or “Outbound call” when completing.

---

## 2026-03-06 — Lead Response: Virtual Appointments, Driveway Delivery, Virtual Financing

**Category:** UX
**Migration:** none

**Why:** Buyers who select “Virtual Appointments, Driveway Delivery, Virtual Financing” on listings (e.g. Cars For Sale) are asking how to do the deal remotely, not for more vehicle specs. A dedicated first-touch response clarifies next steps and reduces back-and-forth.

**What was built:**
- `components/sms/TemplatePicker.tsx` — New First Contact template “Virtual + delivery + financing”: confirms vehicle/price and offers virtual walkthrough, delivery, and financing with a single CTA (preferred time for virtual look). Uses {firstName}, {vehicle}, {price}, {dealerName}.
- `LEAD_RESPONSE_VIRTUAL_DELIVERY.md` — Doc explaining what these buyers are looking for, ready-to-use auto-text and auto-email copy, and how to add the email template in Settings → Lead Response Templates. **Update:** Added a detailed email template for leads with no phone number (self-contained body explaining virtual appointment, delivery, and financing with clear CTAs and optional “reply with your phone number”).

---

## 2026-03-06 — Email {link} = Actual Car Listing (from Synced Inventory)

**Category:** UX
**Migration:** none

**Why:** The `{link}` variable must point to the specific vehicle the customer is interested in, not the main cars-for-sale page. Listing URLs are stored when inventory is synchronized from the dealer website.

**What was built:**
- `app/api/inventory/sync/route.ts` — Sync always updates `listing_url` on matched vehicles from scraped page links (removed `.is('listing_url', null)`), so every sync refreshes the stored vehicle link.
- `components/leads/NewLeadCard.tsx` — Resolve listing URL from DB: try VIN lookup first; if no result, parse year/make/model from lead vehicle line and look up a vehicle with `listing_url` set. Added `parseYearMakeModel()` for "2009 Acura MDX"–style lines. `{link}` is now the actual car when we have a match in synced inventory; otherwise falls back to org inventory page.
- `components/customer/EmailButton.tsx` and org settings (unchanged): already use vehicle `listing_url` when present; fallback to main page only when no vehicle or no `listing_url`.

---

## 2026-03-06 — Paste Lead: CarGurus Multi-Lead Digest

**Category:** UX / Integrations
**Migration:** none

**Why:** Pasting a CarGurus daily LeadAI digest email (multiple leads in one email) failed because the paste flow only handled single leads and did not call the existing CarGurus digest parser.

**What was built:**
- **Paste API** (`app/api/leads/paste/route.ts`): Before single-lead detection, call `parseCarGurusDigest('', text)`. If it returns one or more leads, process each (find or create customer by phone/email, insert activity), then return `{ multiple: true, results: [...] }`. Skips leads with no phone and no email; returns 422 if digest had no valid leads.
- **PasteLeadDialog** (`components/customer/PasteLeadDialog.tsx`): When response has `multiple: true`, show "✅ N leads imported" and a scrollable list of each lead with name, vehicle, phone/email, and "View contact" link; single-lead response unchanged.

---

## 2026-03-06 — Paste Lead: Labeled-Field (CRM) Format

**Category:** UX / Integrations
**Migration:** none

**Why:** Pasting a lead from a CRM or dealer lead view (e.g. Carsforsale.com card with "Email:", "Phone: N/A", "Lead Source:") failed to import because the paste flow only recognized OfferUp/AutoTrader or relied on AI, which could fail or be unconfigured.

**What was built:**
- `lib/leads/parseLabeledPaste.ts` — **isLabeledLeadPaste(text)** detects text with Email:/Phone: and Lead Source or Contact Type; **parseLabeledLeadPaste(text)** extracts name (first line), email, phone (N/A treated as null), vehicle (year make model + price), note, and source (carsforsale, cargurus, etc.). Supports values on the next line (e.g. "Email:\nbrown@..."). 
- `app/api/leads/paste/route.ts` — Run labeled parser before AI fallback; validate that parsed lead has name and (phone or email) and return 422 with clear message if not.

---

## 2026-03-06 — Customer Email Picker Uses Settings Templates

**Category:** UX
**Migration:** none

**Why:** Email templates created in Settings → Lead Response Templates were saved to the database but the customer Email flow used only a hardcoded list, so custom templates never appeared when emailing a customer.

**What was built:**
- `components/customer/EmailButton.tsx` — Fetches email templates from `templates` (channel = email) when the sheet opens; picker now shows org templates from the DB. Empty state: "No email templates yet. Add them in Settings → Lead Response Templates." Removed hardcoded `EMAIL_TEMPLATES` array.

---

## 2026-03-06 — COGS Alert Webhook + SMS Overage UI

### COGS alert webhook
**Category:** Platform Ops / Observability
**Migration:** none

**Why:** Platform staff need visibility into usage/cost-related alerts (voice cap, SMS quota, abuse) in a single channel (e.g. Slack) without opening the admin panel.

**What was built:**
- `lib/cogs/alertWebhook.ts` — `fireCogsAlertBackground(payload)` can deliver to one or more of: **webhook** (POST JSON to URL), **Telegram**, **SMS** (Twilio). Payload: `org_id`, `alert_type`, `severity`, `metadata?`, `created_at`, `source: 'dealerwyze-cogs'`. Fire-and-forget; 5s timeout; failures logged only.
- **Voice alerts** — `app/api/voice/retell-callback/route.ts`: after each COGS-related `admin_alerts` insert, call `fireCogsAlertBackground` for `repeated_caller`, `voice_spike`, `voice_abuse_hard_cap`, `voice_cap_reached`, `voice_500min_warning`.
- **SMS quota alerts** — `lib/sms/quota.ts`: after `quota_80pct` / `quota_exceeded` insert, call `fireCogsAlertBackground`.
- **2× quota exceeded** — `app/api/cron/check-tasks/route.ts`: after inserting `2x_quota_exceeded`, call `fireCogsAlertBackground`.

**Setup (use any combination; all optional):**
- **Webhook:** `COGS_ALERT_WEBHOOK_URL` — e.g. Slack Incoming Webhook URL; receives full JSON.
- **Telegram (easiest, no new system):** `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`. Create a bot via [@BotFather](https://t.me/BotFather), get token; send the bot a message, then open `https://api.telegram.org/bot<token>/getUpdates` to see your `chat_id`. Messages are short one-liners (e.g. "DealerWyze: quota_exceeded — org abc123…").
- **SMS (uses existing Twilio):** `COGS_ALERT_PHONE` — E.164 number to receive alerts. Throttled: same alert_type+org at most once per 15 min to avoid spam. Requires `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` already set.

### SMS overage rate UI
**Category:** Billing / UX
**Migration:** none

- Admin org page: copy updated from "$0.03/msg" to "$0.08/msg" for SMS overage.
- Settings billing page: overage copy now uses `SMS_OVERAGE_RATE` from `stripeConstants` (single source of truth; displays $0.08/msg).

---

## 2026-03-06 — Desktop Responsive Layer (All Phases Complete)

### Progressive responsive upgrade for lg: (1024px+) breakpoints
**Category:** UX / Frontend
**Migration:** none

**Why:** DealerWyze was 100% mobile PWA locked to `max-w-md` (428px). Dealership owners on desktop needed richer multi-panel views: side-by-side analytics, data tables, and a dashboard — things the phone form factor can't support. The goal was a responsive layer that activates at `lg:` without breaking the existing mobile experience.

**What was built:**

#### Phase 1 — Layout Shell

**`app/(app)/layout.tsx`**
- Removed `max-w-md` hard lock → responsive container: mobile (`< lg`) keeps `max-w-md mx-auto`; desktop (`lg+`) uses `flex h-dvh w-full` (sidebar + content pane)
- Added `<DesktopSidebar>` rendered only on `lg:` (hidden on mobile)
- `<BottomNav>` wrapped with `lg:hidden`; content area uses `pb-20 lg:pb-0`
- Fetches org name server-side for sidebar branding; passes impersonated org name when staff session active

**`components/layout/DesktopSidebar.tsx`** *(new)*
- Sticky left sidebar, 240px wide, dark blue (`#0D2B55`) with `#1B4A8A` border/dividers
- Nav groups: Base (Today, Leads, Inventory, Contacts) + Role nav (BHPH hidden for `dealer_rep`; Analytics hidden for `dealer_rep`; Fax, Support, Settings always visible) + Platform Admin link (superadmin only)
- Role-awareness via client-side `GET /api/auth/me` call (same source as BottomNav More page)
- Active state: `bg-white/10 text-[#F07018]` + orange left-border accent indicator
- DealerWyze logo + org name at top; org name in `text-white/50` truncated

**`components/layout/BottomNav.tsx`**
- Added `lg:hidden` to `<nav>` wrapper — hidden on desktop, unchanged on mobile

**`components/layout/TopBar.tsx`**
- Standardized to `sticky top-0` with `lg:border-b` — works in both contexts

#### Phase 2 — Owner Dashboard (Today Page)

**`app/(app)/today/page.tsx`**
- **KPI strip** (`hidden lg:grid lg:grid-cols-5`): New Leads | Appt Requests | Voice Leads | Waiting | Overdue — counts computed server-side, color-coded by threshold
- **3-column grid** (`lg:grid lg:grid-cols-3 lg:gap-0 lg:h-[calc(100dvh-7rem)]`) with per-column scroll (`lg:overflow-y-auto lg:h-full`) and column dividers (`lg:border-r`)
  - **Left column**: DealerBriefClient, ResponseTimeWidget, ReviewsSection, OnboardingChecklist
  - **Center column**: TodayContent (full lead activity feed — unchanged mobile component)
  - **Right column**: TodoSection (open tasks)
- Mobile: single-column stacked layout identical to pre-desktop build

#### Phase 3 — Analytics Desktop Layout

**`app/(app)/analytics/AnalyticsDashboard.tsx`**
- Date range pills: `overflow-x-auto` pill strip on mobile → `lg:mx-0 lg:px-0` inline on desktop
- Leads + Funnel section: `lg:grid lg:grid-cols-2 lg:gap-6` (side by side)
- SMS + Voice section: same 2-col grid
- Revenue + BHPH: full-width strip at bottom (unchanged)
- Outer wrapper: `lg:px-6` for wider breathing room on desktop

#### Phase 4 — Customer List: Desktop Data Table

**`components/customer/CustomersListClient.tsx`**
- Mobile card list wrapped in `lg:hidden` (unchanged behavior)
- **Desktop table** (`hidden lg:block px-6 pb-6`): sortable table with columns — Name (avatar + initials) | Phone | Source | State (badge with pipeline color) | Assigned To | Last Active | Response Time | Archive action
- Sort by Name or Last Active via column header buttons with `ArrowUpDown` icon
- Click row → navigate to `/customers/[id]` (or toggle select in select mode)
- Archive inline: expand to show reason input + OK/Cancel without leaving the page
- Bulk assignment floating bar: `lg:bottom-4` (vs `bottom-20` mobile) for desktop positioning

#### Phase 5 — Admin Panel: Org Table View

**`app/(app)/admin/page.tsx`**
- Stats strip: `grid-cols-2 lg:grid-cols-6` — 6 stats inline on desktop
- Mobile org cards wrapped in `lg:hidden`
- **Desktop org table** (`hidden lg:block`): Name (with health dot) | Status badge | Plan | SMS Usage bar + % | Last Active | Billing date — full-width, hover highlight, click row → org detail
- Pending org list unchanged (mobile-only; small list)

**Design decisions:**
- Same URLs — deep links work identically on mobile and desktop
- No recharts — CSS bar charts in analytics sufficient for current scale
- Role gating in DesktopSidebar mirrors `more/page.tsx` logic (same `dealerRoles.ts` functions)
- `Sheet` component (side="right") available for future customer detail slide-in panel — not activated in Phase 4 (full page nav chosen for simplicity)

---

## 2026-03-05 — Pricing, Affiliate/Coupon System, Overage Controls, Abuse Mitigations

### Pricing Model Update
**Category:** Billing / SaaS
**Migration:** 049, 050

Updated plan pricing and added Free tier:
- **Free**: $0/mo (250 contacts, 100 vehicles; no SMS/voice/fax/scan)
- **Plan 1 (Complete CRM)**: $149.95/mo (was $99.95)
- **Plan 2 (Voice AI)**: $199.95/mo (unchanged)
- **Annual discount**: 10% → $134.96/mo P1 / $179.96/mo P2
- `stripeConstants.ts`: Added `FREE_PLAN_LIMITS`, `ANNUAL_DISCOUNT`, `VOICE_MINUTES_INCLUDED=700`, `isFreePlan()`, `SMS_OVERAGE_RATE=0.08` (was 0.02), `free` plan tier in all Records.

### Affiliate Code + Commission Program
**Category:** Growth / Revenue
**Migration:** 049

Two-tier affiliate system tracked in DB, manually paid by admin:
- **`affiliate_codes` table**: `code` (unique), `type` (flyer|advisor), `owner_name`, `commission_first_pct` (default 10%), `commission_recurring_pct` (flyer=0%, advisor=2%)
- **Flyer codes**: 10% first month only — for registration office cards, DMV flyers
- **Advisor codes**: 10% first month + 2% recurring — for sales reps, finance advisors
- Admin API `POST/GET /api/admin/affiliates` — superadmin only, returns active dealer count per code
- Signup captures `?ref=CODE` → stored as `organizations.affiliate_code` (validated against DB; invalid codes silently dropped)

### Customer Referral Discount
**Category:** Growth / Billing
**Migration:** 049

Existing dealers who refer new dealers get 5% off their plan while the referral stays active:
- Signup captures `?via=slug` → `organizations.referred_by_org_id`
- On new org creation, `referred_by_org_id` dealer's `referral_discount_pct` set to 5%
- Referral field on org for billing system to apply

### Coupon System (Admin-Only)
**Category:** Billing / Admin
**Migration:** 049, 050

Superadmin-only discount codes with full audit trail:
- **`coupons` table**: code, discount_type (percent|fixed), discount_value, org_id (org-specific or open), max_uses, duration_months, valid_until, created_by, notes
- **`coupon_redemptions` table**: audit trail of applied coupons (who used what when)
- **`organizations.active_coupon_id`** / `active_coupon_discount` / `coupon_expires_at`
- Admin API `POST/GET /api/admin/coupons` — create and list; `PATCH/DELETE /api/admin/coupons/[id]` — edit or delete (delete blocked if ever used)
- Only platform superadmin can create coupons; no self-service for dealers

### Voice Abuse Policy & Cap Enforcement
**Category:** Security / Billing
**Migration:** 049

Replaced the loose 60,000 sec (1,000 hr!) default voice cap with proper limits:
- **Included**: 700 min/mo (42,000 sec) — standard AI receptionist usage
- **Alert**: 500 min → admin alert logged, `voice_overage_notified_at` stamped to prevent duplicate notifications
- **Overage opt-in**: `voice_overage_enabled` on org — if opted in, overage minutes tracked at $0.12/min instead of disabling
- **Hard abuse cap**: 1,500 min (90,000 sec) → voice disabled + `voice_abuse_hard_cap` critical alert regardless of opt-in
- `app/api/voice/retell-callback/route.ts`: rewritten cap logic with three tiers (alert/overage/hard-disable), voice_overage_minutes tracked

### SMS/MMS Overage Tracking
**Category:** Security / Billing
**Migration:** 049, 050

Extended quota system to track overage messages for future billing:
- `quota.ts`: When `sms_overage_enabled_v2=true` and count≥quota, message is allowed AND `sms_overage_count` incremented via `increment_sms_overage()` RPC
- MMS overage tracked via `increment_mms_overage()` RPC
- `is_overage: boolean` added to `QuotaStatus` response so calling code can tag overage activities
- Both counters reset each billing cycle alongside `monthly_message_count`

### Per-Org Limit Adjustment (Superadmin)
**Category:** Admin / Operations

New endpoint `GET/PATCH /api/admin/orgs/[id]/limits` — superadmin only:
- Adjustable per org: `voice_minutes_cap` (in minutes or seconds), `voice_enabled`, `voice_overage_enabled`, `sms_quota`, `sms_overage_enabled`, `scan_image_monthly_cap`, `scan_pdf_monthly_cap`
- All changes require `reason` field → written to `admin_audit_log`
- GET returns current limits with human-readable minutes alongside raw seconds

### Fax Page Cap (Monte Carlo Mitigation)
**Category:** Security / Billing
**Migration:** 050

- Added `monthly_fax_pages` (counter) and `fax_page_cap` (default 50/mo) to organizations
- `fax/send/route.ts`: checks cap before accepting fax; returns 429 if at limit
- Increments counter via `increment_fax_pages()` RPC after successful Twilio submission
- Fax pages reset each billing cycle alongside SMS quota

### Billing Cycle Reset — Full Overage Reset
**Category:** Billing / Cron

`/api/cron/check-tasks` quota reset now also resets:
- `monthly_fax_pages`, `sms_overage_count`, `mms_overage_count`, `voice_overage_minutes`
- `org_settings.voice_minutes_month`, `voice_overage_notified_at`

---

## 2026-03-05 — Edit Email Account (Name / Credentials)

### Edit email account details in Settings → Organization
**Category:** UX / Settings
**Migration:** none

**Why:** Users could add and remove email accounts but not change the display name (label) or update credentials (e.g. new app password, different IMAP host). They need to edit account details without removing and re-adding.

**What was built:**

#### API — `app/api/integrations/email/[id]/route.ts`
- **GET** — Returns one account for editing: id, label, email, provider, imap_host, imap_port, imap_user (no password). Org-scoped. Used to pre-fill the edit form and to detect OAuth vs IMAP (no imap_host ⇒ Gmail OAuth).
- **PATCH** — Updates account. **Gmail OAuth:** only `label` can be updated. **IMAP:** `label`, `email`, `provider`, `imap_host`, `imap_port`, `imap_user`, and optionally `imap_pass` (if provided, connection is tested before saving; omit to keep current password). Org-scoped.

#### UI — `app/(app)/settings/organization/page.tsx`
- **Edit** button (pencil) next to Remove for each email account. List shows **label** (or email) and email underneath.
- **Edit flow:** Click Edit → fetch GET `/api/integrations/email/[id]` → show edit form. **Gmail OAuth:** form has only "Display name" (label) and Update/Cancel; note that only the label can be changed. **IMAP:** full form (label, provider, email, app password with "leave blank to keep current", host/port for generic IMAP, IMAP user) and Update/Cancel.
- **Update:** PATCH with form values; on success the list is updated and edit form closed. Password sent only when non-empty so users can change name/email/host without re-entering password.

---

## 2026-03-05 — Lead Import in Settings + Editable Locations

### Lead Import section under Settings → Organization; Locations editable
**Category:** UX / Settings
**Migration:** none

**Why:** Users should be able to download the lead-import template and upload spreadsheets from Settings → Organization alongside email integrations. Locations were display-only (add/remove only); users need to edit name, address, phone, and primary flag without deleting and re-adding.

**What was built:**

#### Settings → Organization — `app/(app)/settings/organization/page.tsx`
- **Lead Import section** (in the same card as Email Integrations): "Lead Import" heading; short description; **Download template (CSV)** button (calls `GET /api/leads/import/template`); file input (CSV/XLSX, max 2 MB, 500 rows); **Import** button; error message; after success, summary (created, duplicate, skipped, errors, over_limit). Uses existing `POST /api/leads/import` and `handleDownloadImportTemplate` / `handleImportLeads` handlers.
- **Locations editable:** For each location card, added **Edit** (pencil) button. When editing, the card shows inline inputs for Name, Address, Phone, and "Set as primary location" plus **Cancel** and **Save**. **Save** updates the location in state (and clears other primary if this one is set primary); user must click **Save Changes** at bottom to persist. **Cancel** discards the draft. `editingLocationId` and `editLocDraft` state; `startEditLocation`, `saveEditLocation`, `cancelEditLocation`; `removeLocation` clears edit state when removing the edited location.

---

## 2026-03-05 — Spreadsheet Lead Import (Template + Flexible Columns)

### Import leads from CSV or Excel with template and column synonyms
**Category:** Integrations / UX
**Migration:** none

**Why:** Users manage leads in many ways and often have spreadsheets. We provide a canonical template (Name, Phone, Email, Vehicle, VIN, ZIP, Source, Comments) and accept uploads that match it or use common variations (e.g. "Customer Name", "Phone Number", "E-mail Address") so we can parse "countless variations" without manual column mapping in the UI.

**What was built:**

#### Library — `lib/leads/spreadsheetImport.ts`
- **TEMPLATE_HEADERS:** Name, Phone, Email, Vehicle, VIN, ZIP, Source, Comments.
- **Column synonyms:** Each canonical field has a list of accepted header names (e.g. name: "Full Name", "Customer Name", "Lead Name", "Contact"; phone: "Phone Number", "Mobile", "Cell"; email: "Email Address", "E-mail"; vehicle: "Car", "Interest", "Vehicle of Interest"; etc.).
- **buildColumnMap(headers):** Maps header index → canonical field using synonyms.
- **rowToLead(row, columnMap, rowIndex):** Converts one row to **ParsedLead**; requires Name + (Phone or Email); normalizes phone to 10 digits; normalizes source to LeadSource; uses name as primary_phone placeholder when only email provided (DB NOT NULL).
- **parseCsv(csv):** Splits on newlines, parses quoted CSV; returns { headers, rows }.
- **parseXlsx(buffer):** Uses `xlsx`; first sheet, first row = headers; returns { headers, rows }.
- **generateTemplateCsv():** Returns CSV string with template headers + one example row.

#### API
- **GET /api/leads/import/template** — Authenticated; returns CSV file download `leads-import-template.csv`.
- **POST /api/leads/import** — FormData with `file` (CSV or XLSX); max 2 MB, max 500 rows processed; validates that spreadsheet has Name and (Phone or Email) columns; builds column map, converts each row to ParsedLead, calls **ingestLead** with external_id `spreadsheet-{orgId}-{timestamp}-{rowIndex}`; returns **summary** (total_rows, processed, created, duplicate, skipped, errors, over_limit) and first 100 results.

#### UI — `components/leads/ImportLeadsDialog.tsx`
- Trigger button (spreadsheet icon) on Customers page next to Paste and Scan.
- Dialog: short description; **Download template (CSV)** button; file input (accept .csv, .xlsx, .xls); Import button; error message; after success, **Import complete** block with created/duplicate/skipped/errors/over_limit.

#### Customers page
- **ImportLeadsDialog** added to TopBar right (with ScanLeadButton, PasteLeadDialog, Add).

**Design:** Template-first so users get a known-good format; flexible synonyms so existing spreadsheets often work without changing headers. Future: optional step to map "Column A → Name" for odd layouts.

---

## 2026-03-05 — Parse & Import All Sample Email Types (KBB, Autolist, Carsforsale, CarGurus Phone, etc.)

### Email and paste support for every format in Sample_Emails
**Category:** Integrations
**Migration:** none

**Why:** Users receive leads from KBB, Autolist, Carsforsale.com, CarGurus phone leads, AutoTrader shopper reminders, and Facebook group messages. The system only parsed OfferUp, AutoTrader (wallet), and CarGurus submission emails. All sample types in `Sample_Emails/` should be parseable when received by email or when pasted.

**What was built:**

#### Parser — `lib/leads/parser.ts`
- **LeadSource** extended with `kbb`, `autolist`, `carsforsale`.
- **parseCarGurusPhoneLead:** "Phone Lead from CarGurus" — Caller Id, Phone, Zip, State (source: cargurus).
- **parseAutoTraderLead:** Now also matches **"Name:"** (Lead / Phone Lead / Shopper Reminder variants from dealerleads@autotrader.com and email@messages.autotrader.com).
- **parseKBBLead:** Dealer Price Quote and Phone Lead from dealerleads@kbb.com — same structure as AutoTrader (Name, E-Mail, Phone, ZIP, Buyer Comments, Vehicle).
- **parseAutolistLead:** "New connection from Autolist", referrals@autolist.com — name, email, comments, vehicle, VIN, price.
- **parseCarsforsaleLead:** New Lead / New Loan App from carsforsalemail.com — name, phone, city, loan/down amount, vehicle from subject.
- **parseFacebookMarketplaceLead:** Extended to match **"X sent a message to the group conversation"** from facebookmail.com (name from subject).
- **emailField:** Treats "Customer did not specify" / "Not specified" / "N/A" as empty.
- **AutoTrader/KBB phone:** Normalize "Not Provided by Shopper" / "Customer did not specify" to empty string.
- **parseAnyLead:** Runs CarGurus submission → CarGurus phone → AutoTrader → KBB → Autolist → Carsforsale → OfferUp → Facebook.

#### IMAP & Gmail — `lib/leads/pollImap.ts`, `lib/leads/poll.ts`
- **LEAD_DOMAINS:** added `messages.autotrader.com`, `messages.offerup.com`, `kbb.com`, `autolist.com`, `carsforsalemail.com`, `facebookmail.com`.
- **Gmail sender query:** added `from:kbb.com OR from:autolist.com OR from:carsforsalemail.com` so these leads are fetched and parsed.

#### UI — lead source labels and options
- **NewLeadCard.tsx**, **CustomersListClient.tsx:** SOURCE_LABELS for `kbb`, `autolist`, `carsforsale`.
- **customers/new/page.tsx**, **EditCustomerForm.tsx:** SelectItem options for KBB, Autolist, Carsforsale.com.

#### Paste & AI — `app/api/leads/paste/route.ts`, `lib/leads/visionIngest.ts`
- Paste API and **scanResultToParsedLead** map AI-detected source to `kbb`, `autolist`, `carsforsale` when pasting.
- **TEXT_LEAD_PROMPT** updated so **lead_source** can be "KBB", "Autolist", "Carsforsale".

**Sample_Emails coverage:** Lead Submission from CarGurus, Phone Lead from CarGurus, AutoTrader Phone Lead, Lead: Autotrader Vehicle, Autotrader Shopper Lead Reminder, KBB Dealer Price Quote, Phone Lead KBB, Autolist, Carsforsale New Loan App, Carsforsale New Lead (and Re: reply), Facebook "sent a message to the group", OfferUp Re: vehicle.

---

## 2026-03-02 — Paste Lead: AI Parsing for CarGurus and Any Format

### AI fallback when pasted lead is not OfferUp or AutoTrader
**Category:** UX / Integrations
**Migration:** none

**Why:** Users paste CarGurus leads (and other formats) into Paste Lead; the system only recognized OfferUp and AutoTrader and showed "Could not detect lead format. Supported: OfferUp, AutoTrader." Using AI makes it easy to support any pasted format without hardcoding each one.

**What was built:**

#### visionIngest — `lib/leads/visionIngest.ts`
- **TEXT_LEAD_PROMPT:** Prompt for pasted text (CarGurus, AutoTrader, OfferUp, or generic) asking for the same JSON structure as the image scanner (first_name, last_name, phone, email, vehicle_*, lead_source, notes, etc.).
- **scanLeadText(pastedText):** Calls Claude Haiku with the prompt; returns **LeadScanResult**; uses existing **parseResponse** so no new schema.

#### Paste API — `app/api/leads/paste/route.ts`
- When **OfferUp** and **AutoTrader** parsers both fail, **AI fallback:** calls **scanLeadText(text)**, then **scanResultToParsedLead(scan)**; maps result to the route’s **ParsedLead** (name, phone, email, note, vehicle, vin, zip) and sets **source** from scan (cargurus, autotrader, offerup, facebook, other).
- Phone normalized to 10 digits for display; 503 if ANTHROPIC_API_KEY is missing; 422 with a friendly message if AI parse fails.

#### UI — `components/customer/PasteLeadDialog.tsx`
- Copy updated: "Paste a lead (CarGurus, AutoTrader, OfferUp, or any format). Name, phone, email, and vehicle are extracted automatically—AI handles unknown formats."

---

## 2026-03-02 — Email Sync Error UX & 504 Mitigation

### User-facing sync errors: message, reason, action, support code, account email
**Category:** UX / Integrations
**Migration:** none

**Why:** After email sync, users sometimes saw a generic 504 or a raw error. They need a clear message, the reason, what to do next, and a support reference code. If they have multiple email accounts, they need to know which account failed.

**What was built:**

#### 504 mitigation — `app/api/cron/sync-leads/route.ts` & `app/api/leads/sync/route.ts`
- **Cron sync:** Org polls run in **parallel** (`Promise.allSettled`) with a **per-org 45s timeout** so the route responds before the gateway 504 (maxDuration 60s).
- **Manual sync:** Same **45s timeout**; returns a structured error instead of 504 when the single-org poll exceeds the limit.

#### Structured sync errors — `lib/syncErrors.ts`
- **SyncErrorDetail:** `message`, `reason`, `action`, `code`, optional **`accountEmail`** (which account failed or list for timeout).
- **Codes:** SYNC-001 (timeout), SYNC-002 (sync service error), SYNC-003 (reserved, e.g. disconnected).
- **getSyncError(code, options?)** with `technicalReason` and `accountEmail` for support and multi-account clarity.

#### API — `app/api/leads/sync/route.ts`
- On timeout: fetches enabled `email_accounts` for the org and includes comma-separated **accountEmail** in the error (so user knows which accounts were involved).
- On poll error: returns **errorDetail** with **accountEmail** from the failing account (from `runLeadPollForOrg`).

#### Poll — `lib/leads/poll.ts`
- **runLeadPollForOrg** now returns **{ error, accountEmail }** on first account failure (so the UI can show which account failed).
- Select includes `email` from `email_accounts`; exported **LeadPollResult** / **LeadPollError** types.

#### UI — `components/leads/SyncGmailButton.tsx`
- On 500 with **errorDetail**: shows **message**, **reason**, **action**, and **Reference: SYNC-XXX — include this code in a support ticket so we can look up the details.**
- When **accountEmail** is present, shows **Account: a@x.com** (or **Account: a@x.com, b@y.com** for timeout) so the user knows which account failed with multiple accounts.
- Error state stays visible 12s so the code can be copied.

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

---

## 2026-03-04 — Signup Clickwrap Consent (Session 4)

### P0 Compliance: Legal Enforceability of ToS
**Category:** Security / Legal
**Migration:** `046_terms_consent.sql`

**Why:** ToS enforceability requires affirmative clickwrap at signup — passive "by creating an account" language doesn't satisfy TCPA, CAN-SPAM, or standard SaaS contract law.

**What was built:**

#### Migration 046 — `supabase/migrations/046_terms_consent.sql`
- `organizations.terms_agreed_at TIMESTAMPTZ` — UTC timestamp of checkbox check
- `organizations.terms_ip TEXT` — client IP at moment of consent (legal evidence)

#### Signup Page — `app/(auth)/signup/page.tsx`
- Added required checkbox: "I agree to the Terms of Service and Privacy Policy, including the AUP. I confirm I am authorized to bind my dealership to this agreement."
- Submit button disabled until checkbox is checked
- Sends `agreed_to_terms: true` + `agreed_to_terms_at: ISO timestamp` to API
- Removed passive notice (replaced by the explicit checkbox)

#### Register API — `app/api/auth/register/route.ts`
- Server-side validation: returns 400 if `agreed_to_terms` is falsy (prevents bypass)
- Stores `terms_agreed_at` + client IP (`x-forwarded-for`) on org row at creation

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

## 2026-03-06 — Monte Carlo Abuse Mitigation (v6 Financial Model)

### Mitigating “abusers” identified in Monte Carlo simulation
**Category:** Security / Platform Ops / Financial Model
**Reference:** `Monte_Carlo_Abuse_Mitigation.md` (project root); workbook `DealerWyze_Financial_Model_v6.xlsx` — Monte Carlo sheet

**Why:** The v6 Monte Carlo runs 1,000 trials with random **SMS x** and **Voice x** multipliers (0.5–2.5×). High-usage trials increase COGS and can push M36 EBITDA negative. We need to map those simulated abusers to existing controls and document remaining mitigations so launch and ops are aligned with the model.

**What the Monte Carlo “abuse” represents:**
- **SMS x** — multiplier on expected SMS/MMS usage per P1 sub; high value → higher COGS.
- **Voice x** — multiplier on expected voice minutes per P2 sub; high value → higher COGS.

**Already covered by hard limits (no code change required for volume abuse):**
- **SMS:** Monthly quota per org (e.g. 1,500), 20/min + 300/day rate limits (`lib/sms/quota.ts`, `lib/sms/rateLimit.ts`). At cap, send blocked unless overage/autofill enabled.
- **MMS:** 200/mo cap in `lib/sms/quota.ts`; over cap = block with message to send as SMS.
- **Voice:** `voice_minutes_cap` per org; when month-to-date seconds ≥ cap, `voice_enabled` set false + admin alert (`app/api/voice/retell-callback/route.ts`).
- **Overage opt-in:** SMS/voice overage at $0.08/min or per-msg; protects margin when dealers allow overage.

**Remaining mitigations (backlog / follow-up):**

#### Multi-org / trial farming
- Churn re-register block (email/phone) — already in `register/route.ts` → `abuse_flags`. Keep enabled; extend to device fingerprint if needed.
- Device fingerprint + IP /24 clustering: >2 orgs same fingerprint or same /24 in 7 days → `abuse_flags` (see SECURITY_ABUSE_MITIGATION_PLAN, Vector 1).
- No phone/SMS/voice on trial; card required before paid comms — enforce in product/billing.

#### Voice: loop / concurrent / duration abuse
- **Retell config:** Max call duration (e.g. 3 min hard hangup), max turns per call (e.g. 12). Document in SECURITY_ABUSE_MITIGATION_PLAN Vector 7.
- **Per-caller daily limit:** Same `from_number` >2 calls in 24h → log to `security_events` (caller_abuse) + optional route to voicemail.
- **Spike detector:** Org voice minutes in 1h >3× baseline → auto-throttle or admin alert.
- **Concurrent call cap per org:** If supported by Retell, limit (e.g. 2) active calls per org.

#### Billing-cycle boundary burst
- Daily sub-limits (300/day SMS) already in place; idempotent quota increments (`increment_sms_usage`) avoid double-count. Consider rolling 24h if boundary gaming appears.

#### Fax / scan abuse
- **Fax:** Enforce page cap (e.g. 100/mo) at send time; alert at 80%.
- **Scan:** Monthly + daily caps in `lib/leads/scanQuota.ts` — keep. Optional: flag when org exceeds 3× typical daily scan usage (Vector 9).

#### API / data extraction
- Block export for trialing orgs — `app/api/export/route.ts` (already in place).
- Bulk fetch detection >500 records/10min → `abuse_flags` via `lib/security/abuseDetector.ts` — keep; surface in admin.

#### Operational
- **Shadow billing ledger:** For flagged orgs, compute “what usage would have cost” at overage rates; use to tune caps and pricing.
- **Progressive trust:** New paid accounts — lower caps or tighter rate limits for first 7–14 days.
- **Admin kill switch:** One-click disable voice (and optionally SMS) per org from admin when abuse is confirmed.

**Checklist (post–Monte Carlo):**
- [ ] SMS/MMS/voice volume — rely on existing quotas + rate limits + voice cap; confirm overage/autofill behavior.
- [ ] Multi-org / trial — churn block on; add device fingerprint + /24 clustering if multi-org patterns appear.
- [ ] Voice — Retell max duration + max turns; add per-caller daily limit and spike detector if not already.
- [ ] Fax/scan — enforce fax cap; keep scan quota + daily burst; optional anomaly flag.
- [ ] API — no export for trial; bulk fetch → abuse_flags + admin view.
- [ ] Operational — shadow billing for flagged orgs; admin kill switch for voice (and SMS if needed).

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

## 2026-03-06 — Abuse Mitigation: Monte Carlo Open Items

### Multi-layer abuse prevention for voice, SMS, and registration
**Category:** Security / Platform Ops
**Migration:** none (uses existing columns from migrations 044, 049, 050)

**Why:** Post Monte Carlo financial modelling identified 6 open mitigation items not yet coded. These directly bound the upper-tail cost scenarios (multi-org fraud, voice loops, burst registration attacks) that would push M36 EBITDA negative. Implemented all 6 in a single pass.

**What was built:**

**`app/api/voice/retell-callback/route.ts`**
- Per-caller daily limit raised from 2 → 5 calls/24h (3-min hard cap = max 15 min exposure/day)
- Voice spike detector: >10 calls/hr from same org → `admin_alert (voice_spike, high)` + `security_event`, deduped to one alert per 2h
- Progressive trust: orgs < 14 days old get 50% of their `voice_minutes_cap` (`effectiveIncludedCap`)

**`app/api/auth/register/route.ts`**
- IP /24 subnet clustering (Vector 2): >2 org registrations from same /24 in 7 days → `abuse_flags (ip_clustering, high)`; uses existing `terms_ip` column
- Device fingerprint (Vector 3): server-side SHA-256 of `IP + stripped User-Agent`; stored in existing `signup_fingerprint` column (migration 044); match against prior orgs in last 30 days → `abuse_flags (device_fingerprint_match, high)`

**`lib/sms/quota.ts`**
- Progressive trust: orgs < 14 days old get 50% of their `sms_quota` as `effectiveQuota`; applies to all quota checks, MMS cap checks, and the 80% notification threshold

**`app/api/admin/orgs/[id]/shadow-billing/route.ts`** *(new)*
- GET endpoint (superadmin only) returning per-org list-rate exposure: SMS overage × $0.08, MMS overage × $0.15, voice overage × $0.12, fax overage × $0.10, and total
- Pure computed read — no DB writes

**`app/(app)/admin/orgs/[id]/page.tsx`**
- Shadow billing collapsible widget in admin org detail page; shows $0.00 in green or non-zero in orange; expands to line-item breakdown with units × rate

**Design decisions:**
- 5 calls/24h chosen over doc's original 2 — gives customers headroom for dropped calls; 3-min hard cap in Retell bounds total exposure to 15 min/caller/day
- Spike threshold fixed at 10 calls/hr (not dynamic baseline) — simpler, sufficient; most dealers average 1–3 calls/hr peak
- Progressive trust 50% / 14 days applies at quota-check time (not at provisioning) — no extra cron needed, no new DB columns
- Server-side fingerprint (no client JS required) — not as unique as a full browser fingerprint but requires zero frontend changes and is unblockable at signup
- Shadow billing is display-only — no alerts, no hard actions; useful for pricing validation and identifying heavy users before they trigger hard caps

---

## 2026-03-06 — Remote Admin (Staff Write-Mode Impersonation)

### Platform staff can take over a customer org to make live configuration changes
**Category:** Platform Ops / Security
**Migration:** none

**Why:** Support staff need to go beyond read-only viewing and actually configure settings on behalf of a struggling dealer — without requiring the dealer to share credentials or describe every step. Remote Admin provides a controlled write-enabled session with a visible warning banner and full audit trail.

**What was built:**

**`lib/auth/staffSession.ts`**
- Extended HMAC-signed cookie payload from `orgId.mac` → `orgId|writeMode.mac` (`1` = write, `0` = read-only)
- Added `StaffSession` interface and `getStaffSessionInfo()` → `{ orgId, writeMode }`
- `getStaffOrgOverride()` kept as `@deprecated` alias
- `buildStaffOrgCookie(orgId, writeMode = false)` updated to encode writeMode flag
- Backward-compatible: legacy cookies without `|` treated as read-only

**`proxy.ts`**
- `isImpersonationBlocked()` now decodes the cookie payload inline (HMAC verify + `|` split)
- Returns `false` (allow) when `writeMode = 1`; returns `true` (block) for read-only sessions
- All POST/PUT/PATCH/DELETE mutations flow through normally during Remote Admin sessions

**`app/api/admin/impersonate/route.ts`**
- POST accepts `write_mode: boolean` (default `false`)
- Logs `staff_remote_admin_start` vs `staff_impersonate_start` in `admin_audit_log`
- Calls `buildStaffOrgCookie(org_id, !!write_mode)` to encode the flag

**`components/admin/ImpersonationBanner.tsx`**
- Added `writeMode: boolean` prop
- **Orange banner** (`bg-orange-500 text-white`) + Pencil icon: "Remote Admin — **OrgName** — changes are live"
- **Yellow banner** (unchanged) for read-only: "Viewing **OrgName** as read-only staff"

**`app/(app)/layout.tsx`**
- Switched import: `getStaffOrgOverride` → `getStaffSessionInfo`
- Reads `session.orgId` + `session.writeMode`; passes `writeMode` prop to `<ImpersonationBanner>`

**`app/(app)/admin/orgs/[id]/page.tsx`**
- Added "Remote Support" card section with two buttons:
  - **View as Org** — read-only impersonation (yellow banner)
  - **Remote Admin** — write-enabled (orange banner), guarded by `window.confirm` dialog warning changes are live
- `startImpersonation(writeMode)` helper calls `POST /api/admin/impersonate` with `write_mode` flag then navigates to `/`
- Removed duplicate Eye icon from the page header (replaced by the section buttons)

**Flow:**
1. Staff clicks **Remote Admin** on `/admin/orgs/[id]` → confirm dialog
2. API sets signed cookie with `orgId|1`; logs `staff_remote_admin_start` in audit log
3. Proxy detects write-mode flag → allows all mutations to pass through
4. Orange "Remote Admin — changes are live" banner appears at top of app
5. Staff makes changes; they land in the customer's org as the customer would see them
6. Staff clicks **End Session** → `DELETE /api/admin/impersonate` clears cookie → redirected to `/admin`

**Design decisions:**
- Write-mode encoded in the HMAC-signed cookie — no extra DB state, tamper-proof
- Orange vs yellow banner provides unmistakable visual distinction between write and read mode
- Confirm dialog on Remote Admin button prevents accidental activation
- All sessions (read and write) logged in `admin_audit_log` with distinct action types
- Mutations still subject to existing API auth + RLS — Remote Admin is not a privilege escalation, just org context switching

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

---

### Customer / Lead Document Attachments
**Category:** UX / Document Management
**Migration:** none (uses existing `customer_documents` table)

**Why:** Dealers needed a way to attach PII documents (Driver's License, Insurance Card, Purchase Agreement, etc.) to customer records — mirroring the vehicle document system — without DealerWyze becoming a system of record.

**What was built:**
- `components/customer/DocumentsSection.tsx` — collapsible accordion on customer detail page; PII labels flagged with amber ShieldAlert icon; client-side image compression (Canvas, 2048px max); 5 MB cap; sold vehicles show read-only notice
- `components/customer/CustomerQuickUploadSheet.tsx` — paperclip quick-upload sheet from customer list cards
- `components/customer/CustomerCard.tsx` — converted to `'use client'`; paperclip button on right edge opens quick-upload sheet
- `app/api/customers/[id]/documents/route.ts` — POST upload + GET list with signed URLs; DELETE per-doc
- Archive panel on customer detail enhanced to show doc cleanup step before confirm

**Labels:** Driver's License, Insurance Card, Purchase Agreement, Credit Application, Borrowed Vehicle, Test Drive, Other

**Design decisions:**
- PII warning shown inline for Driver's License + Insurance Card (not a blocker, just amber indicator)
- "Not a system of record" disclaimer shown in upload footer and T&C (sections 9.5–9.7)
- Docs are cleaned up when customer is archived (manual step shown in archive panel)

---

### Document Storage Upsell — Storage Packs
**Category:** Billing / Revenue
**Migration:** `057_storage_packs.sql`

**Why:** 500 MB base quota is sufficient for most orgs but power users storing contracts, purchase agreements, and title copies need more. Storage packs provide a self-serve upsell path inside the app.

**What was built:**
- `supabase/migrations/057_storage_packs.sql` — adds `storage_quota_bytes`, `storage_pack`, `storage_pack_stripe_sub_id`, `storage_pack_expires_at` to `org_settings`
- `lib/stripe.ts` — `StoragePack` type, `STORAGE_PACK_QUOTA`, `STORAGE_PACK_LABEL`, `STORAGE_BASE_QUOTA`, `storagePackFromPriceId()`, `priceIdForStoragePack()`
- `lib/storage/quota.ts` — `getOrgStorageQuota()` shared helper; reads from `org_settings`; falls back to base on grace period expiry
- `app/api/stripe/storage-pack/route.ts` — POST adds pack to existing Stripe subscription; DELETE removes with 90-day grace period
- `app/api/stripe/webhook/route.ts` — `customer.subscription.updated` now detects storage pack items; syncs `org_settings.storage_quota_bytes`; sets 90-day grace on cancellation
- `app/api/settings/storage/route.ts` — returns `quota_bytes`, `limit_mb` (dynamic), `storage_pack`, `months_to_full`, `mb_per_month`
- `components/settings/StorageWidget.tsx` — upsell banner at >60% usage (no pack active); shows MB/month rate + months-to-full estimate; "10 GB — $4.99/mo" + "25 GB — $9.99/mo" upgrade buttons; active pack chip
- `app/api/cron/data-retention/route.ts` — storage pack expiry job: deletes largest files beyond 500 MB base after grace period ends; resets quota columns
- `public/terms.md` + `public/terms.html` — sections 9.6 (Storage Quotas) and 9.7 (Grace Period) added

**Pricing:** 10 GB — $4.99/mo | 25 GB — $9.99/mo (added to existing Stripe subscription as line items)

**Flow:**
1. Org uploads docs; StorageWidget shows usage bar
2. At >60%: upsell banner appears with time-to-full estimate
3. Dealer clicks upgrade → `POST /api/stripe/storage-pack` adds price to subscription → `org_settings.storage_quota_bytes` updated immediately
4. On cancel/non-payment: `storage_pack_expires_at` set 90 days out; uploads above base blocked; existing files retained
5. After 90 days: `data-retention` cron deletes largest files until back within 500 MB base

**Design decisions:**
- No landing page upsell — contextual only (>60% threshold)
- Grace period is 90 days (matches general data retention policy)
- Largest-first deletion after grace period expires — preserves the most docs possible
- Dynamic quota shared via `getOrgStorageQuota()` so both upload routes stay in sync automatically

---

## 2026-03-09 — Prepaid Messaging Credit (Overage Buffer)

**Category:** Billing / Revenue
**Migration:** `059_overage_buffer.sql`

**Why:** Dealers asked for a way to keep texting customers after hitting their monthly limit without signing up for a higher plan. A one-time prepaid credit is simpler and lower-risk than auto-billing: the dealer controls it, it never expires, and it never charges without explicit action.

**What was built:**
- `supabase/migrations/059_overage_buffer.sql` — adds `overage_buffer_cents` to `organizations`; `add_overage_buffer(org_id, cents)` RPC (atomic increment); `deduct_overage_buffer(org_id, cost_cents)` RPC (row-locked atomic decrement, returns -1 if insufficient)
- `app/api/stripe/overage-topup/route.ts` — POST: creates a one-time Stripe Checkout session for $10/$25/$50/$100; sets `metadata.topup_type='overage_buffer'` and `topup_cents` on session
- `app/api/stripe/webhook/route.ts` — new branch in `checkout.session.completed`: detects `mode='payment'` + `topup_type='overage_buffer'` → calls `add_overage_buffer` RPC; logs `admin_alerts` row for platform visibility
- `lib/sms/quota.ts` — overage path now checks buffer first; deducts 8¢/SMS and 15¢/MMS atomically; blocks with clear human message if buffer exhausted; fires low-balance email at ≤$5 remaining (deduplicated via `admin_alerts`, once per 7 days); quota-warning emails rewritten in plain English
- `app/api/stripe/billing-status/route.ts` — now returns `overage_buffer_cents`
- `app/(app)/settings/billing/page.tsx` — "Extra Messaging Credit" card shows current balance, amber warning when low, `Add $10/$25/$50/$100` buttons, post-checkout success/cancel banners

**Flow:**
1. Dealer visits Settings → Billing → sees "Extra Messaging Credit" card
2. Clicks "Add $25" → Stripe one-time checkout → pays → returns to billing page with success banner
3. Balance appears immediately (webhook credits it via `add_overage_buffer`)
4. When monthly quota is hit: quota.ts deducts 8¢ per text from balance; message goes through
5. When balance reaches ≤$5: email sent — "Your credit is almost gone. Add more now to avoid losing service mid-month."
6. When balance hits $0: texts blocked with message — "Your prepaid credit has run out. Go to Settings → Billing to add more."
7. Balance never resets — carries forward month to month until exhausted

**Design decisions:**
- Buffer opt-in = existence: having any balance > 0 enables overage. No separate toggle needed.
- $10 minimum top-up prevents trivial abuse (only buys ~125 extra texts)
- Row-level locking in `deduct_overage_buffer` prevents double-spend on concurrent SMS sends
- Low-balance threshold is $5 (500 cents) — gives dealer time to react before running out
- MMS costs 15¢ vs 8¢ for SMS — reflects higher Twilio delivery cost
- All user-facing messages follow plain-English standard: state what happened, state impact, give exact next step

---

## 2026-03-09 — Document Attachments on Customers List & Lead Cards

**Category:** UX
**Migration:** none

**Why:** Dealers needed to attach documents (ID scans, trade-in photos, credit apps) from the customers list and from new lead cards on the Today page, not just from inside a customer's detail view.

**What was built:**
- `components/customer/CustomersListClient.tsx` — added paperclip button to mobile rows and desktop table; single shared `uploadCustomerId` state instance (not per-row); opens `CustomerQuickUploadSheet`
- `components/leads/NewLeadCard.tsx` — added paperclip button to the action row on lead cards; opens `CustomerQuickUploadSheet`

**Flow:**
1. Dealer taps paperclip on any customer row or lead card
2. `CustomerQuickUploadSheet` opens; dealer selects file
3. File uploads org-scoped to that customer's record

---

## 2026-03-09 — Plain-English Message Standard

**Category:** Platform Ops / UX
**Migration:** none

**Why:** Early error and notification messages used technical language ("overage buffer", "MMS cap", "quota exceeded") that dealers couldn't act on. Added a formal standard to CLAUDE.md and rewrote all affected messages.

**What was changed:**
- `CLAUDE.md` — added "User-Facing Messages — Plain English, Always Actionable" section with bad/good examples and rules
- `lib/sms/quota.ts` — all `reason` strings rewritten; quota warning emails rewritten (dropped "auto-refill" language, replaced with messaging credit)
- `app/(app)/settings/billing/page.tsx` — buffer card copy rewritten; card renamed from "Overage Buffer" to "Extra Messaging Credit"

**Standard (summary):**
- No jargon — "texting" not "SMS", "picture messages" not "MMS", "credit" not "buffer"
- Every blocked message: state what happened + state impact + give exact next step
- Email subjects lead with the consequence: "Your texting has paused — monthly limit reached"
