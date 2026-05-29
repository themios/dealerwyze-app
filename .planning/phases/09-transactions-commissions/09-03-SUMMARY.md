---
phase: 09-transactions-commissions
plan: "03"
subsystem: api
tags: [commission-plans, crud, zod, real-estate, broker, rls, next-js]

requires:
  - phase: 09-01
    provides: Extended commission_plans schema (plan_type, is_default, agent_split_pct, etc.) and partial unique index enforcing one default per org

provides:
  - CommissionPlanCreateSchema and CommissionPlanUpdateSchema Zod schemas in lib/commissions/schemas.ts
  - GET /api/commission-plans — list plans for RE org (all members)
  - POST /api/commission-plans — create plan with default-swap logic (broker/admin only)
  - PATCH /api/commission-plans/[id] — update plan with default-swap (broker/admin only)
  - DELETE /api/commission-plans/[id] — delete plan with open-transaction guard (broker/admin only)

affects:
  - 09-05-commission-ui (reads these endpoints for settings UI)
  - 09-02-transactions (DELETE guard references transactions table)

tech-stack:
  added: []
  patterns:
    - "RE vertical gate via organizations.vertical lookup before all handlers"
    - "isDealerAdmin() role gate for broker/admin-only write operations"
    - "Default-swap: clear is_default on existing org default before setting new one (API-level + DB partial unique index)"
    - "Own-or-404 on plan lookup: neq id not leaked to other orgs"

key-files:
  created:
    - lib/commissions/schemas.ts
    - app/api/commission-plans/route.ts
    - app/api/commission-plans/[id]/route.ts
  modified: []

key-decisions:
  - "superRefine used over refine so type narrowing works correctly on partial UpdateSchema"
  - "broker_split_pct auto-computed as 100 - agent_split_pct when omitted for percentage_split plans"
  - "DELETE 409 guard checks neq status closed/fallen_through — matches RE pipeline terminal states from migration 193"

patterns-established:
  - "GET does not require NextRequest parameter when no query params needed — drop unused param to satisfy eslint no-unused-vars"

duration: 15min
completed: 2026-05-28
---

# Phase 9 Plan 03: Commission Plans CRUD API Summary

**Broker-only commission plan CRUD API with Zod validation, one-default-per-org swap logic, and open-transaction guard on delete.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-28T00:00:00Z
- **Completed:** 2026-05-28T00:15:00Z
- **Tasks:** 2
- **Files modified:** 3 (all new)

## Accomplishments

- Zod schemas for commission plan create and update with `.superRefine` guard requiring `agent_split_pct` for `percentage_split` plans.
- GET/POST on `/api/commission-plans`: reads open to all RE org members; writes restricted to broker/admin with atomic default-swap pattern.
- PATCH/DELETE on `/api/commission-plans/[id]`: update handles default promotion swap; delete returns 409 if open transactions reference the plan.

## Task Commits

1. **Task 1: Commission plan Zod schemas** - `e8821ac` (feat)
2. **Task 2: Commission Plans CRUD routes** - `58bcc31` (feat)

## Files Created/Modified

- `lib/commissions/schemas.ts` — CommissionPlanCreateSchema and CommissionPlanUpdateSchema with superRefine validation
- `app/api/commission-plans/route.ts` — GET (list) and POST (create) with RE vertical check, broker/admin gate, default-swap
- `app/api/commission-plans/[id]/route.ts` — PATCH (update) and DELETE with default-swap, owns-or-404, open-transaction 409 guard

## Decisions Made

- Used `superRefine` instead of `refine` so the partial `UpdateSchema` inherits the refinement correctly without TypeScript narrowing issues.
- `broker_split_pct` auto-computed on POST and PATCH when `plan_type = 'percentage_split'` and caller omits it.
- DELETE guards against `status NOT IN ('closed', 'fallen_through')` — the two terminal states added in migration 193.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

Minor: `GET` handler had `_req: NextRequest` parameter that was unused, triggering ESLint `no-unused-vars`. Fixed by dropping the parameter (no NextRequest needed since no query params are read).

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Commission Plans API is fully operational. Plan 09-05 (commission settings UI) can consume GET/POST/PATCH/DELETE immediately.
- DB unique index from migration 194 provides a safety net if concurrent POST requests race to set a new default — API-level swap + DB constraint = double protection.

---
*Phase: 09-transactions-commissions*
*Completed: 2026-05-28*
