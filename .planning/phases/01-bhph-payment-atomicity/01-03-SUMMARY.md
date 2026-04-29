---
phase: 01
plan: 03
subsystem: bhph-payments
tags: [vitest, testing, mocking, integration-test]

dependency-graph:
  requires: [plan-01-01, plan-01-02]
  provides: [integration test coverage for pay/[token] confirm branch]
  affects: []

tech-stack:
  added: []
  patterns: [vi.mock module replacement, vi.stubGlobal for fetch, makeTestClient() supabase stub]

key-files:
  created:
    - lib/__tests__/bhph/pay-confirm.test.ts
  modified: []

decisions:
  - id: mock-service-client
    choice: vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => supabase }))
    rationale: >
      The route creates its own supabase instance via createServiceClient(). Replacing
      the factory with a mock that returns the shared makeTestClient() instance ensures
      all supabase calls in the route go through the controllable stub.
  - id: vi-stub-global-fetch
    choice: vi.stubGlobal('fetch', vi.fn())
    rationale: >
      The route calls global fetch() for Stripe API calls. stubGlobal replaces it
      per-test without leaking state between tests (cleared by vi.clearAllMocks in beforeEach).
  - id: test-absence-of-direct-writes
    choice: Assert supabase._table('bhph_payment_tokens').update not called
    rationale: >
      The most important behavioral property to test is that the confirm branch no longer
      performs individual table writes. Asserting update/insert mock call count = 0
      directly proves this at the unit level.

metrics:
  duration: ~10 minutes
  completed: 2026-04-29
---

# Phase 1 Plan 03: Integration Tests Summary

**One-liner:** 7 tests across 4 describe blocks covering happy path, idempotency, RPC failure, and conflict — all passing, no real DB.

## What Was Built

`lib/__tests__/bhph/pay-confirm.test.ts` — 7 tests in 4 describe blocks:

| Describe | Tests | Assertions |
|----------|-------|------------|
| happy path | 4 | 200 ok, rpc called with correct params, no .update(), no .insert() |
| idempotency (already_processed) | 1 | 200 with already_processed flag |
| RPC failure | 1 | 500 with generic message |
| conflict | 1 | 409 with conflict message |

## Mocking Strategy

- `server-only` → `vi.mock('server-only', () => ({}))` — prevents ESM throw
- `@/lib/supabase/service` → returns `makeTestClient()` instance
- `@/lib/rateLimit/upstash` → `paymentLimiter` always returns `{ allowed: true }`
- `global fetch` → `vi.stubGlobal('fetch', vi.fn())` per test, returns FAKE_PI
- `supabase.rpc` → `mockResolvedValueOnce` per test scenario

## Test Results

Before: 5 test files, 45 tests
After: 6 test files, 52 tests (7 new, 0 regressions)

## Deviations from Plan

None — plan executed exactly as written.
