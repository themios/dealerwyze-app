# Abuse Prevention & Service Hardening Plan
**Date:** 2026-04-28
**Goal:** Close loopholes in public endpoints, cross-tenant isolation, sequence blast limits, free-tier storage, Stripe webhook integrity, and settings secret exposure before the first external paying dealer.

---

## Context

Following the pre-launch reliability sprint (2026-04-27), six audit categories remain open:
1. Public endpoints with no rate limiting (book, pulse, pay)
2. Cross-tenant isolation gaps (resource IDs not verified against caller's org)
3. Sequence enrollment blast (no per-org cap, could spam thousands of emails per cron run)
4. Free-tier storage abuse (full 500MB storage during trial — should be 50MB + 2-vehicle/2-customer attachment limit)
5. Stripe webhook spoofing (fake invoice.paid could upgrade a free account)
6. Settings GET endpoints leaking secrets (postgrid_api_key, stripe_dealer_secret_key, Twilio creds)

---

## Tasks

### Task 1 — Rate limit public booking endpoint
**File:** `app/api/book/[slug]/route.ts` (POST — appointment submission)
**Fix:** Add `webLeadLimiter(ip)` from `lib/rateLimit/upstash.ts` (20/hr per IP, same as web leads). Return 429 with plain-English message.
**Also:** Add honeypot field (`website` input, hidden via CSS) to the public booking page form. If field is non-empty on POST, silently return 200 but don't save.

### Task 2 — Rate limit public pulse survey endpoint
**File:** `app/api/pulse/[token]/respond/route.ts` (POST — survey response submission)
**Fix:** 5 responses per IP per hour via Upstash. Surveys are one-time by design; this prevents bot-flooding.
**Also:** `app/api/pulse/[token]/route.ts` (GET) — 30 fetches per IP per hour.

### Task 3 — Rate limit public payment token endpoint
**File:** `app/api/pay/[token]/route.ts` (GET + POST)
**Fix:** 10 attempts per IP per hour. Tokens are UUIDs so brute-force is infeasible, but this closes the door on probing attacks.

### Task 4 — Cross-tenant isolation audit (customers)
**Scope:** Every API route that accepts `customer_id` from the URL or body.
**Fix pattern:** After fetching the customer, verify `customer.user_id === profile.org_id`. If not, return 404 (don't confirm existence).
**Key files to audit:**
- `app/api/customers/[id]/route.ts`
- `app/api/customers/[id]/activities/route.ts`
- `app/api/customers/[id]/vehicles/route.ts`
- `app/api/customers/[id]/documents/route.ts`
- `app/api/customers/[id]/sequences/route.ts`
- `app/api/sms/send/route.ts` — customer_id in body
- `app/api/activities/route.ts` — customer_id in body

### Task 5 — Cross-tenant isolation audit (vehicles)
**Scope:** Every API route that accepts `vehicle_id` from the URL or body.
**Fix pattern:** After fetching the vehicle, verify `vehicle.org_id === profile.org_id`. Return 404 if not.
**Key files to audit:**
- `app/api/vehicles/[id]/route.ts`
- `app/api/vehicles/[id]/photos/route.ts`
- `app/api/vehicles/[id]/documents/route.ts`
- `app/api/vehicles/[id]/recon/route.ts`

### Task 6 — Sequence enrollment blast cap
**File:** `lib/cron/jobs/sequenceDelivery.ts` + `lib/cron/jobs/fullAutoSequence.ts`
**Fix:** Already limited to 100/50 activities per run. Add a per-org sub-cap: max 50 outbound emails per org per cron run. If an org hits the cap, log a warning and skip remaining — prevents a single org from consuming the entire cron window.
**Also:** `app/api/customer-sequences/route.ts` (POST — manual enrollment) — if org has >500 active enrollments, return 429 with "Too many active sequences" message.

### Task 7 — Free tier storage cap (50MB total)
**Migration:** Add `storage_used_bytes BIGINT DEFAULT 0` to `org_settings` (migration 106).
**Enforcement points:**
- `app/api/vehicles/[id]/photos/route.ts` — check `storage_used_bytes + fileSize <= limit` before accepting upload; update counter on success and on delete.
- `app/api/customers/[id]/documents/route.ts` — same pattern.
- `app/api/vehicles/[id]/documents/route.ts` — same pattern.
**Free tier limit:** 50MB (52,428,800 bytes). Paid tier: 524,288,000 bytes (500MB base).
**Error:** "You've used all your free storage (50 MB). Upgrade to a paid plan to upload more files."

### Task 8 — Free tier attachment count limit (2 vehicles, 2 customers)
**Enforcement points:** Same upload routes as Task 7.
**Free tier rule:** Count distinct `vehicle_id`s (or `customer_id`s) that already have attachments for this org. If count >= 2, block upload with: "Free accounts can add attachments to 2 vehicles and 2 customers. Upgrade to remove this limit."
**Note:** Existing photos/attachments are not deleted when an org downgrades — they keep what they had, just can't add more.

### Task 9 — Stripe webhook signature verification audit
**File:** `app/api/webhooks/stripe/route.ts`
**Check:** Verify `stripe.webhooks.constructEvent(body, sig, secret)` is used (not a manual signature check). Verify the raw body buffer is used (not parsed JSON). Verify `STRIPE_WEBHOOK_SECRET` env var is required.
**Fix if missing:** Implement standard Stripe webhook verification pattern. A forged `invoice.paid` or `customer.subscription.updated` event must not be able to upgrade an account.

### Task 10 — Mask secrets in settings GET responses
**Audit all GET routes that return org settings fields:**
- `app/api/settings/org/route.ts`
- `app/api/settings/appearance/route.ts`
- `app/api/settings/retention/route.ts`
- `app/api/settings/pulse/route.ts`
**Fields to mask (never return in response):**
- `postgrid_api_key` — return `"••••••••"` if set, `null` if not
- `stripe_dealer_secret_key` — return `"••••••••"` if set, `null` if not
- Any field ending in `_secret` or `_key` that isn't a public key

### Task 11 — Add honeypot to public web lead form
**File:** `app/(public)/[slug]/[vehicleId]/components/LeadForm.tsx` (or equivalent VDP lead form)
**Fix:** Add `<input type="text" name="website" tabIndex={-1} style={{display:'none'}} />` to the form. In `app/api/leads/web/route.ts`, if `body.website` is non-empty, return `{ ok: true }` silently (don't save the lead, don't alert the dealer).

### Task 12 — Write Vitest tests for key security invariants
**New test file:** `lib/__tests__/security.test.ts`
**Tests to write:**
- Free tier storage cap: bytes > limit → blocked
- Free tier attachment count: 3rd vehicle → blocked
- Sequence blast cap: per-org 50-email ceiling enforced
- Settings masking: `postgrid_api_key` never appears in GET response body

---

## Migrations Required

| Migration | Contents |
|-----------|----------|
| 106 | `storage_used_bytes BIGINT DEFAULT 0` on `org_settings`; index on `org_id` |

---

## Execution Order

1. Tasks 9, 10 first — highest severity (fake upgrades, secret leakage)
2. Tasks 4, 5 — cross-tenant isolation (critical for multi-tenant integrity)
3. Tasks 7, 8 — free tier storage (prevents trial abuse)
4. Tasks 1, 2, 3 — public endpoint rate limits
5. Task 6 — sequence blast cap
6. Task 11 — honeypot
7. Task 12 — security tests

---

## Definition of Done

- [ ] All 12 tasks committed
- [ ] `npm test` passes (26+ tests)
- [ ] `npx tsc --noEmit` clean
- [ ] Migration 106 written (applied manually by Tim)
- [ ] No secrets returned in any settings GET response
- [ ] Stripe webhook uses `constructEvent()` with raw body
