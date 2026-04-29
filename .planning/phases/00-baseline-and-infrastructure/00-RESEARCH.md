# Phase 0: Baseline & Infrastructure - Research

**Researched:** 2026-04-28
**Domain:** Vitest configuration, ESLint triage, service-role audit methodology
**Confidence:** HIGH — all findings from direct codebase inspection

---

## Summary

Phase 0 is almost entirely infrastructure that already exists. Vitest 4.1.5 is installed
and configured, `npm test` passes 38 tests across 4 files, and the test runner works today
without any setup work. The `vitest.config.ts` is correct for Next.js App Router + Supabase
using mock-based testing (no local Supabase instance needed or used). ESLint is wired but
has 266 problems — only 12 are auto-fixable, so `--fix` is low-risk and low-yield. The
remaining 254 problems are correctness issues (`no-unused-vars`, `no-explicit-any`,
`react-hooks/*`) that require human decisions, not automation.

The service-role audit is the substantive work. Grep counts 619 lines matching
`createServiceClient` or `createClientForRequest` across app/ and lib/. The actual unique
call-site count is lower (multiple matches per file for imports + usages), but still large.
Three clear categories emerge from sampling: legitimate (cron, storage, webhooks, admin
impersonation), reducible (org-scoped API handlers that call `requireProfile()` and then
also use service client), and wrong/needs-review (lib utilities that construct their own
service client internally rather than accepting a pre-scoped client).

**Primary recommendation:** Start with the service-role audit (it drives Phase 2 scope),
then run `eslint --fix` (12 auto-fixes, verify build), then add one smoke test confirming
the existing passing setup.

---

## Standard Stack

### Already Installed and Configured

| Package | Version | Purpose | Status |
|---------|---------|---------|--------|
| vitest | ^4.1.5 | Test runner | Installed, configured, passing |
| @vitejs/plugin-react | ^6.0.1 | React JSX transform for tests | Installed |
| jsdom | ^29.0.2 | DOM environment (available if needed) | Installed |
| eslint | ^9 | Linter | Installed |
| eslint-config-next | 16.2.4 | Next.js lint rules | Installed |

### Nothing to Install for TEST-01 or TEST-02

The test runner is already working. `vitest.config.ts` already exists and is correct:
- `environment: 'node'` — correct for server-side Supabase code
- `globals: true` — vitest globals available without imports
- `@` alias resolved to project root
- Pattern: `**/__tests__/**/*.test.ts` matches existing files

The existing test approach uses vi.mock() for all Supabase calls. No local Supabase
instance, no test project, no `@supabase/test-helpers` package needed. The pattern in
`security.test.ts` is the established model: pass a typed mock object that satisfies the
SupabaseClient interface shape.

---

## Architecture Patterns

### Existing Test Pattern (from security.test.ts)

```typescript
// Mock server-only and any env-dependent modules first
vi.mock('server-only', () => ({}))
vi.mock('@/lib/stripe', () => ({ STORAGE_BASE_QUOTA: 500 * 1024 * 1024, stripe: {} }))

// Then import the module under test
import { getOrgStorageQuota } from '@/lib/storage/quota'

// Build typed mock that satisfies the function's expected client shape
function makeMockSupabase(overrides = {}) {
  const from = vi.fn((table: string) => { /* return per-table mock */ })
  return { from } as unknown as Parameters<typeof getOrgStorageQuota>[0]
}
```

This is the established pattern. The `testClient.ts` helper for TEST-02 should follow
it: export a function that returns a typed mock Supabase client scoped to a fixed test
org_id, so individual tests don't have to rebuild the mock boilerplate.

### Recommended testClient.ts Pattern

```typescript
// lib/__tests__/helpers/testClient.ts
import { vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

export const TEST_ORG_ID = 'test-org-00000000'

export function makeTestClient(
  tableHandlers: Record<string, unknown> = {}
): SupabaseClient {
  const from = vi.fn((table: string) => {
    if (tableHandlers[table]) return tableHandlers[table]
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
    }
  })
  return { from } as unknown as SupabaseClient
}
```

Note: No real Supabase URL or service key needed. No `.env.test` file needed for unit
tests using this approach.

