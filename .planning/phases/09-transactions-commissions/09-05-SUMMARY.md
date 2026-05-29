---
phase: 09-transactions-commissions
plan: "05"
subsystem: ui
tags: [react, supabase, nextjs, commissions, transactions, settings]

requires:
  - phase: 09-02
    provides: Transaction CRUD API and pipeline status types
  - phase: 09-03
    provides: Commission Plans CRUD API and Zod schemas
  - phase: 09-04
    provides: TransactionPanel with close dialog built inline

provides:
  - POST /api/transactions/[id]/close — hardened with isDealerAdmin(), sanitized RPC errors
  - Inline Confirm Close dialog in TransactionPanel (pre-built in 09-04, verified here)
  - CommissionPlanForm component for create/edit
  - CommissionPlanCard component with delete 409 guard
  - /settings/commission-plans page (broker/admin only, RE vertical only)
  - Commission Plans nav entry in settings (verticalHide: dealer)

affects:
  - Phase 10 (Listing Video) — close flow marks vehicle sold, used downstream
  - Any phase referencing commission_snapshot from closed transactions

tech-stack:
  added: []
  patterns:
    - verticalHide array on SettingsItemConfig for RE-only nav entries
    - Client-side vertical redirect in settings pages (useVertical + router.replace)
    - isDealerAdmin() helper for all broker-gate checks (no raw role string comparisons)

key-files:
  created:
    - app/api/transactions/[id]/close/route.ts
    - components/commissions/CommissionPlanForm.tsx
    - components/commissions/CommissionPlanCard.tsx
    - app/(app)/settings/commission-plans/page.tsx
  modified:
    - lib/transactions/types.ts
    - lib/settings/config.ts

key-decisions:
  - "isDealerAdmin() helper used for broker gate — no raw role string comparisons"
  - "RPC errors sanitized in close route — no Postgres details exposed to client"
  - "Commission Plans nav entry hidden from dealer vertical via verticalHide config"
  - "closing_price field added to Transaction type (column existed since migration 180)"

patterns-established:
  - "verticalHide: ['dealer'] on SettingsItemConfig = RE-only settings nav entry"
  - "useVertical() + router.replace for client-side vertical guard in settings pages"

duration: 25min
completed: 2026-05-28
---

# Phase 09 Plan 05: Commission Plans UI + Close Route Hardening Summary

**Broker-only close route hardened with proper role helper and sanitized RPC errors; commission plans CRUD UI at /settings/commission-plans with RE-only nav entry (TXN-05 + TXN-06 complete)**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-28T00:00:00Z
- **Completed:** 2026-05-28T00:25:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Close route verified: calls `close_re_transaction` RPC atomically, broker gate enforced via `isDealerAdmin()`, commission snapshot returned
- Inline Confirm Close dialog in TransactionPanel (built during 09-04 checkpoint) pre-fills `final_sale_price` and `closing_date` from transaction, authority guard shown to agents
- CommissionPlanForm with percentage split, co-broke %, referral fee, is_default checkbox
- CommissionPlanCard with edit/delete actions; 409 guard shows "plan in use" message
- /settings/commission-plans page: empty state, loading skeleton, CRUD dialog; dealer orgs redirected on mount
- Settings nav: Commission Plans entry added to compliance-finance group, hidden from dealer vertical via `verticalHide: ['dealer']`

## Task Commits

1. **Task 1: Close route hardening** - `03a8048` (fix)
2. **Task 2: Commission plans settings page** - `dc789cf` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `app/api/transactions/[id]/close/route.ts` — POST endpoint with isDealerAdmin() gate, sanitized RPC errors, closing_price/date from body or txn record
- `lib/transactions/types.ts` — Added `closing_price: number | null` field (column from migration 180)
- `components/commissions/CommissionPlanForm.tsx` — Create/edit form (tier_name, plan_type, agent_split_pct, co_broke_pct, referral_fee_flat, is_default)
- `components/commissions/CommissionPlanCard.tsx` — Display card with edit/delete; 409 guard on delete; confirmation dialog
- `app/(app)/settings/commission-plans/page.tsx` — Broker-only settings page; dealer redirect via useVertical(); permission denied on 403
- `lib/settings/config.ts` — Commission Plans nav entry (compliance-finance group, verticalHide: dealer, dealer_admin audience)

## Decisions Made

- `isDealerAdmin()` from `types/index` used for broker gate — avoids raw role string comparisons that could miss role variants
- RPC errors in close route are sanitized: known patterns mapped to clean user messages, unknown errors return generic 500
- `closing_price` field added to Transaction type — the column has existed since migration 180 but was missing from the TS interface
- Commission Plans settings page uses client-side vertical check (useVertical + router.replace) rather than server-side redirect, matching the pattern of other settings pages
- `verticalHide: ['dealer']` on the nav config entry is the correct mechanism — SettingsDesktopNav and SettingsMobileNav both filter on this

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Raw role string comparison in close route**
- **Found during:** Task 1 (close route verification)
- **Issue:** Route used `(profile.role as string) === 'owner'` — 'owner' is not a valid UserRole, and bypassed `isDealerAdmin()` helper
- **Fix:** Replaced with `isDealerAdmin(profile.role)` which correctly handles `dealer_admin` and `admin`
- **Files modified:** app/api/transactions/[id]/close/route.ts
- **Verification:** `npx tsc --noEmit` clean
- **Committed in:** 03a8048

**2. [Rule 1 - Bug] Raw RPC error message forwarded to client**
- **Found during:** Task 1 (close route verification)
- **Issue:** `rpcError.message` was directly returned in the JSON response — exposes Postgres internals
- **Fix:** Added error message sanitizer: known patterns mapped to clean messages, fallback to generic 500
- **Files modified:** app/api/transactions/[id]/close/route.ts
- **Verification:** No Postgres detail in any error response path
- **Committed in:** 03a8048

**3. [Rule 2 - Missing Critical] closing_price missing from Transaction type**
- **Found during:** Task 1 (TypeScript review)
- **Issue:** Transaction interface lacked `closing_price` field; the column exists since migration 180 and the close route selects it
- **Fix:** Added `closing_price: number | null` to Transaction interface
- **Files modified:** lib/transactions/types.ts
- **Verification:** `npx tsc --noEmit` clean
- **Committed in:** 03a8048

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 missing critical)
**Impact on plan:** All fixes necessary for security and type correctness. No scope creep.

## Issues Encountered

- SettingsPageShell uses `headerActions` prop (not `actions`) and `type: 'form' | 'ops' | 'critical'` (not 'list') — corrected during creation
- Commission Plans page is a client component (uses useVertical/useRouter) — this is correct since other settings pages use the same pattern

## Next Phase Readiness

- TXN-05 and TXN-06 complete: broker can manage commission plans and confirm close atomically
- Phase 9 is now fully complete pending broker interview checkpoints (TXN-05/06 human-verify passed)
- Phase 10 (Listing Video) can begin — depends on Phase 7 listing records which are ready

---
*Phase: 09-transactions-commissions*
*Completed: 2026-05-28*
