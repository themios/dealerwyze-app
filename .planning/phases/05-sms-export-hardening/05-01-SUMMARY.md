# Phase 05 Plan 01: SMS Rate Limiter Integration — SUMMARY

**Status:** COMPLETE  
**Date:** 2026-06-07  
**Commits:** 1 (see below)

## What Was Built

Integrated `orgSmsLimiter` (Upstash burst limiter: 20 SMS per 5 minutes per org) into all SMS delivery code paths to prevent bulk SMS spam despite org quotas. Rate limiter is now the primary burst protection layer before Twilio calls.

### Implementation Overview

1. **Direct SMS sends** (`/api/sms/send` via `lib/sms/sendOutbound.ts`)
   - Added `orgSmsLimiter` check before Twilio fetch
   - Returns 429 when rate limited (burst protection)
   - Checked BEFORE quota (quota is monthly cap, burst is per-minute protection)

2. **Sequence SMS sends** (`/api/cron/send-sequences/route.ts`)
   - Added `orgSmsLimiter` check in `sendSequenceSms` function
   - Returns `{ ok: false, error: 'rate_limit_exceeded' }` when rate limited
   - Main loop treats `rate_limit_exceeded` as skipped (not failed) — activity remains pending for next cron run

3. **Auto-response SMS sends** (`lib/sequences/sendAutoResponseStep1.ts`)
   - Added `orgSmsLimiter` check before Twilio fetch
   - Best-effort: logs warning and returns early if rate limited (doesn't block lead ingestion)

4. **Integration test** (`lib/__tests__/sms-rate-limit.test.ts`)
   - 5 test cases covering:
     - Happy path: allowed=true, remaining counter decrements
     - Rate limit exceeded: allowed=false, retryAfterSeconds > 0
     - Fail-closed: Upstash unavailable returns allowed=false
     - Sequential rate limit transitions: first N allowed, N+1 denied
     - Retry guidance: retryAfterSeconds used in error messages

## Files Modified

### Direct Changes

| File | Lines | Change |
|------|-------|--------|
| `lib/sms/sendOutbound.ts` | +8, +15 | Import orgSmsLimiter; check before Twilio fetch; return 429 when denied |
| `app/api/cron/send-sequences/route.ts` | +1, +6, +1 | Import orgSmsLimiter; check in sendSequenceSms; handle rate_limit_exceeded in main loop |
| `lib/sequences/sendAutoResponseStep1.ts` | +1, +8 | Import orgSmsLimiter; check before Twilio fetch; log and return if denied |
| `lib/__tests__/sms-rate-limit.test.ts` | +130 | New integration test file with 5 test cases |

### Lines Modified

- **lib/sms/sendOutbound.ts**: Line 8 (import), Lines 89-97 (burst check)
- **app/api/cron/send-sequences/route.ts**: Line 26 (import), Lines 93-98 (burst check in sendSequenceSms), Line 354 (error handling)
- **lib/sequences/sendAutoResponseStep1.ts**: Line 25 (import), Lines 232-238 (burst check)
- **lib/__tests__/sms-rate-limit.test.ts**: NEW file, 130 lines

## Key Integration Points

```
orgSmsLimiter imported from: @/lib/rateLimit/upstash

Locations where called:
1. lib/sms/sendOutbound.ts:91         — Direct SMS sends
2. app/api/cron/send-sequences/route.ts:95  — Sequence SMS sends
3. lib/sequences/sendAutoResponseStep1.ts:234 — Auto-response SMS sends

Error handling:
- API routes (sendOutbound): throw SmsSendError(..., 429) when denied
- Cron routes (sendSequenceSms): return { ok: false, error: 'rate_limit_exceeded' }
- Auto-response (sendAutoResponseStep1): log warning and return early (best-effort)
```

## Verification

### Test Results
```
✓ SMS rate limit integration (5 tests)
  ✓ orgSmsLimiter returns allowed: true when under limit
  ✓ orgSmsLimiter returns allowed: false when over limit
  ✓ orgSmsLimiter can be called multiple times with different responses
  ✓ orgSmsLimiter rate limit failure message provides retry guidance
  ✓ orgSmsLimiter fail-closed returns allow: false when unavailable

Test Files: 1 passed (1)
Tests:      5 passed (5)
```

### Code Verification
```
grep results for orgSmsLimiter integration:
✓ app/api/cron/send-sequences/route.ts - import present, called in sendSequenceSms, handled in main loop
✓ lib/sms/sendOutbound.ts - import present, called before Twilio fetch
✓ lib/sequences/sendAutoResponseStep1.ts - import present, called before Twilio fetch

Rate limit error handling:
✓ Direct SMS: returns 429 when denied
✓ Sequence SMS: returns { ok: false, error: 'rate_limit_exceeded' } when denied
✓ Auto-response SMS: logs warning and returns when denied
✓ Cron loop: treats 'rate_limit_exceeded' as skipped (activity remains pending)
```

## SEC-03 Requirement Status

**SEC-03:** SMS rate limiter must be consistently applied across all SMS send operations to prevent abuse and coordinated spam within an org's quota window.

**Status:** ✅ COMPLETE

Evidence:
- Rate limiter wired into all three SMS send paths (direct, sequence, auto-response)
- Consistent limit: 20 SMS per 5 minutes per org (via Upstash sliding window)
- Checked BEFORE Twilio calls (no charge incurred if rate limited)
- Fail-closed: Upstash unavailable → rate limiter returns allow: false by design
- Integration test verifies rate limiter blocks bulk SMS beyond quota
- Cron jobs skip rate-limited sends (leaving them pending for retry) vs. failing them

## No Regressions

Existing controls remain intact:
- Daily SMS rate limit (via `checkRateLimit()` database-based check)
- Monthly quota (via `checkQuota()`)
- TCPA consent checks (sms_consent_status, sms_opt_out)
- Sequence enrollment guards (active status, reply-detection)

## Notes

- Burst limiter (orgSmsLimiter) is a NEW layer independent of existing daily/monthly limits
- Cron jobs treat rate-limited sends as "skipped" (safe to retry next run) vs. "failed" (permanent error)
- Auto-response sends are best-effort (don't block lead ingestion if rate limited)
- All three implementations follow the same pattern: check before Twilio, handle appropriately for context

---

**Commit:** See `git log` for this phase  
**Ready for:** Human verification (Task 3 checkpoint), then production deployment
