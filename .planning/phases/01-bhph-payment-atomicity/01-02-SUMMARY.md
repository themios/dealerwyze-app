---
phase: 01
plan: 02
subsystem: bhph-payments
tags: [next.js, route-handler, rpc, refactor]

dependency-graph:
  requires: [plan-01-01]
  provides: [atomic confirm branch in pay/[token]/route.ts]
  affects: [plan-01-03]

tech-stack:
  added: []
  patterns: [supabase.rpc() single-call pattern, JSONB result type cast]

key-files:
  created: []
  modified:
    - app/api/pay/[token]/route.ts

decisions:
  - id: preserve-pre-rpc-guards
    choice: Keep token lookup, org lookup, Stripe verify, and three PI validation checks unchanged
    rationale: >
      The pre-RPC path handles "token expired/invalid before touching Stripe" and
      "PI amount/currency/metadata mismatch" — these are not the RPC's responsibility.
      The RPC handles only the concurrent-confirm race and atomic write sequence.
  - id: typescript-cast
    choice: Cast rpcResult as { ok?: boolean; already_processed?: boolean; conflict?: boolean } | null
    rationale: >
      supabase.rpc() returns data: unknown. A lightweight inline type cast is cleaner
      than a full interface definition for a three-key JSONB response.
  - id: console-error-on-rpc-failure
    choice: Log rpcError.message before returning 500
    rationale: >
      The 500 response body is generic (no info leak). The server log captures the
      full Postgres error for debugging without exposing internals to the client.

metrics:
  duration: ~5 minutes
  completed: 2026-04-29
---

# Phase 1 Plan 02: pay/[token]/route.ts Refactor Summary

**One-liner:** Confirm branch reduced from 66 lines (3 sequential writes + race) to 22 lines (single RPC call + 4-case response map).

## What Was Changed

**Lines replaced:** 181–246 (original) → 181–204 (refactored)

**Removed:**
- `supabase.from('bhph_payment_tokens').update(...)` — write 1
- App-level idempotency re-read block (`supabase.from('bhph_payment_tokens').select(...)`)
- `supabase.from('activities').insert(...)` — write 2
- `supabase.from('bhph_payments').select(...)` — contract read
- `supabase.from('bhph_payments').update(...)` — write 3 (with JS Date arithmetic)

**Added:**
```typescript
const { data: rpcResult, error: rpcError } = await supabase.rpc('finalize_bhph_payment', {
  p_token_id:              pt.id,
  p_stripe_payment_intent: payment_intent_id,
  p_paid_at:               paidAt,
})
```

**Response mapping:**
- `rpcError` → 500 `{ error: 'Could not finalize payment' }`
- `result.conflict` → 409 `{ error: 'Token already processed' }`
- `result.already_processed` → 200 `{ ok: true, already_processed: true }`
- default → 200 `{ ok: true }`

## Deviations from Plan

None — plan executed exactly as written.
