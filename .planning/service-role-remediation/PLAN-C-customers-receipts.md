# PLAN-C — Reducible: Customers, Receipts, Activities, Calendar, Reports

**Agent:** Any (Claude, Codex, Gemini, Cursor)
**Risk:** Low — mechanical conversion, RLS enforces correctness
**Parallelizable with:** PLAN-A, PLAN-B, PLAN-D, PLAN-E (no file overlap)

---

## Context

These routes all call `requireProfile()` first, then use `createServiceClient()` with explicit org filters.
Converting to `createClient()` removes the over-privileged client while RLS enforces org scoping automatically.

Working directory: `/home/tim/Applications/ApolloCRM/apollo-crm/`

**IMPORTANT:** Some of these files may already be converted (Phase 2 did the Top 20). Check each file before editing — if it already uses `createClient()`, skip it.

**IMPORTANT for customers:** The `customers` table uses `user_id` for org scoping (not `org_id`). The `activities` table has NO `org_id` column — scoping goes through customer or user_id. Do not add `org_id` to either table.

---

## Mechanical Conversion Pattern

**Before:**
```typescript
import { createServiceClient } from '@/lib/supabase/service'
const supabase = createServiceClient()
```

**After:**
```typescript
import { createClient } from '@/lib/supabase/server'
const supabase = await createClient()
```

- `createClient()` is async — always `await` it.
- Remove unused `createServiceClient` import.
- Storage operations (signed URLs, bucket uploads) still need service client — split the variable if needed.

---

## Files to Convert

### Customers — Individual Record Routes

**1. `app/api/customers/[id]/route.ts`**
- Line: 12
- Pattern: requireProfile + service + `.eq('user_id', org_id)` on customers
- Action: Replace with `await createClient()`

**2. `app/api/customers/[id]/state/route.ts`**
- Line: 13
- Pattern: requireProfile + service + `.eq('user_id', org_id)` on customers (stage changes fire webhooks)
- Action: Replace with `await createClient()`

**3. `app/api/customers/[id]/deal-checklist/route.ts`**
- Pattern: requireProfile + service + org-scoped customer check
- Action: Replace with `await createClient()`

**4. `app/api/customers/[id]/documents/route.ts`**
- Pattern: requireProfile + service for DB queries; service also used for storage uploads
- Action: **Split pattern** — use `await createClient()` for DB queries, keep `createServiceClient()` for storage bucket upload only
- Note: Name the variables distinctly: `const supabase = await createClient()` for DB, `const storage = createServiceClient()` for storage

**5. `app/api/customers/[id]/merge/route.ts`**
- Line: 19
- Pattern: requireProfile + service + `.eq('user_id', org_id)` — destructive operation
- Action: Replace with `await createClient()`

**6. `app/api/customers/[id]/documents/[docId]/route.ts`**
- Pattern: requireProfile + service + org-scoped document lookup
- Action: Use `await createClient()` for the document DB query; if generating a signed URL from storage, keep service client for storage only

### Customers — Bulk/List Routes

**7. `app/api/customers/segment/route.ts`**
- Pattern: requireProfile + service + `.eq('org_id', org_id)` on segments
- Action: Replace with `await createClient()`

**8. `app/api/customers/segment/bulk-enroll/route.ts`**
- Pattern: requireProfile + service + org-scoped customer + sequence enrollment
- Action: Replace with `await createClient()`

**9. `app/api/customers/review-request/route.ts`**
- Pattern: requireProfile + service + `.eq('user_id', org_id)` on customers
- Action: Replace with `await createClient()`

### Customer Sequences

**10. `app/api/customer-sequences/route.ts`**
- Lines: 6, 20
- Pattern: requireProfile + service + `.eq('org_id', org_id)` on customer_sequences
- Action: Replace with `await createClient()`

**11. `app/api/customer-sequences/[id]/route.ts`**
- Line: 8
- Pattern: requireProfile + service + `.eq('org_id', org_id)` — enrollment patch
- Action: Replace with `await createClient()`

### Receipts

**12. `app/api/receipts/[id]/route.ts`**
- Pattern: requireProfile + service + `.eq('user_id', org_id)` on receipts
- Action: Replace with `await createClient()`

**13. `app/api/receipts/ledger/export/route.ts`**
- Line: 8
- Pattern: requireProfile + service + `.eq('user_id', org_id)` on ledger_transactions (financial data)
- Action: Replace with `await createClient()`
- Note: High-value target — financial export path. RLS should already enforce this.

### Activities, Calendar, Reports, Dashboard

**14. `app/api/activities/route.ts`**
- Pattern: requireProfile + service + `.eq('user_id', org_id)` — activities table uses user_id for org scoping
- Action: Replace with `await createClient()`
- Note: `activities` has NO `org_id` column. Do not add one. Filter by `user_id` (which equals `org_id`).

**15. `app/api/calendar/events/route.ts`**
- Pattern: requireProfile + service + `.eq('org_id', org_id)` on calendar events
- Action: Replace with `await createClient()`

**16. `app/api/reports/route.ts`**
- Pattern: requireProfile + service + org-scoped queries
- Action: Replace with `await createClient()`
- Note: Open this file and verify all queries have org filters before converting.

**17. `app/api/dashboard/stats/route.ts`**
- Pattern: requireProfile + service client used only for org name lookup (single column fetch)
- Action: Replace with `await createClient()`
- Note: Even a single-column fetch from `organizations` should use auth client when a session exists.

---

## Verification

After converting all files:

```bash
cd /home/tim/Applications/ApolloCRM/apollo-crm
npx eslint "app/api/customers/**/*.ts" "app/api/customer-sequences/**/*.ts" "app/api/receipts/**/*.ts" "app/api/activities/**/*.ts" "app/api/calendar/**/*.ts" "app/api/reports/**/*.ts" "app/api/dashboard/**/*.ts" --max-warnings=0
npm test
npm run build
```

All three must pass with zero errors.
