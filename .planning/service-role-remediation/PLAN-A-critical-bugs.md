# PLAN-A — Critical Bugs & Wrong/Needs Review Fixes

**Agent:** Any (Claude, Codex, Gemini, Cursor)
**Risk:** High/Medium — requires a DB migration and careful code review
**Parallelizable with:** PLAN-B, PLAN-C, PLAN-D, PLAN-E (no file overlap)

---

## Context

These are NOT mechanical conversions. Each item has a real bug or needs careful review.
Read each section fully before touching the file.

Working directory: `/home/tim/Applications/Wyze/wyze-app/`

---

## Task 1 — CRITICAL: Fix cross-org push notification bug

**File:** `lib/push/send.ts`
**Risk:** HIGH — every dealer's new-lead push notification is currently delivered to ALL subscribers regardless of org.

### What's wrong

`sendLeadNotification` reads all push subscriptions without an org filter:

```typescript
const { data: subs } = await supabase
  .from('push_subscriptions')
  .select('subscription')
// missing: .eq('org_id', orgId)
```

### Fix — Step 1: Create migration

Create file: `supabase/migrations/111_push_subscriptions_org.sql`

```sql
-- Add org_id to push_subscriptions for per-org filtering
ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Backfill from profiles (push subscriptions are user-owned; profiles have org_id)
UPDATE push_subscriptions ps
SET org_id = p.org_id
FROM profiles p
WHERE p.id = ps.user_id
  AND ps.org_id IS NULL;

-- Index for the filter used in sendLeadNotification
CREATE INDEX IF NOT EXISTS push_subscriptions_org_id_idx ON push_subscriptions(org_id);
```

Apply this migration in Supabase before deploying the code change.

### Fix — Step 2: Update send.ts

In `lib/push/send.ts`, find `sendLeadNotification` (or whichever function queries `push_subscriptions`).

Change the query to filter by `org_id`:

```typescript
// Pass orgId as a parameter — the caller must provide it
export async function sendLeadNotification(orgId: string, payload: PushPayload): Promise<void> {
  // ... existing VAPID guard ...

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('subscription')
    .eq('org_id', orgId)   // ← ADD THIS

  // ... rest of function unchanged ...
}
```

If `sendLeadNotification` doesn't accept `orgId` yet, add it as the first parameter and update all callers.

### Fix — Step 3: Update all callers of sendLeadNotification

Search for all callers:
```bash
grep -rn "sendLeadNotification" app/ lib/ --include="*.ts"
```

