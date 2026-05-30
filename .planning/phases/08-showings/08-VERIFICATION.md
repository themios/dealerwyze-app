---
phase: 08-showings
verified: 2026-05-29T04:09:16Z
status: passed
score: 17/17 must-haves verified
gaps: []
---

# Phase 8: Showings Verification Report

**Phase Goal:** Agent can schedule, track, and sync showings across CRM, Cal.com self-serve booking, and Google Calendar — with zero manual entry when buyers book through the public link.
**Verified:** 2026-05-29T04:09:16Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Agent can create a showing via POST /api/showings with auth + validation | VERIFIED | requireProfile() + createClient() + Zod schema at line 9–14; insert payload never touches showing_count |
| 2 | Agent can list showings for a listing via GET /api/showings?listing_id=X scoped to org | VERIFIED | .eq('org_id', profile.org_id) enforced; returns contacts + agents joined |
| 3 | Agent can update status/feedback via PATCH /api/showings/[id] with GCal best-effort | VERIFIED | Zod patchSchema, own-or-404 pattern, GCal update in try/catch |
| 4 | Agent can delete a showing via DELETE /api/showings/[id] | VERIFIED | Own-or-404 guard; GCal cancel best-effort; trigger owns showing_count decrement |
| 5 | Cal.com webhook follows rate-limit → HMAC → parse → validate → upsert flow | VERIFIED | calWebhookLimiter called first; verifyCalSignature() with timingSafeEqual; cross-tenant check via vehicles.user_id=orgId |
| 6 | BOOKING_CANCELLED and BOOKING_RESCHEDULED are handled | VERIFIED | Switch cases at lines 182 and 195 of webhook route |
| 7 | cal_booking_uid dedup enforced at DB + code level | VERIFIED | Migration 192: `cal_booking_uid TEXT UNIQUE`; 23505 catch at webhook line 169 returns {duplicate:true} |
| 8 | showingReminders.ts exists and is wired into check-tasks cron | VERIFIED | lib/cron/jobs/showingReminders.ts imported and called at check-tasks/route.ts lines 25, 69, 94 |
| 9 | reminder_sent_at used as idempotency guard | VERIFIED | .is('reminder_sent_at', null) filter in query; .update({reminder_sent_at}) after send |
| 10 | ShowingTimeline component mounted on listing detail page for RE orgs only | VERIFIED | page.tsx gates on org.vertical !== 'real_estate' → notFound(); then mounts ShowingTimeline at line 179 |
| 11 | Cal.com booking link rendered if calcom_username/slug set | VERIFIED | ShowingTimeline builds calLink from props and renders copy UI at line 255; settings fetched server-side |
| 12 | GET /api/showings/upcoming exists with 30-day cap + limit 500 | VERIFIED | cutoff = now + 30 days; .limit(500) at line 37 of upcoming/route.ts |
| 13 | /showings dashboard page exists, RE-only, status filter works | VERIFIED | page.tsx has vertical gate → notFound(); ShowingsDashboard.tsx has filter state + filtered array |
| 14 | showing_count NOT referenced in any route write path (trigger-only) | VERIFIED | grep confirms all references are comments only; no INSERT/UPDATE sets showing_count |
| 15 | Migration 192 SQL file exists with cal_booking_uid, gcal_event_id, cal_link columns | VERIFIED | 192_showings_cal_gcal_columns.sql adds all three + reminder_sent_at + org_settings calcom columns |
| 16 | CALCOM_WEBHOOK_SECRET in lib/env/validate.ts | VERIFIED | Line 46 of validate.ts references 'CALCOM_WEBHOOK_SECRET' |
| 17 | CALCOM_WEBHOOK_SECRET in .env.example | VERIFIED | Line 193 of .env.example: CALCOM_WEBHOOK_SECRET=your_calcom_webhook_secret_here |

