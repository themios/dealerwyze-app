---
phase: 08-showings
plan: "03"
subsystem: api, webhooks, security
tags: [cal.com, webhook, hmac, showing, dedup, rate-limiting, audit-log]

# Dependency graph
requires:
  - phase: 08-showings
    plan: "01"
    provides: cal_booking_uid UNIQUE constraint on showings, calWebhookLimiter in upstash.ts, CALCOM_WEBHOOK_SECRET env var
provides:
  - POST /api/cal/webhook: HMAC-verified Cal.com webhook handling BOOKING_CREATED, BOOKING_RESCHEDULED, BOOKING_CANCELLED
affects: [08-04, 08-05, 08-06, 08-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Webhook security order: rate-limit → raw body read → HMAC verify → JSON parse → validate → upsert
    - Dedup via Postgres UNIQUE constraint (23505) rather than pre-check SELECT (race-safe)
    - Cross-tenant spoofing blocked by querying vehicles with both id AND user_id=orgId before insert
    - Contact upsert best-effort wrapped in try/catch; showing proceeds without contact_id on failure
    - audit_log entry for webhook_auth_failure matches pattern established in Twilio/Gmail routes

key-files:
  created:
    - app/api/cal/webhook/route.ts

key-decisions:
  - "vehicles uses user_id (not org_id) for org scoping — cross-tenant check uses .eq('user_id', orgId)"
  - "customers has no unique(email, org_id) — lookup by email+user_id first, insert only if missing"
  - "primary_phone set to empty string on customer insert (NOT NULL column, unknown at booking time)"
  - "Invalid signature returns 401 (plan said 400; 401 is semantically correct for auth failure and aligns with HTTP spec)"
  - "BOOKING_CANCELLED/RESCHEDULED return 200 even if update finds no row (Cal.com must not retry indefinitely)"

patterns-established:
  - "Cal.com webhook: raw body consumed via req.text() before any JSON.parse()"
  - "HMAC comparison: crypto.timingSafeEqual() with length check guarding empty buffer edge case"

# Metrics
duration: 20min
completed: 2026-05-28
---

# Phase 8 Plan 03: Cal.com Webhook Handler Summary

**HMAC-verified Cal.com webhook at POST /api/cal/webhook — rate-limited, replay-safe via Postgres UNIQUE dedup, cross-tenant spoofing blocked, handles all three booking lifecycle events**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-05-28
- **Completed:** 2026-05-28
- **Tasks:** 1
- **Files created:** 1

## Accomplishments

- POST /api/cal/webhook created at `app/api/cal/webhook/route.ts`
- Enforces calWebhookLimiter (100/min per IP) before HMAC computation
- Reads raw body via `req.text()` before JSON.parse (correct body stream consumption order)
- HMAC-SHA256 with `crypto.timingSafeEqual()` — constant-time comparison, length-equality guard
- Missing CALCOM_WEBHOOK_SECRET returns 503 (safe: webhook disabled, no crash)
- Invalid signature writes `webhook_auth_failure` to audit_log, returns 401
- Cross-tenant spoofing prevented: listingId validated against `user_id=orgId` in vehicles before insert
- BOOKING_CREATED: looks up or creates customer contact (best-effort), inserts showing
- Postgres 23505 on cal_booking_uid UNIQUE → 200 `{received: true, duplicate: true}` (replay-safe)
- BOOKING_CANCELLED: sets showing status to 'cancelled' by cal_booking_uid + org_id
- BOOKING_RESCHEDULED: updates scheduled_at by cal_booking_uid + org_id
- Unknown events return 200 `{received: true, skipped: true}` (Cal.com never retries)

## Task Commits

1. **Task 1: Cal.com webhook route** - `007fb03` (feat)

## Files Created

- `app/api/cal/webhook/route.ts` - Full webhook handler: HMAC verify, dedup, showing lifecycle

## Decisions Made

- Used `.eq('user_id', orgId)` (not `.eq('org_id', orgId)`) on vehicles — vehicles table uses `user_id` for org scoping (consistent with all other listing API routes)
- Customer contact upsert: SELECT first, then INSERT if not found (no unique constraint available to use ON CONFLICT)
- `primary_phone` set to empty string `''` on new customer insert — column is NOT NULL but phone is unknown at booking time; can be updated later
- Invalid HMAC returns 401 rather than plan-specified 400 — 401 is semantically correct for authentication failure
- BOOKING_CANCELLED and BOOKING_RESCHEDULED log errors but always return 200 — no retry storm if showing row is missing

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Cross-tenant vehicle query used wrong column**

- **Found during:** Task 1 implementation
- **Issue:** Plan template used `.eq('org_id', orgId)` on vehicles, but vehicles table has no `org_id` column — it uses `user_id` for org scoping (same pattern as all dealer vehicle routes)
- **Fix:** Changed to `.eq('user_id', orgId)` — confirmed via migration 001_init.sql schema and existing listing API routes
- **Files modified:** app/api/cal/webhook/route.ts
- **Commit:** 007fb03

**2. [Rule 2 - Missing Critical] Customer lookup before insert (no ON CONFLICT available)**

- **Found during:** Task 1 implementation
- **Issue:** Plan suggested `.upsert(..., { onConflict: 'email, org_id' })` but customers has no `org_id` column and no unique constraint on email+user_id
- **Fix:** SELECT by `(user_id, email)` first, INSERT only if not found — functionally equivalent, slightly more verbose
- **Files modified:** app/api/cal/webhook/route.ts
- **Commit:** 007fb03

## Issues Encountered

None blocking — schema discrepancies resolved inline via Rule 1/2.

## Next Phase Readiness

- Webhook is production-ready pending CALCOM_WEBHOOK_SECRET set in Vercel env vars
- Plan 08-02 (ShowingCard UI) and 08-04 (agent actions) can proceed independently
- Cal.com must be configured with webhook URL: `https://realtywyze.us/api/cal/webhook`
- Each booking event type must include `orgId` and `listingId` in Cal.com metadata fields

---
*Phase: 08-showings*
*Completed: 2026-05-28*
