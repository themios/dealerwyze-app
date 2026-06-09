# PLAN-D — Reducible: Support, Pulse, Sales, Onboarding, Email, Vehicles & More

**Agent:** Any (Claude, Codex, Gemini, Cursor)
**Risk:** Low — mechanical conversion, RLS enforces correctness
**Parallelizable with:** PLAN-A, PLAN-B, PLAN-C, PLAN-E (no file overlap)

---

## Context

These routes all call `requireProfile()` first, then use `createServiceClient()` with explicit org filters.
Converting to `createClient()` removes the over-privileged client while RLS enforces org scoping automatically.

Working directory: `/home/tim/Applications/Wyze/wyze-app/`

**IMPORTANT:** Check each file before editing — if it already uses `createClient()`, skip it.

**Storage split rule:** If a route uses service client for BOTH DB queries AND storage operations, split the variable:
- `const supabase = await createClient()` for DB
- `const storage = createServiceClient()` for storage

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

---

## Files to Convert

### Support Tickets

**1. `app/api/support/tickets/route.ts`**
- Pattern: requireProfile + service + `.eq('org_id', org_id)` on support_tickets
- Action: Replace with `await createClient()`

**2. `app/api/support/tickets/[id]/route.ts`**
- Pattern: requireProfile + service + `.eq('org_id', org_id)` on support_tickets
- Action: Replace with `await createClient()`

**3. `app/api/support/tickets/[id]/messages/route.ts`**
- Pattern: requireProfile + service + org-scoped ticket ownership check
- Action: Replace with `await createClient()`

---

### Pulse

**4. `app/api/pulse/scores/route.ts`**
- Pattern: requireProfile + service + org-scoped pulse scores
- Action: Replace with `await createClient()`

**5. `app/api/pulse/actions/route.ts`**
- Pattern: requireProfile + service + `.eq('org_id', org_id)` on pulse_actions
- Action: Replace with `await createClient()`

**6. `app/api/pulse/actions/[id]/route.ts`**
- Pattern: requireProfile + service + `.eq('org_id', org_id)` on pulse_actions
- Action: Replace with `await createClient()`

**7. `app/api/pulse/surveys/route.ts`**
- Pattern: requireProfile + service + org-scoped customer check
- Action: Replace with `await createClient()`

**8. `app/api/pulse/rep-feedback/route.ts`**
- Pattern: requireProfile + service + org-scoped
- Action: Replace with `await createClient()`

**9. `app/api/pulse/team-scores/route.ts`**
- Pattern: requireProfile + service + org-scoped
- Action: Replace with `await createClient()`

---

### Sales (Channel Rep Routes)

**10. `app/api/sales/commissions/route.ts`**
- Pattern: requireProfile + requireChannelRep + service + affiliate-scoped
- Action: Replace with `await createClient()`
- Note: Verify `requireChannelRep` is still called after conversion — auth client enforces session but the channel rep role check is in the middleware helper.

**11. `app/api/sales/dealers/route.ts`**
- Pattern: requireProfile + requireChannelRep + service + affiliate-scoped
- Action: Replace with `await createClient()`

**12. `app/api/sales/me/route.ts`**
- Pattern: requireProfile + requireChannelRep + service
- Action: Replace with `await createClient()`

---

### Onboarding

**13. `app/api/onboarding/route.ts`**
- Pattern: requireProfile + service + `.eq('org_id', org_id)` on onboarding_steps or similar
- Action: Replace with `await createClient()`

**14. `app/api/onboarding/step/route.ts`**
- Pattern: requireProfile + service + `.eq('org_id', org_id)`
- Action: Replace with `await createClient()`

---

### Email & Fax

**15. `app/api/email/send/route.ts`**
- Pattern: requireProfile + service for org email settings lookup
- Action: Replace DB query with `await createClient()`

**16. `app/api/fax/send/route.ts`**
- Pattern: requireProfile + service for DB checks; service also used for `fax-docs` bucket upload
- Action: **Split pattern** — `await createClient()` for DB, keep `createServiceClient()` for storage upload only

---

### Auth

**17. `app/api/auth/me/route.ts`**
- Pattern: requireProfile + service for platform_role/permissions lookup on own profile
- Action: Replace with `await createClient()`
- Note: This is querying the current user's own profile/permissions — auth client is appropriate.

---

### Push Subscriptions

**18. `app/api/push/subscribe/route.ts`**
- Pattern: requireProfile + service + `.eq('user_id', profile.id)` on push_subscriptions
- Action: Replace with `await createClient()`
- Note: After PLAN-A adds `org_id` to push_subscriptions, ensure subscribe also writes `org_id`:
  ```typescript
  await supabase.from('push_subscriptions').upsert({
    user_id: profile.id,
    org_id: profile.org_id,   // ← add if PLAN-A migration is applied
    subscription: sub,
  })
  ```

---

### Vehicles (DB queries only)

**19. `app/api/vehicles/[id]/route.ts`**
- Line: 37
- Pattern: requireProfile + service + `.eq('user_id', org_id)` with comment "belt-and-suspenders"
- Action: Replace with `await createClient()` — RLS already enforces org scoping, so the belt-and-suspenders comment should be removed

**20. `app/api/vehicles/[id]/photos/[photoId]/route.ts`**
- Pattern: requireProfile + service + org-scoped vehicle ownership check
- Action: Replace DB query with `await createClient()`
- Note: If storage bucket signed URL generation is also in this file, keep service client for that operation only

**21. `app/api/vehicles/[id]/documents/[docId]/route.ts`**
- Pattern: requireProfile + service for DB query portion; service also used for storage signed URL
- Action: **Split pattern** — `await createClient()` for DB, keep `createServiceClient()` for storage signed URL

**22. `app/api/vehicles/[id]/ai-description/route.ts`**
- Line: 82
- Pattern: requireProfile + service + org-scoped on ai_descriptions
- Action: Replace DB query with `await createClient()`

**23. `app/api/vehicles/[id]/market-check/route.ts`**
- Line: 60
- Pattern: requireProfile + service + org-scoped on market_checks
- Action: Replace with `await createClient()`

---

### BHPH

**24. `app/api/bhph/create/route.ts`**
- Line: 24
- Pattern: requireProfile + service for BHPH contract writes
- Action: Replace DB queries with `await createClient()`
- Note: If there is a storage signing operation for BHPH contracts, keep service client for that only

---

## Verification

After converting all files:

```bash
cd /home/tim/Applications/ApolloCRM/apollo-crm
npx eslint \
  "app/api/support/**/*.ts" \
  "app/api/pulse/**/*.ts" \
  "app/api/sales/**/*.ts" \
  "app/api/onboarding/**/*.ts" \
  "app/api/email/**/*.ts" \
  "app/api/fax/send/**/*.ts" \
  "app/api/auth/me/**/*.ts" \
  "app/api/push/**/*.ts" \
  "app/api/vehicles/[id]/**/*.ts" \
  "app/api/bhph/create/**/*.ts" \
  --max-warnings=0
npm test
npm run build
```

All three must pass with zero errors.
