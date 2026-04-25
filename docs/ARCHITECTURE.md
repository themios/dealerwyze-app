# DealerWyze — Architecture Reference

Last updated: 2026-04-25. Update this file whenever a structural pattern changes.

---

## 1. Authentication & Session

DealerWyze uses **Supabase Auth** (email/password + magic link).

| Concept | Where |
|---------|-------|
| Session management | `@supabase/ssr` in `lib/supabase/` |
| Server-side client | `lib/supabase/server.ts` → `createClient()` |
| Service client (bypasses RLS) | `lib/supabase/service.ts` → `createServiceClient()` |
| Request-scoped client (SSR) | `lib/supabase/forRequest.ts` → `createClientForRequest()` |
| Profile fetch + auth guard | `lib/auth/profile.ts` → `requireProfile()` |
| Staff impersonation cookie | `lib/auth/staffSession.ts` |

**Rule:** All API routes call `requireProfile()` as the first line. This verifies the session, checks `deactivated_at`, and guarantees a non-null `org_id`. Do not skip it.

---

## 2. Route Guards (Middleware)

All route protection runs in `proxy.ts` (the Next.js middleware entry point).

Five layers in execution order:

1. **Impersonation block** — `isImpersonationBlocked()` — blocks mutations for read-only staff sessions
2. **Rate limiting** — `isRateLimited()` — sliding window on webhook/API routes; in-process Map (not shared across instances)
3. **Public path pass-through** — `isPublic()` — `/login`, `/signup`, `/lp/*`, `/_next/*`, dealer inventory pages, etc.
4. **Auth redirect** — unauthenticated users → `/login`; authenticated users on `/login` → `/today`
5. **Subscription gate** — `isAppRoute()` — canceled/trial-expired → `/settings/billing`; suspended → `/suspended`

**Role helpers** live in `lib/auth/dealerRoles.ts`:
- `isDealerAdmin(role)` — `dealer_admin` only
- `canAccessBhph(role)`, `canAccessLedger(role)`, `canAccessReports(role)`, etc.

**Platform admin helpers** live in `lib/auth/platform.ts`:
- `requirePlatformSuperAdmin(userId)` — returns a 403 response or null
- `requirePlatformArea(userId, area)` — granular platform permissions

Never check raw role strings like `profile.role === 'admin'`. Always use the helpers.

---

## 3. Business Logic Location

| Domain | Directory |
|--------|-----------|
| Cron job logic (one file per job) | `lib/cron/jobs/` |
| Cron auth validation | `lib/cron/validateCronAuth.ts` |
| Sequence enrollment + delivery | `lib/sequences/` |
| Retention / birthday / post-sale | `lib/retention/` |
| BHPH payment tokens + schedules | `lib/bhph/` |
| Pulse surveys (delivery, questions) | `lib/pulse/` |
| Theme system (presets, CSS vars) | `lib/theme/` |
| Video rendering + R2 upload | `lib/video/` |
| Social OAuth + posting | `lib/social/` |
| Webhook dispatch | `lib/webhooks/dispatch.ts` |
| Phone formatting | `lib/utils/phone.ts` |
| Relative time formatting | `lib/utils/relativeTime.ts` |
| API response helpers | `lib/api/respond.ts` → `apiError()`, `apiOk()` |
| Pulse score color | `lib/pulse/scoreColor.ts` |
| Lead parsers (CarGurus, AutoTrader) | `lib/leads/` |

**Rule:** Before writing a new utility function, grep `lib/` for it. Duplicates have caused full audit sessions to clean up.

---

## 4. API Route Patterns

### Standard org-scoped route

```typescript
import { requireProfile } from '@/lib/auth/profile'
import { apiError, apiOk } from '@/lib/api/respond'

export async function GET() {
  const profile = await requireProfile()
  // profile.org_id is guaranteed non-null
  // ...
  return apiOk({ data })
}
```

### Platform admin route

```typescript
const profile = await requireProfile()
const denied = await requirePlatformSuperAdmin(profile.id)
if (denied) return denied
// proceed with platform-level access
```

