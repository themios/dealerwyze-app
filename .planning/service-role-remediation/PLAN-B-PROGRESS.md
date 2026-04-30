# PLAN-B progress notes — Sequences & settings service-role remediation

**Started:** 2026-04-29  
**Owner:** Cursor agent session

## Goals (from PLAN-B-sequences-settings.md)

- Replace `createServiceClient()` with `await createClient()` wherever `requireProfile()` is used and DB access is org-scoped (RLS).
- Preserve service client only for storage / legitimate bypass cases.

## Verification commands (run after edits)

```bash
cd /home/tim/Applications/ApolloCRM/apollo-crm
npx eslint "app/api/sequences/**/*.ts" "app/api/settings/**/*.ts" "app/api/retention/**/*.ts" "app/api/pipeline-stages/**/*.ts" "app/api/segments/**/*.ts" "lib/sequences/seedStarterSequences.ts" "app/api/onboarding/step/route.ts" "app/api/settings/automation/route.ts" --max-warnings=0
npm test
npm run build
```

## Log

### 2026-04-29 — Discovery

- **Already converted to auth client:**  
  `sequences/[id]/route.ts`, `sequences/route.ts`, `sequences/[id]/steps/route.ts`, `sequences/[id]/steps/[stepId]/route.ts`, `settings/org`, `appearance`, `pulse`, `video`, `webhooks`, `retention/settings`, `retention/referrals`, `pipeline-stages`, `segments`.
- **Remaining gaps identified:**
  1. `app/api/sequences/seed-starters/route.ts` — still `createServiceClient()`.
  2. `lib/sequences/seedStarterSequences.ts` — uses service client for all inserts; called from seed-starters **and** `app/api/onboarding/step/route.ts`. Refactor to **require** an RLS-scoped `SupabaseClient` passed from callers so inserts run as the signed-in user (same org as `get_org_id()`).
  3. `app/api/settings/automation/route.ts` — `serviceSupa` used only to validate `sequences` rows before PATCH. Policy `sequences_org` uses `org_id = get_org_id()`; auth client is sufficient. Remove service client and update comment.

### 2026-04-29 — Implementation (done)

- Refactored `seedStarterSequences(orgId, supabase)` with `SupabaseClient` from `@supabase/supabase-js`.
- Updated `seed-starters/route.ts`, `onboarding/step/route.ts` to use `await createClient()` and pass client into seed helper.
- `onboarding/step` org_settings update now uses auth client only (no service role on this route).
- `settings/automation` PATCH: sequence FK validation uses same `supabase` as org_settings update; removed `createServiceClient`.

### QA / security checklist

- [x] Starter seed path unchanged logically (count check + `seedStarterSequences` inserts under RLS).
- [x] Onboarding completion still updates step + `onboarding_completed_at` and fires non-blocking seed with shared request client.
- [x] Non-admin PATCH automation still gated by `isDealerAdmin` (unchanged).
- [x] `npx eslint` (scoped files) + `npm test` + `npm run build` — all passed (2026-04-29).

---

## Implementation spec (apply in Agent mode or by hand)

**Blocked:** Cursor was in Plan mode; code edits require **Agent** mode. Below is the full mechanical change list.

### 1. `lib/sequences/seedStarterSequences.ts`

- Remove `import { createServiceClient } from '@/lib/supabase/service'`.
- Add `import type { SupabaseClient } from '@supabase/supabase-js'`.
- Update docblock: callers must pass RLS-scoped client (no service role).
- Change signature to `export async function seedStarterSequences(orgId: string, supabase: SupabaseClient): Promise<number>` and delete the internal `createServiceClient()` line (use the parameter for all `.from()` calls).

### 2. `app/api/sequences/seed-starters/route.ts`

- Replace `createServiceClient` import with `import { createClient } from '@/lib/supabase/server'`.
- After `requireProfile()`: `const supabase = await createClient()`.
- Use `supabase` for the count query on `sequences`.
- Call `seedStarterSequences(profile.org_id, supabase)` (add second arg).

### 3. `app/api/onboarding/step/route.ts`

- Replace `createServiceClient` with `import { createClient } from '@/lib/supabase/server'`.
- After `requireProfile()`: `const supabase = await createClient()`.
- Use `supabase` for `org_settings` update (same `.eq('org_id', profile.org_id)`).
- Change fire-and-forget to: `seedStarterSequences(profile.org_id, supabase).catch(() => {})`.

### 4. `app/api/settings/automation/route.ts`

- Remove `createServiceClient` import and `serviceSupa` variable.
- In PATCH, use existing `supabase` for both `sequences` validation queries (`.eq('id', …).eq('org_id', profile.org_id)` unchanged).
- Delete the comment about bypassing RLS for FK validation (incorrect given `sequences_org` policy).

### 5. After edits

Run the verification commands at the top of this file; mark QA checkboxes when green.

### Plan-B status summary

| File | Status (2026-04-29 discovery) |
|------|-------------------------------|
| All other PLAN-B routes | Already using `await createClient()` |
| `seed-starters/route.ts` | Needs conversion + pass client into lib |
| `seedStarterSequences.ts` | Needs auth client parameter |
| `onboarding/step/route.ts` | Out-of-PLAN-B list but **required** once lib signature changes |
| `settings/automation/route.ts` | Remove redundant `serviceSupa` |
