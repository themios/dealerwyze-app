---
phase: 09-transactions-commissions
plan: "02"
subsystem: api
tags: [next.js, supabase, zod, rls, transactions, real-estate, pipeline]

requires:
  - phase: 09-01
    provides: Extended transactions table with pipeline columns, commission_plans, close_re_transaction RPC

provides:
  - POST /api/transactions — create a transaction for a listing (RE orgs only)
  - GET /api/transactions?vehicle_id=X — list transactions for a listing
  - GET /api/transactions/[id] — fetch single transaction
  - PATCH /api/transactions/[id] — advance pipeline, record closing fields, update parties (agent path)
  - lib/transactions/types.ts — PipelineStatus, VALID_TRANSITIONS, canTransition(), Parties, Transaction
  - lib/transactions/schemas.ts — TransactionCreateSchema, TransactionUpdateSchema (Zod)

affects:
  - 09-04-transaction-panel-ui (UI consumes all four routes)
  - 09-05-broker-close (adds POST /api/transactions/[id]/close that calls close_re_transaction RPC)

tech-stack:
  added: []
  patterns:
    - "requireProfile() first in every handler — org_id derived from profile, never request"
    - "createClient() for RLS-scoped queries — no service role needed for org routes"
    - "vehicles scoped via user_id = profile.org_id (no org_id column on vehicles)"
    - "PATCH blocks pipeline_status='closed' with 422 — broker close is a separate endpoint"
    - "canTransition() guard pattern before any pipeline_status DB update"
    - "Prefer 404 over 403 on ownership checks — don't confirm cross-tenant existence"

key-files:
  created:
    - lib/transactions/types.ts
    - lib/transactions/schemas.ts
    - app/api/transactions/route.ts
    - app/api/transactions/[id]/route.ts
  modified: []

key-decisions:
  - "RE-only guard on POST checks organizations.vertical = 'real_estate' — dealers get 403"
  - "transaction_number generated as TXN-YYYY-NNNN (simple random; collisions acceptable at MVP scale)"
  - "Legacy status column kept in sync with pipeline_status on every write for backward compatibility"
  - "PATCH blocks 'closed' before canTransition check — clearer error message for agents"
  - "GET list returns vehicle_id-scoped rows (up to 50) after verifying vehicle ownership"

patterns-established:
  - "PipelineStatus + VALID_TRANSITIONS in types.ts — import canTransition() wherever transitions are enforced"
  - "TransactionUpdateSchema never includes commission_snapshot or commission_plan_id — those are RPC-only"

duration: 10min
completed: 2026-05-28
---

# Phase 9 Plan 02: Transaction CRUD API Summary

**Four route handlers (POST/GET /api/transactions and GET/PATCH /api/transactions/[id]) delivering full agent-path transaction lifecycle with Zod validation, VALID_TRANSITIONS enforcement, and broker-close gate.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-05-28T00:00:00Z
- **Completed:** 2026-05-28T00:10:00Z
- **Tasks:** 2
- **Files modified:** 4 (all new)

## Accomplishments

- `lib/transactions/types.ts` delivers PipelineStatus (7 stages), VALID_TRANSITIONS map, canTransition() helper, Parties interface, and Transaction interface aligned to migrations 180+193.
- `lib/transactions/schemas.ts` delivers TransactionCreateSchema (vehicle_id required, all offer fields optional) and TransactionUpdateSchema (all fields optional, commission_snapshot/plan_id excluded).
- `app/api/transactions/route.ts` implements POST (create with RE-org guard, vehicle ownership check, transaction_number generation) and GET (list by vehicle_id, limit 50).
- `app/api/transactions/[id]/route.ts` implements GET (single, 404-preferred ownership) and PATCH (Zod parse, closed-status block, VALID_TRANSITIONS enforcement, closing_date/final_sale_price writable by agents).

## Task Commits

1. **Task 1: Transaction types and Zod schemas** - `0745661` (feat)
2. **Task 2: POST/GET /api/transactions and GET/PATCH /api/transactions/[id]** - `8ec0371` (feat)

## Files Created/Modified

- `lib/transactions/types.ts` — PipelineStatus, VALID_TRANSITIONS, canTransition(), Parties, Transaction interface
- `lib/transactions/schemas.ts` — TransactionCreateSchema and TransactionUpdateSchema (Zod)
- `app/api/transactions/route.ts` — POST (create) and GET (list by vehicle_id) endpoints
- `app/api/transactions/[id]/route.ts` — GET (single) and PATCH (agent update + pipeline advance) endpoints

## Decisions Made

- RE-only guard on POST: checks `organizations.vertical = 'real_estate'`; dealer orgs receive 403.
- Transaction number format `TXN-YYYY-NNNN` (simple random); sufficient at MVP scale.
- Legacy `status` column kept in sync with `pipeline_status` on every write to avoid breaking any code still reading the old column.
- PATCH rejects `pipeline_status='closed'` before calling `canTransition()` to give agents a clear, actionable error message pointing to the close endpoint.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 09-03 (commission plan management UI) can proceed — no API route dependencies.
- Plan 09-04 (TransactionPanel UI) depends on all four routes from this plan — they are now live.
- Plan 09-05 (broker close endpoint) adds `POST /api/transactions/[id]/close` that calls the `close_re_transaction` RPC. The PATCH guard (`pipeline_status='closed'` → 422) is already in place.

---
*Phase: 09-transactions-commissions*
*Completed: 2026-05-28*
