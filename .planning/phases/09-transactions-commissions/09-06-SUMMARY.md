---
phase: 09-transactions-commissions
plan: "06"
subsystem: ui, api
tags: [commissions, real_estate, supabase, nextjs, typescript, tailwind]

requires:
  - phase: 09-05
    provides: commission_snapshot JSONB written by close_re_transaction RPC at deal close

provides:
  - GET /api/transactions/summary — role-scoped commission summary (agent own deals, admin all org)
  - /commissions page with YTD card, agents_summary section (admin), per-deal table
  - CommissionSummaryTable component with desktop table + mobile card view
  - YTDSummaryCard component
  - Commissions nav entry in RE sidebar

affects:
  - Phase 10 (Listing Video) — references commission amounts for video overlay
  - Any future commission export or reporting feature

tech-stack:
  added: []
  patterns:
    - "commission_snapshot JSONB read directly — never recalculated; amounts taken at close time"
    - "Agent scope: OR filter on listing_agent_id/buyer_agent_id; admin scope: all org rows"
    - "RE vertical gate in API (403) and page (redirect to /today)"
    - "buyer_agent_amount column conditionally rendered — hidden when no co-broke deals in result set"
    - "isDealerAdmin() used for role check; 'agent' role is non-admin"

key-files:
  created:
    - app/api/transactions/summary/route.ts
    - app/(app)/commissions/page.tsx
    - components/commissions/CommissionSummaryTable.tsx
    - components/commissions/YTDSummaryCard.tsx
  modified:
    - components/layout/DesktopSidebar.tsx

key-decisions:
  - "YTD total for agents = sum of listing_agent_amount where they are listing agent + buyer_agent_amount where buyer agent — computed server-side, not in DB"
  - "Admin YTD = sum of all listing + buyer amounts org-wide (gross agent payouts); admins see agents_summary grouped by agent"
  - "buyer_agent_amount column in table is conditionally shown only when at least one row has co-broke > 0 — avoids empty column clutter"
  - "Commissions page is client component with year selector; RE gate applied via useVertical + redirect"

patterns-established:
  - "Pattern: commission_snapshot JSONB read-only — no recalc anywhere in UI or API layer"
  - "Pattern: agent_id filter on summary route honored only for admins — prevents agents from viewing others' data"

duration: 25min
completed: 2026-05-29
---

# Phase 9 Plan 06: Commission Summary Page Summary

**Role-scoped commission summary API and /commissions page — agents see own YTD and deals, brokers see all-agents breakdown and org-wide table; buyer_agent_amount surfaced throughout (TXN-07, TXN-08)**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-29T00:00:00Z
- **Completed:** 2026-05-29T00:25:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- GET /api/transactions/summary: agent scope (own listing/buyer deals), admin scope (all org), year filter, agents_summary grouping for TXN-08
- /commissions page: YTD card, year selector, agent breakdown section (admin only), per-deal table with responsive mobile fallback
- buyer_agent_amount included in all API responses and table rows; column conditionally rendered
- Commissions nav link added to RE sidebar (DollarSign icon, RE-only reNav)
- npx tsc --noEmit clean; npm run build passed; ESLint 0 warnings

## Task Commits

1. **Task 1: Commission summary API** - `32148c8` (feat)
2. **Task 2: Commission summary page UI** - `81cce98` (feat)
3. **Lint fix: remove dead variable** - `9c7b20c` (fix)

## Files Created/Modified

- `app/api/transactions/summary/route.ts` — GET endpoint, role-scoped, year param, agents_summary for admins
- `app/(app)/commissions/page.tsx` — client page with year selector, YTD card, agent breakdown, deal table
- `components/commissions/CommissionSummaryTable.tsx` — desktop table + mobile card view; conditional buyer_agent_amount column
- `components/commissions/YTDSummaryCard.tsx` — large YTD total display card
- `components/layout/DesktopSidebar.tsx` — added Commissions to RE-only reNav

## Decisions Made

- YTD total for agents computed server-side by iterating transactions and summing matching agent IDs — avoids extra GROUP BY query
- buyer_agent_amount column hidden when no row has value > 0 — clean UX for orgs without co-broke
- Page redirects dealer orgs to /today (not notFound) — consistent with other non-404 vertical gates

## Deviations from Plan

None — plan executed exactly as written. The dead `isAdmin` variable removal was a lint cleanup caught by ESLint gate.

## Issues Encountered

Background `npm run build` process collision from prior session — killed stale lock and rebuilt successfully.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 9 complete: TXN-01 through TXN-08 all covered
- commission_snapshot data model is stable; Phase 10 (Listing Video) can reference commission amounts for video overlays
- /commissions page is live and role-gated — ready for human-verify checkpoint

---
*Phase: 09-transactions-commissions*
*Completed: 2026-05-29*
