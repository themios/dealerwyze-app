# PLAN-B — Reducible: Sequences & Settings API Routes

**Agent:** Any (Claude, Codex, Gemini, Cursor)
**Risk:** Low — mechanical conversion, RLS enforces correctness
**Parallelizable with:** PLAN-A, PLAN-C, PLAN-D, PLAN-E (no file overlap)

---

## Context

These routes all call `requireProfile()` first, then use `createServiceClient()` with explicit org filters.
Converting to `createClient()` (auth-scoped) removes the over-privileged client while RLS enforces the same scoping automatically.

Working directory: `/home/tim/Applications/Wyze/wyze-app/`

**IMPORTANT:** Some of these files may already be converted (Phase 2 did the Top 20). Check each file before editing — if it already uses `createClient()`, skip it.

---

## Mechanical Conversion Pattern

**Before:**
```typescript
import { createServiceClient } from '@/lib/supabase/service'
// ...
const supabase = createServiceClient()
```

**After:**
```typescript
import { createClient } from '@/lib/supabase/server'
// ...
const supabase = await createClient()
```

- `createClient()` is async — always `await` it.
- Remove unused `createServiceClient` import.
- Do NOT change any storage operations in the same file — those still need service client.

---

## Files to Convert

### Sequences

**1. `app/api/sequences/[id]/route.ts`**
- Lines: 10, 33, 75 (three separate handler functions — GET, PATCH, DELETE)
- Pattern: requireProfile + service + `.eq('org_id', org_id)`
- Action: Replace all three `createServiceClient()` calls with `await createClient()`
- Note: Can use a single `const supabase = await createClient()` at the top if the file structure allows

**2. `app/api/sequences/route.ts`**
- Lines: 7, 22 (list and create handlers)
- Pattern: requireProfile + service + `.eq('org_id', org_id)`
- Action: Replace both calls with `await createClient()`

**3. `app/api/sequences/[id]/steps/route.ts`**
- Lines: 10, 33
- Pattern: requireProfile + service + org-scoped sequence ownership check
- Action: Replace with `await createClient()`

**4. `app/api/sequences/[id]/steps/[stepId]/route.ts`**
- Lines: 10, 58
- Pattern: requireProfile + service + org-scoped sequence check
- Action: Replace with `await createClient()`

**5. `app/api/sequences/seed-starters/route.ts`**
- Line: 14
- Pattern: requireProfile + service + `.eq('org_id', org_id)`
- Action: Replace with `await createClient()`

---

### Settings

**6. `app/api/settings/org/route.ts`**
- Lines: 8, 62
- Pattern: requireProfile + service + `.eq('id', org_id)` on organizations, `.eq('org_id', org_id)` on org_settings and org_google_tokens
- Action: Replace with `await createClient()`
- Note: RLS on all three tables should be org-scoped; verify RLS exists before converting

**7. `app/api/settings/appearance/route.ts`**
- Lines: 21, 45
- Pattern: requireProfile + service + `.eq('org_id', org_id)` on org_settings
- Action: Replace with `await createClient()`

**8. `app/api/settings/pulse/route.ts`**
- Lines: 10, 50
- Pattern: requireProfile + service + `.eq('org_id', org_id)` on org_settings
- Action: Replace with `await createClient()`

**9. `app/api/settings/video/route.ts`**
- Lines: 9, 53
- Pattern: requireProfile + service + `.eq('org_id', org_id)` on org_video_settings
- Action: Replace DB queries with `await createClient()`
- **Exception:** If there is a `video_templates` query in this file with NO org_id filter (global catalog table), leave that specific query using service client. All other queries → auth client.

**10. `app/api/settings/webhooks/route.ts`**
- Lines: 15, 54, 83
- Pattern: requireProfile + service + `.eq('org_id', org_id)` on org_webhooks
- Action: Replace all three with `await createClient()`

**11. `app/api/settings/automation/route.ts`**
- Pattern: requireProfile + service + `.eq('org_id', org_id)` on automation settings table
- Action: Replace with `await createClient()`

---

### Retention

**12. `app/api/retention/settings/route.ts`**
- Lines: 16, 33
- Pattern: requireProfile + service + `.eq('org_id', org_id)` on retention_settings
- Action: Replace with `await createClient()`

**13. `app/api/retention/referrals/route.ts`**
- Line: 17
- Pattern: requireProfile + service + `.eq('user_id', org_id)` on customers
- Action: Replace with `await createClient()`

---

### Pipeline & Segments

**14. `app/api/pipeline-stages/route.ts`**
- Lines: 6, 10
- Pattern: requireProfile + service + `.eq('org_id', org_id)` on org_pipeline_stages
- Action: Replace with `await createClient()`

**15. `app/api/segments/route.ts`**
- Lines: 10, 22
- Pattern: requireProfile + service + `.eq('org_id', org_id)` on saved_segments
- Action: Replace with `await createClient()`

---

## Verification

After converting all files:

```bash
cd /home/tim/Applications/ApolloCRM/apollo-crm
npx eslint "app/api/sequences/**/*.ts" "app/api/settings/**/*.ts" "app/api/retention/**/*.ts" "app/api/pipeline-stages/**/*.ts" "app/api/segments/**/*.ts" --max-warnings=0
npm test
npm run build
```

All three must pass with zero errors.