### org_settings write (never use upsert)

```typescript
// RLS blocks INSERT — always use .update()
await supabase.from('org_settings').update(payload).eq('org_id', profile.org_id)
```

### customers / activities table quirks

- `customers` has **no `org_id` column** — scoped via `user_id = profile.org_id`
- `activities` has **no `org_id` column** — insert only: `user_id`, `customer_id`, `vehicle_id`, `type`, `direction`, `body`, etc.
- Including `org_id` in either table's queries causes silent failure.

---

## 5. UI State Patterns

| Pattern | Where used |
|---------|-----------|
| Server Components (default) | All page.tsx files; no `'use client'` |
| Client islands | `*Client.tsx` suffix — e.g. `BhphRecordPayment`, `AutoresponderCard` |
| Loading skeletons | `loading.tsx` next to each page.tsx |
| Optimistic UI | Direct state mutation + SWR/fetch revalidation (no shared store) |
| Theme CSS vars | Injected server-side in `app/(app)/layout.tsx` via `<style>` tag |
| Font styles | CSS classes in `globals.css`: `.font-style-classic`, `.font-style-bold` |
| Analytics | `AnalyticsProvider` (client) in `app/layout.tsx` — fires `page_view` on route change |

---

## 6. Directory Layout

```
apollo-crm/
├── app/
│   ├── (app)/          ← Authenticated dealer app (all routes behind proxy.ts)
│   ├── (auth)/         ← Login, signup, password reset
│   ├── (public)/       ← Landing pages, inventory pages, pulse survey
│   ├── api/            ← All API routes
│   ├── lp/             ← Ad landing pages (/lp/dealerwyze-os, etc.)
│   └── layout.tsx      ← Root layout: fonts, gtag, ThemeProvider, AnalyticsProvider
├── components/
│   ├── layout/         ← TopBar, Sidebar, BottomNav
│   ├── providers/      ← AnalyticsProvider, FontSizeProvider
│   ├── settings/       ← Settings section components
│   ├── sequences/      ← AutoresponderCard, SequenceEditor, EnrollSheet
│   ├── landing/        ← All landing page section components
│   └── ui/             ← shadcn/ui primitives (do not edit directly)
├── lib/
│   ├── auth/           ← requireProfile, role helpers, staffSession
│   ├── supabase/       ← Client factories (server, service, forRequest)
│   ├── cron/           ← validateCronAuth + jobs/
│   ├── analytics/      ← gtag.ts (UTM capture, conversion, page_view)
│   └── ...             ← Domain logic (see table in section 3)
├── supabase/
│   └── migrations/     ← SQL migrations applied manually in Supabase dashboard
├── docs/
│   ├── ARCHITECTURE.md ← This file
│   └── superpowers/    ← Plans and specs (not production code)
├── proxy.ts            ← Next.js middleware (rate limiting, auth, subscription gate)
└── .env.example        ← All ~60 env vars with descriptions
```

---

## 7. Multi-tenant Isolation Rules

Every query must be scoped to `profile.org_id`. Never trust `org_id` from request body or URL params.

| Table | Scope column | Notes |
|-------|-------------|-------|
| vehicles, receipts, tasks, templates, etc. | `user_id = profile.org_id` | Standard |
| customers | `user_id = profile.org_id` | No `org_id` column |
| activities | `user_id = profile.org_id` | No `org_id` column |
| org_settings | `org_id = profile.org_id` | Always `.update()`, never `.upsert()` |
| profiles | `id = user.id` | Own profile only (except superadmin) |

Sentinel org UUID `00000000-0000-0000-0000-000000000001` is the platform staff home org. Never use it in dealer queries.

---

## 8. Deployment

```bash
# Staging
./deploy-staging.sh   # → apollo-crm.vercel.app

# Production
./deploy-prod.sh      # → dealerwyze.com (NO GitHub auto-deploy on prod)
```

Migrations are applied **manually** by Tim in the Supabase SQL editor. There is no migration runner in CI/CD.

Tests: `npm test` (Vitest, ~20 tests). Must pass before deploying.