### vitest.config.ts — Current State (Already Correct)

```typescript
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
    exclude: ['node_modules/**', '.next/**'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
```

No changes needed to vitest.config.ts for Phase 0.

---

## Service-Role Audit — Category Framework

### Raw Numbers

- Total grep hits: 619 lines (includes import lines + usage lines)
- `createServiceClient` hits: 555
- `createClientForRequest` hits: 64
- Files that import either: substantially fewer than 619 (each file shows 2+ hits)

### Three Categories

**LEGITIMATE — Do Not Change**

These are architecturally correct uses of the service client:

1. **Cron routes** (`app/api/cron/*`) — All cron jobs use service client. Correct: cron
   runs without a user session. Every cron route has `validateCronAuth()` and then queries
   across all orgs or handles system-level operations.

2. **Storage operations** (`vehicles/[id]/photos`, `vehicles/[id]/documents`, `media/upload`)
   — Service client used specifically to sign storage URLs or perform storage operations
   that require bypassing RLS. The variable is typically named `storage` or `service`.

3. **Inbound webhooks** (`twilio/inbound`, `stripe/webhook`, `telegram/webhook`) — No user
   session available; must use service client. Twilio routes validate signature first.

4. **Admin impersonation** (`admin/impersonate`) — Explicitly requires service client to
   create sessions on behalf of other users. Correct.

5. **Platform admin routes** (`admin/alerts`, `admin/tickets`, `admin/transfers`) — All
   call `requirePlatformSuperAdmin()` before querying. Service client appropriate here.