Each caller must pass the correct `orgId`. The orgId should come from the org that received the lead (it's available in lead ingest context).

---

## Task 2 — MEDIUM: Guard orgId in lib/leads/ingest.ts

**File:** `lib/leads/ingest.ts`

### What's wrong

The function signature is `async function ingestLead(orgId?: string, ...)`. Inside, it uses `const userId = orgId!` — a non-null assertion. If any caller omits orgId, all DB queries silently filter by `undefined`, returning no rows without throwing.

### Fix

Find where `orgId` is first used and add an explicit guard at the top of the function:

```typescript
export async function ingestLead(orgId: string | undefined, ...) {
  if (!orgId) {
    throw new Error('[leads/ingest] orgId is required — caller must provide org context')
  }
  // rest of function — orgId is now guaranteed non-null
}
```

Also update the function signature from `orgId?: string` to `orgId: string` if no callers legitimately omit it. Verify with:
```bash
grep -rn "ingestLead" app/ lib/ --include="*.ts"
```

---

## Task 3 — LOW: Add .limit() to lib/orgs/lookup.ts

**File:** `lib/orgs/lookup.ts`

### What's wrong

`getOrgIdByPhone` and `getOrgIdByGmail` do full table scans of `org_settings` with no row limit. On a large tenant base this becomes expensive and could be abused to cause slow queries.

### Fix

Add `.limit(1)` to the lookup queries (they only need the first match):

```typescript
// Before:
const { data } = await supabase
  .from('org_settings')
  .select('org_id')
  .eq('twilio_phone', normalizedPhone)
  .maybeSingle()

// After: (if using .maybeSingle() already, it returns one row — add .limit(1) before it)
const { data } = await supabase
  .from('org_settings')
  .select('org_id')
  .eq('twilio_phone', normalizedPhone)
  .limit(1)
  .maybeSingle()
```

Apply the same `.limit(1)` pattern to all lookup queries in this file.

---

## Task 4 — MEDIUM: Document intentional split in settings/transfer/route.ts

**File:** `app/api/settings/transfer/route.ts`

### What's wrong

The route uses `createServiceClient()` for `business_transfers` writes and `createClient()` for data snapshot count queries in the same handler. This confusing split needs documentation so future developers don't "fix" it incorrectly.

### Fix

Add a comment at the point where the service client is created:

```typescript
// Service client is intentional here: business_transfers requires elevated write access
// because RLS on that table does not allow org users to write transfer records directly.
// All snapshot count queries below use the auth client (supabase) for org scoping.
const svc = createServiceClient()
```

No functional change needed. The split is correct by design.

---

## Task 5 — MEDIUM: Verify org scoping in settings/data-export/route.ts

**File:** `app/api/settings/data-export/route.ts`

### What to verify

This route exports an entire org's data. Open the file and manually check every table that is queried:

1. Does every `select` include `.eq('org_id', org_id)` or `.eq('user_id', org_id)`?
2. Are there any tables that lack org scoping? (Remember: `customers` uses `user_id`, not `org_id`; `activities` has no `org_id` at all — must join through a customer or be skipped.)

### Fix (if gaps found)

Add the missing `.eq()` filters. If `activities` is exported without an org-scoped join, add:
```typescript
.eq('customer_id', /* only customers from this org */)
```
or join through the customer list.

If all tables are already scoped, no change needed — add a comment confirming the audit was done:
```typescript
// Verified 2026-05-XX: all exported tables are scoped to org_id / user_id (org)
```

---

## Task 6 — MEDIUM: Verify org ownership in lib/social/tokenRefresh.ts

**File:** `lib/social/tokenRefresh.ts`

### What's wrong

The function updates `social_accounts` token rows using a service client. It trusts the caller to pass a pre-validated account object. If any caller doesn't verify org ownership first, a token write could target the wrong org's account.

### Fix

1. Find all callers:
```bash
grep -rn "tokenRefresh\|refreshSocialToken" app/ lib/ --include="*.ts"
```

2. For each caller, verify that the account being passed was loaded with an org filter (e.g., `.eq('org_id', orgId)`).

3. Add a runtime guard in `tokenRefresh.ts` itself:
```typescript
export async function refreshSocialToken(account: SocialAccount, orgId: string): Promise<void> {
  if (account.org_id !== orgId) {
    throw new Error('[social/tokenRefresh] account org_id does not match caller orgId')
  }
  // ... rest of function
}
```

If `orgId` is not currently passed as a parameter, add it and update all callers.

---

## Task 7 — MEDIUM: Verify callers of lib/social/autoPost.ts

**File:** `lib/social/autoPost.ts`

### What's wrong

Reads `social_accounts` and writes `render_queue` using a service client. The accounts are loaded from a caller-provided `orgId`. If any caller passes the wrong `orgId`, posts could go to the wrong account.

### Fix

1. Add an explicit `orgId` parameter if not already present.
2. Verify the `social_accounts` query filters by org:
```typescript
const { data: accounts } = await supabase
  .from('social_accounts')
  .select('*')
  .eq('org_id', orgId)  // must be present
```
3. Verify all callers:
```bash
grep -rn "autoPost\|schedulePost" app/ lib/ --include="*.ts"
```

---

## Task 8 — LOW-MEDIUM: Fix storage object path check in customers/[id]/documents/[docId]/route.ts

**File:** `app/api/customers/[id]/documents/[docId]/route.ts`

### What's wrong

The route uses `createClient()` for the DB ownership check (correct) but then generates a storage signed URL via service client without re-verifying that the storage object path belongs to the authenticated org. A user could potentially craft a docId that points to another org's document.

### Fix

After loading the document record from the DB (which is org-scoped), verify the storage path includes the org's prefix before generating the signed URL:

```typescript
const doc = await supabase.from('customer_documents').select('*').eq('id', docId).single()

// Verify storage path belongs to this org (paths should be: {org_id}/{customer_id}/filename)
if (!doc.data?.storage_path?.startsWith(`${orgId}/`)) {
  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}

// Now safe to generate signed URL
const storage = createServiceClient()
const { data: url } = await storage.storage.from('customer-docs').createSignedUrl(doc.data.storage_path, 3600)
```

Check what the actual path format is in your storage bucket first. Adjust the prefix check accordingly.

---

## Task 9 — LOW: Use platform.ts helpers in app/(app)/layout.tsx

**File:** `app/(app)/layout.tsx`

### What's wrong

The RSC layout uses `createServiceClient()` directly to check `platform_superusers`. The codebase has `lib/auth/platform.ts` with helper functions for this check. Using the raw service client is a consistency issue.

### Fix

Replace the raw platform check with the appropriate helper from `lib/auth/platform.ts`:

```typescript
// Before (raw service client):
const { data } = await createServiceClient()
  .from('platform_superusers')
  .select('user_id')
  .eq('user_id', profile.id)
  .maybeSingle()
const isSuperAdmin = !!data

// After (use platform helper):
import { isPlatformSuperAdmin } from '@/lib/auth/platform'
const isSuperAdmin = await isPlatformSuperAdmin(profile.id)
```

Check what helpers exist in `lib/auth/platform.ts` first and use the most appropriate one.

---

## Task 10 — LOW: Document dual-client pattern in vehicles/[id]/video and vehicles/[id]/render

**Files:**
- `app/api/vehicles/[id]/video/route.ts`
- `app/api/vehicles/[id]/render/route.ts`

### What's wrong

Both routes use `createClientForRequest()` for vehicle DB queries (correct — handles impersonation) and a separate `svcClient = createServiceClient()` for render_queue inserts. This split exists because render_queue likely has no per-org RLS.

### Fix

Verify `render_queue` table RLS status in Supabase dashboard or migrations. Then add a comment:

```typescript
// render_queue has no RLS (platform-managed table) — service client required for insert.
// Vehicle ownership verified above via org-scoped createClientForRequest() query.
const svc = createServiceClient()
```

No functional change required if the pattern is intentional. The comment prevents future "cleanup" that would break it.

---

## Verification

After completing all tasks:

```bash
cd /home/tim/Applications/ApolloCRM/apollo-crm
npx eslint "app/**/*.ts" "lib/**/*.ts" --max-warnings=0
npm test
npm run build
```

All three must pass with zero errors.
