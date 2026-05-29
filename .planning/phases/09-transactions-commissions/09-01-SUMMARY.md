---
phase: 09-transactions-commissions
plan: "01"
subsystem: database
tags: [postgres, plpgsql, rls, migrations, commissions, transactions, real-estate]

requires:
  - phase: 08-showings
    provides: showings table and org_settings columns used as model for additive migration pattern
  - phase: 07-listing-intelligence
    provides: vehicles table (listings) that close_re_transaction updates to status='sold'

provides:
  - Extended transactions table with RE pipeline columns (offer through closing)
  - Extended commission_plans table with agent/broker split, co-broke, and referral fields
  - close_re_transaction SECURITY DEFINER RPC — atomic close + vehicle sold + commission snapshot

affects:
  - 09-02-api-routes (transaction CRUD + close endpoint use these columns and RPC)
  - 09-03-commission-ui (commission plan management UI reads plan_type, is_default, agent_split_pct)
  - 10-listing-video (may read vehicle status=sold to trigger video flows)

tech-stack:
  added: []
  patterns:
    - "SECURITY DEFINER + SET search_path='' for RPCs that update multiple tables across RLS boundaries"
    - "DO $$ block guard pattern for idempotent CREATE POLICY in migrations"
    - "Agent-specific commission plan with org-default fallback via ORDER BY agent_id NULLS LAST LIMIT 1"
    - "Commission snapshot frozen at close time as JSONB — never recalculated retroactively"

key-files:
  created:
    - supabase/migrations/193_transactions_extend.sql
    - supabase/migrations/194_commission_plans_extend.sql
    - supabase/migrations/195_close_re_transaction_rpc.sql
  modified: []

key-decisions:
  - "Status CHECK expanded rather than replaced: old 'pending' migrated to 'offer', 'cancelled' stays valid (also maps to fallen_through for new rows)"
  - "vehicles.user_id = p_org_id used for org-scoping in close_re_transaction per schema gotcha (vehicles has no org_id column)"
  - "co_broke_pct in commission snapshot draws from commission_plans not from transactions.co_broke_pct to keep plan-driven calculation"
  - "GRANT EXECUTE to service_role only — authenticated callers go through API routes that use service client"

patterns-established:
  - "RPC pattern: FOR UPDATE lock → validate state → compute → UPDATE transactions → UPDATE vehicles → RETURN JSONB"
  - "Commission snapshot: gross GCI → referral deduction → net pool → agent split → broker remainder → co-broke share"

duration: 12min
completed: 2026-05-28
---

# Phase 9 Plan 01: Transactions & Commissions Schema Summary

**Three additive migrations extend transactions and commission_plans tables and deliver the close_re_transaction SECURITY DEFINER RPC that atomically closes a deal and marks the vehicle sold with a frozen commission snapshot.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-05-28T00:00:00Z
- **Completed:** 2026-05-28T00:12:00Z
- **Tasks:** 3
- **Files modified:** 3 (all new)

## Accomplishments

- Migration 193 extends transactions with 9 new columns, expands the status CHECK to include the full RE pipeline (offer through fallen_through), migrates existing pending/cancelled rows, and adds covering indexes.
- Migration 194 extends commission_plans with agent/broker split percentages, co-broke, referral fee (flat and pct), plan_type, and is_default flag; backfills from existing split_pct; enforces one-default-per-org with a partial unique index.
- Migration 195 delivers close_re_transaction as a SECURITY DEFINER PL/pgSQL function with explicit search_path='' that locks the transaction, validates pipeline state, resolves the commission plan, computes and freezes the commission snapshot, updates both transactions and vehicles atomically, and returns the JSONB snapshot to the caller.

## Task Commits

1. **Task 1: Migration 193 — extend transactions table** - `95f7b69` (feat)
2. **Task 2: Migration 194 — extend commission_plans table** - `fd444e5` (feat)
3. **Task 3: Migration 195 — close_re_transaction RPC** - `013aef6` (feat)

## Files Created/Modified

- `supabase/migrations/193_transactions_extend.sql` — Additive columns on transactions, expanded CHECK, data migration, indexes, guarded RLS policy
- `supabase/migrations/194_commission_plans_extend.sql` — Additive columns on commission_plans, backfill, partial unique index, guarded RLS policies
- `supabase/migrations/195_close_re_transaction_rpc.sql` — SECURITY DEFINER RPC with atomic transaction close + vehicle sold update + commission snapshot JSONB

## Decisions Made

- Used `ORDER BY agent_id NULLS LAST LIMIT 1` to prefer agent-specific plan over org default in a single query rather than two queries with fallback logic.
- Kept `status` column alongside `pipeline_status` for backward compatibility — existing code that reads `status='closed'` continues to work without a migration.
- Used DO block guards (`IF NOT EXISTS pg_policies`) for all new RLS policies to make migrations safe to re-run without duplicate policy errors.
- vehicles scoped via `user_id = p_org_id` per documented schema gotcha — no org_id column on vehicles.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required. Apply migrations in order (193 → 194 → 195) via the Supabase SQL editor or migration runner.

After applying, verify with:
```sql
SELECT column_name FROM information_schema.columns WHERE table_name = 'transactions' ORDER BY ordinal_position;
SELECT column_name FROM information_schema.columns WHERE table_name = 'commission_plans' ORDER BY ordinal_position;
SELECT proname FROM pg_proc WHERE proname = 'close_re_transaction';
```

## Next Phase Readiness

- All Phase 9 API routes can now be built: the extended schema and RPC are the only DB prerequisites.
- Plan 09-02 (transaction CRUD + close endpoint) can proceed immediately.
- RPC vehicle update (vehicles.status='sold') requires a real transaction with a valid vehicle_id to verify end-to-end — should be confirmed during 09-02 integration testing with a test transaction.

---
*Phase: 09-transactions-commissions*
*Completed: 2026-05-28*