**Score:** 17/17 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/api/showings/route.ts` | POST + GET | VERIFIED | 124 lines, substantive, requireProfile() + Zod + createClient() |
| `app/api/showings/[id]/route.ts` | PATCH + DELETE | VERIFIED | 144 lines, substantive, own-or-404, GCal best-effort |
| `app/api/showings/upcoming/route.ts` | GET with 30d cap + limit 500 | VERIFIED | 46 lines, 30-day window, limit(500) |
| `app/api/cal/webhook/route.ts` | Rate-limit → HMAC → parse → upsert | VERIFIED | 214 lines, full security chain implemented |
| `lib/cron/jobs/showingReminders.ts` | 24h reminder with reminder_sent_at idempotency | VERIFIED | 85 lines, .is('reminder_sent_at', null) guard, stamps after send |
| `app/(app)/listings/[id]/ShowingTimeline.tsx` | Client component, fetch + create + status + feedback | VERIFIED | 441 lines, full CRUD wired to API, Cal.com link rendering |
| `app/(app)/listings/[id]/page.tsx` | RE vertical gate + ShowingTimeline mount | VERIFIED | Gates on vertical, fetches calcom_username/calcom_event_slug, mounts component |
| `app/(app)/showings/page.tsx` | RE-only dashboard with upcoming showings | VERIFIED | vertical gate → notFound(), SSR data fetch |
| `app/(app)/showings/ShowingsDashboard.tsx` | Status filter, status updates | VERIFIED | filter state, filtered array, PATCH calls |
| `supabase/migrations/192_showings_cal_gcal_columns.sql` | cal_booking_uid UNIQUE, gcal_event_id, cal_link, reminder_sent_at | VERIFIED | All four columns present; index on cal_booking_uid |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| ShowingTimeline.tsx | POST /api/showings | fetch in handleScheduleSubmit | WIRED | Line 170: fetch('/api/showings', {method:'POST'}) |
| ShowingTimeline.tsx | GET /api/showings?listing_id=X | fetch in fetchShowings | WIRED | Line 114: fetch(`/api/showings?listing_id=${listingId}`) |
| ShowingTimeline.tsx | PATCH /api/showings/[id] | fetch in handleStatusChange + handleFeedbackSave | WIRED | Lines 136, 203 |
| cal/webhook/route.ts | showings table | createServiceClient() + insert/update | WIRED | Lines 107, 160, 185, 200 |
| cal/webhook/route.ts | calWebhookLimiter | import from lib/rateLimit/upstash | WIRED | Line 18; called line 61 |
| cal/webhook/route.ts | HMAC verify | verifyCalSignature() + timingSafeEqual | WIRED | Lines 45–53; called line 76 |
| showingReminders.ts | check-tasks cron | imported + called via runJob() | WIRED | check-tasks/route.ts lines 25, 94 |
| listing detail page | ShowingTimeline | Server-side calcom settings fetch → props | WIRED | org_settings queried lines 83–87; props passed lines 182–183 |
| BOOKING_CANCELLED | showings.status='cancelled' | .update({status:'cancelled'}).eq('cal_booking_uid', uid) | WIRED | webhook line 185 |
| BOOKING_RESCHEDULED | showings.scheduled_at update | .update({scheduled_at:startTime}).eq('cal_booking_uid', uid) | WIRED | webhook line 200 |

### Requirements Coverage

All six plan phases covered. No requirements file scoped to this phase was found, but all must-haves explicitly listed in the verification request are satisfied.

### Anti-Patterns Found

None. No TODO/FIXME markers, placeholder content, empty handlers, or stub patterns found in any phase-8 route, component, or cron job.

### Human Verification Required

| Test | What to do | Expected | Why human |
|------|-----------|----------|-----------|
| Cal.com end-to-end | Configure calcom_username + calcom_event_slug in org_settings, share booking link, have someone book | Showing appears in CRM via webhook without manual entry | Requires live Cal.com account + webhook delivery |
| Google Calendar sync | Create a showing as a RE agent with GCal connected | GCal event appears in agent's calendar | Requires live GCal OAuth tokens |
| Reminder email delivery | Advance clock or create a showing 23h from now, wait for check-tasks cron | Agent receives 24h reminder email | Requires Resend + live cron execution |

### Gaps Summary

No gaps. All 17 must-haves verified against the actual codebase. The phase goal is achieved: the full showing lifecycle is implemented — manual scheduling through the CRM, zero-entry booking via Cal.com webhook with HMAC verification and dedup, Google Calendar sync (best-effort), 24h reminder emails with idempotency, and a RE-only dashboard with status filtering.

---

_Verified: 2026-05-29T04:09:16Z_
_Verifier: Claude (gsd-verifier)_