6. **lib/sms/* utilities** — These receive phone/org context from callers (no user session
   available at the point SMS is sent outbound). Service client used to write sms_log,
   check quota, etc. Legitimate but worth noting quota.ts creates 6+ service clients.

**REDUCIBLE — Could Use Auth Client**

Pattern: handler calls `requireProfile()` (has user session) AND then creates service
client for data reads/writes that are already explicitly scoped with `.eq('org_id', profile.org_id)`.

Examples from sampling:
- `app/api/sequences/[id]/route.ts` — calls `requireProfile()`, then service client, but
  all queries have `.eq('org_id', profile.org_id)`. An auth client with RLS would be
  sufficient.
- `app/api/retention/settings/route.ts` — same pattern: `requireProfile()` + service
  client + `.eq('org_id', profile.org_id)`.
- `app/api/settings/pulse/route.ts` — same.
- `app/api/settings/webhooks/route.ts` — same.

These are not bugs, but they're unnecessarily privileged. RLS would enforce the filter
automatically. Estimated: ~40-60% of the non-cron, non-storage, non-webhook usages fall
here.

**WRONG / NEEDS REVIEW — Highest Risk**

Pattern: service client used but no explicit org scoping visible, OR the function is a
lib utility that builds its own service client without receiving org context as a parameter.

Examples:
- `lib/vehicles/matchWants.ts` — creates service client internally; need to verify it
  scopes queries by org.
- `lib/leads/ingest.ts` — creates service client; lead ingestion is often cross-org
  (multiple orgs can receive the same lead form); need to verify isolation.
- `lib/billing/assertFeature.ts` — creates service client at line 77; depends on what
  org_id it uses.
- `forRequest.ts` — the key concern: when staff impersonation is active, ALL requests
  through `createClientForRequest()` get full service-role access. The comment says
  "All queries MUST explicitly scope by org_id" but this is enforced by convention, not
  by code.

---

## forRequest.ts — The Impersonation Flow

```typescript
export async function createClientForRequest() {
  const jar = await cookies()
  if (getStaffSessionInfo(jar)?.orgId) return createServiceClient()
  return createClient()
}
```

**What it does:** If a valid staff impersonation cookie exists (signed with
`STAFF_SESSION_SECRET`), return full service-role client. Otherwise return the normal
RLS-enforced auth client.

**Risk profile:** 64 usages of `createClientForRequest`. In normal user sessions, these
are RLS-enforced (correct). In staff impersonation sessions, they become service-role
clients. This is intentional for staff to access tenant data, but it means every route
using `createClientForRequest` has dual behavior. Routes that use it but don't explicitly
scope by org_id are potentially over-privileged during staff sessions.

**For the triage:** `createClientForRequest` usages should be categorized separately
from direct `createServiceClient` — they're conditionally privileged, not always
privileged.

---

## ESLint — Current State

### Totals
```
266 problems (151 errors, 115 warnings)
9 errors and 3 warnings potentially fixable with --fix
```

### Auto-fixable: 12 total (9 errors + 3 warnings)
The `--fix` flag will touch 12 issues. This is low-risk. The fixable issues are typically
minor formatting or import ordering corrections that the linter knows are safe to rewrite.

### Non-fixable by rule type

| Rule | Count | Type | Notes |
|------|-------|------|-------|
| `@typescript-eslint/no-unused-vars` | 99 | warning/error | Require human decision — delete or prefix with _ |
| `@typescript-eslint/no-explicit-any` | 53 | error | Require typing — cannot be auto-fixed |
| `react-hooks/set-state-in-effect` | 29 | error | Pattern: `useEffect(() => { load() }, [dep])` calling setState indirectly |
| `react-hooks/purity` | 18 | error | Mutations or async inside render |
| `react-hooks/exhaustive-deps` | 5 | warning | Missing deps in hook arrays |
| `react-hooks/rules-of-hooks` | 3 | error | Conditional hook calls |
| `next/no-unescaped-entities` | 20 | error | Unescaped `'` or `"` in JSX |
| `@typescript-eslint/no-unused-expressions` | 1 | error | |

### Risk Assessment for --fix

Running `eslint --fix` is safe. It will change at most 12 lines. The 254 non-fixable
problems are left intact. The build should continue to pass after `--fix` because:
- Next.js build does not fail on ESLint errors by default (it runs lint as a separate step)
- The 12 auto-fixable issues are by definition safe transformations
- Verify with `next build` or `npx tsc --noEmit` after running --fix

**Do not use --fix as a way to hide the 254 non-fixable errors.** They are real issues
that need Phase-by-phase resolution. This phase only clears the auto-fixable noise.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Typed Supabase mock | Custom mock factory per test | Shared `makeTestClient()` helper in `lib/__tests__/helpers/` | DRY; existing security.test.ts already shows the pattern |
| Test org isolation | Real Supabase test project | `TEST_ORG_ID` constant + mock | No network, no seed/teardown, fast |
| Auto-fix lint | Manual line edits | `eslint --fix` | 12 safe rewrites in one command |
| Service-role grep | Manual file review | `grep -rn` piped to file | 619 hits, scripted triage is faster |

---

## Common Pitfalls

### Pitfall 1: Confusing grep hit count with unique call site count

619 grep hits != 619 unique usages. Each file that imports `createServiceClient` generates
one import hit plus N usage hits. The real count of unique call sites is probably 200-280.
The triage should de-duplicate by file and call site, not raw grep line count.

### Pitfall 2: Running eslint --fix and assuming lint is clean

After `--fix`, the output will still show 254+ problems. This is expected. The task is only
to clear auto-fixable noise, not resolve all lint. Record the before/after numbers.

### Pitfall 3: Assuming vitest needs more setup

The test runner works today. `npm test` passes 38 tests in 394ms. Do not install additional
packages, do not add `@testing-library/react`, do not add `supabase-js` test helpers. The
existing mock-based approach is intentional and appropriate for this server-focused codebase.

### Pitfall 4: Misclassifying reducible usages as wrong

A route that calls `requireProfile()` and then uses service client with `.eq('org_id', profile.org_id)` is not broken — it's just over-privileged. These should be classified
"reducible", not "wrong". Wrong means missing org scoping entirely.

### Pitfall 5: Not accounting for createClientForRequest dual behavior

`createClientForRequest` is sometimes an auth client (normal sessions) and sometimes
service-role (staff impersonation). Routes using it cannot be assumed to always be
RLS-protected. This category needs its own column in the triage output.

---

## Code Examples

### Smoke test for TEST-01 (one passing test confirming runner works)

```typescript
// lib/__tests__/smoke.test.ts
import { describe, it, expect } from 'vitest'

describe('test runner', () => {
  it('vitest is running', () => {
    expect(1 + 1).toBe(2)
  })
})
```

This is intentionally trivial. The value is confirming the config path resolves, globals
work, and `npm test` exits 0.

### Triage grep command for the audit

```bash
grep -rn "createServiceClient\|createClientForRequest" \
  app/ lib/ \
  --include="*.ts" --include="*.tsx" \
  | grep -v node_modules \
  | grep -v "^.*:.*import " \
  > .planning/service-role-triage-raw.txt
```

Pipe through `| grep -v "import "` to exclude import lines, leaving only actual call sites.
Then classify each line into LEGITIMATE / REDUCIBLE / WRONG.

### Triage output format for service-role-triage.md

```markdown
## Summary
- Total call sites: N
- Legitimate: N
- Reducible: N
- Wrong: N
- createClientForRequest (conditional): N

## Legitimate
| File | Line | Reason |
|------|------|--------|
| app/api/cron/... | 37 | cron — no user session |

## Reducible
| File | Line | Current Pattern | Recommended |
|------|------|-----------------|-------------|
| app/api/sequences/[id]/route.ts | 10 | service client + explicit org_id filter | auth client |

## Wrong
| File | Line | Issue |
|------|------|-------|
| ... | ... | ... |
```

---

## Open Questions

1. **lib/sms/quota.ts creates 6 service clients per invocation**
   - What we know: 6 calls at lines 140, 145, 151, 158, 223, 284 — all in the same file
   - What's unclear: whether these could be consolidated to one client instance
   - Recommendation: Flag in triage as "reducible (internal consolidation)" — low risk but
     worth noting as a pattern

2. **forRequest.ts — should it ever downgrade to auth client for staff?**
   - What we know: current behavior upgrades ALL impersonated requests to service-role
   - What's unclear: whether narrower scoping (RLS + org override via SET LOCAL) is feasible
   - Recommendation: Document current behavior in triage, defer decision to Phase 2

3. **lib/leads/ingest.ts — multi-org lead routing**
   - What we know: lead ingestion may be legitimately cross-org (lead goes to matching orgs)
   - What's unclear: whether service client here is needed for cross-org reads or just legacy
   - Recommendation: Mark as "needs review" in triage, investigate in Phase 2

---

## Sources

### Primary (HIGH confidence — direct codebase inspection)
- `/home/tim/Applications/ApolloCRM/apollo-crm/lib/supabase/service.ts` — service client impl
- `/home/tim/Applications/ApolloCRM/apollo-crm/lib/supabase/server.ts` — auth client impl
- `/home/tim/Applications/ApolloCRM/apollo-crm/lib/supabase/forRequest.ts` — impersonation logic
- `/home/tim/Applications/ApolloCRM/apollo-crm/lib/auth/profile.ts` — requireProfile() impl
- `/home/tim/Applications/ApolloCRM/apollo-crm/lib/__tests__/security.test.ts` — existing test pattern
- `/home/tim/Applications/ApolloCRM/apollo-crm/vitest.config.ts` — confirmed correct config
- `/home/tim/Applications/ApolloCRM/apollo-crm/package.json` — confirmed vitest 4.1.5 installed
- `/home/tim/Applications/ApolloCRM/apollo-crm/eslint.config.mjs` — ESLint config
- `npm test` run — confirmed 38 tests passing, 394ms

### Secondary (HIGH confidence — direct command output)
- `grep -rn createServiceClient|createClientForRequest` — 619 lines, 555/64 split
- `npx eslint app components hooks lib` — 266 problems, 12 auto-fixable
- Lint rule breakdown: 99 no-unused-vars, 53 no-explicit-any, 29 set-state-in-effect, 20 no-unescaped-entities

---

## Metadata

**Confidence breakdown:**
- Test runner status: HIGH — ran it, it passes
- Vitest config: HIGH — read the file, correct
- ESLint numbers: HIGH — ran the linter, got counts
- Service-role categories: HIGH — sampled ~15 files, patterns are clear
- forRequest.ts behavior: HIGH — read the source

**Research date:** 2026-04-28
**Valid until:** Stable for 90+ days (infrastructure research, no external dependencies changing)
