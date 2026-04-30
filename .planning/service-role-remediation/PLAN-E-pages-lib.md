# PLAN-E — Reducible: RSC Pages + lib/sms/quota Consolidation

**Agent:** Any (Claude, Codex, Gemini, Cursor)
**Risk:** Low — mechanical conversion for pages; medium complexity for quota refactor
**Parallelizable with:** PLAN-A, PLAN-B, PLAN-C, PLAN-D (no file overlap)

---

## Context

Two types of work in this plan:
1. **RSC pages** (React Server Components in `app/(app)/`) — same mechanical conversion as routes
2. **lib/sms/quota.ts** — a more complex refactor to eliminate 6 redundant service client instantiations per invocation

Working directory: `/home/tim/Applications/ApolloCRM/apollo-crm/`

---

## Part 1 — RSC Pages: Mechanical Conversion

These pages call `requireProfile()` at the top and then use `createServiceClient()` for server-side data fetching. Since they're RSC pages with a full session, `createClient()` with RLS is correct.

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

Note: RSC pages are `async` components, so `await createClient()` is valid at the top level of the component or in a data-fetching function within it.

---

### Files to Convert

**1. `app/(app)/settings/appearance/page.tsx`**
- Line: 8
- Pattern: requireProfile + service + `.eq('org_id', org_id)`
- Action: Replace with `await createClient()`

**2. `app/(app)/settings/retention/page.tsx`**
- Line: 7
- Pattern: requireProfile + service + `.eq('org_id', org_id)`
- Action: Replace with `await createClient()`

**3. `app/(app)/customers/segments/page.tsx`**
- Line: 10
- Pattern: requireProfile + service + `.eq('org_id', org_id)`
- Action: Replace with `await createClient()`

**4. `app/(app)/analytics/referrals/page.tsx`**
- Line: 11
- Pattern: requireProfile + service + `.eq('user_id', org_id)` on customers
- Action: Replace with `await createClient()`

**5. `app/(app)/pending/page.tsx`**
- Line: 15
- Pattern: requireProfile + service + `.eq('id', org_id)` on organizations
- Action: Replace with `await createClient()`

**6. `app/(app)/settings/payments/page.tsx`**
- Line: 16
- Pattern: requireProfile + service + org-scoped
- Action: Replace with `await createClient()`

**7. `app/(app)/settings/social/page.tsx`**
- Line: 13
- Pattern: requireProfile + service + org-scoped
- Action: Replace with `await createClient()`

**8. `app/(app)/settings/video/page.tsx`**
- Line: 20
- Pattern: requireProfile + service + `.eq('org_id', org_id)`
- Action: Replace with `await createClient()`

---

## Part 2 — lib/sms/quota.ts: Consolidate 6 Service Clients

**File:** `lib/sms/quota.ts`

### What's wrong

`checkQuota()` creates one service client itself, then spawns helpers each creating their own:
- `checkQuota()` itself: 1 client
- `incrementSmsOverage()`: 1 client
- `incrementMmsOverage()`: 1 client
- `deductBuffer()`: 1 client
- `triggerLowBufferNotification()`: 1 client
- `triggerQuotaNotification()`: 1 client

Total: 6 service clients per worst-case invocation. This is wasteful — each `createServiceClient()` call instantiates a new Supabase client.

### Fix

**Option A — Accept client as parameter (preferred)**

Refactor internal helpers to accept a Supabase client rather than creating their own:

```typescript
// Internal helpers — accept client from caller
async function incrementSmsOverage(supabase: SupabaseClient, orgId: string): Promise<void> {
  await supabase.from('sms_usage').update(...).eq('org_id', orgId)
}

async function deductBuffer(supabase: SupabaseClient, orgId: string, amount: number): Promise<void> {
  await supabase.from('sms_buffer').update(...).eq('org_id', orgId)
}

// Public entry point creates ONE client and passes it through
export async function checkQuota(orgId: string, ...): Promise<QuotaResult> {
  const supabase = createServiceClient()  // ONE client for the whole operation
  
  const quota = await supabase.from('sms_quota')...  // main query
  
  if (overage) {
    await incrementSmsOverage(supabase, orgId)  // pass client, don't create new
  }
  if (mmsOverage) {
    await incrementMmsOverage(supabase, orgId)  // pass client
  }
  // ... etc
}
```

**Option B — Create once at module level (simpler, but less testable)**

Only viable if `checkQuota` is never called in a context where the client should be scoped differently. Not recommended for this codebase pattern.

**Recommended: Option A**

Steps:
1. Open `lib/sms/quota.ts`
2. Identify all internal helper functions that call `createServiceClient()`
3. Add `supabase: SupabaseClient` as first parameter to each helper
4. In `checkQuota()`, create ONE `const supabase = createServiceClient()` at the top
5. Pass `supabase` to every helper call
6. Remove all `createServiceClient()` calls from the helpers
7. Remove unused `createServiceClient` imports from helpers if they're in separate files

If the helpers are in `lib/sms/quota.ts` itself (same file), this is a simple parameter-threading change. If they're imported from other files, add the parameter to the exports too.

### Type for the client parameter

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
```

Or use the type already used in the codebase (check existing helper signatures).

---

## Verification

After completing all changes:

```bash
cd /home/tim/Applications/ApolloCRM/apollo-crm
npx eslint \
  "app/\(app\)/settings/appearance/page.tsx" \
  "app/\(app\)/settings/retention/page.tsx" \
  "app/\(app\)/customers/segments/page.tsx" \
  "app/\(app\)/analytics/referrals/page.tsx" \
  "app/\(app\)/pending/page.tsx" \
  "app/\(app\)/settings/payments/page.tsx" \
  "app/\(app\)/settings/social/page.tsx" \
  "app/\(app\)/settings/video/page.tsx" \
  "lib/sms/quota.ts" \
  --max-warnings=0
npm test
npm run build
```

All three must pass with zero errors.
