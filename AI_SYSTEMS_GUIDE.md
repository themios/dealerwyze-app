# Guide for External AI Systems (Cursor, Codex, Gemini, Claude)

**Updated:** 2026-06-08  
**Purpose:** Help external AI systems understand the codebase structure and architecture

---

## Quick Facts

| Aspect | Detail |
|--------|--------|
| **Product** | DealerWyze (dealers) + RealtyWyze (agents) — one codebase, two domains |
| **Stack** | Next.js 16, TypeScript, Tailwind, shadcn/ui, Supabase, Twilio, Stripe |
| **Repo** | https://github.com/themios/dealerwyze-app (main = prod, develop = staging) |
| **Deploy** | Vercel auto-deploys; use `./deploy-staging.sh` and `./deploy-prod.sh` scripts |
| **Status** | v1.1 hardening complete (2026-06-08) — rate limiting, SMS limiter, audit logging, vertical enforcement |
| **Multi-Tenant** | Every route must scope to authenticated org_id via `requireProfile()` |
| **Verticals** | Code routes by domain; backend enforces vertical isolation with 403 checks |

---

## For Cursor IDE Users

**.cursorrules file exists** at `/dealerwyze-app/.cursorrules`

This file tells Cursor:
- Project structure and critical architecture rules
- Multi-tenancy requirements (ALWAYS scope to org_id)
- Rate limiting behavior (fail-closed design)
- Vertical isolation rules
- Deployment workflows
- Testing requirements
- Common gotchas

**Cursor will read this file automatically.** No additional config needed.

---

## For OpenAI Codex / GPT Models

### Key Context for Code Generation

**Multi-Tenant Scoping:**
```typescript
// EVERY org-scoped route must do this:
const profile = await requireProfile()  // Get authenticated org
const { data } = await supabase
  .from('table')
  .select('*')
  .eq('org_id', profile.org_id)  // ALWAYS include this
```

**Rate Limiting (Fail-Closed):**
```typescript
// Before business logic, check rate limit
const limiter = await orgSmsLimiter(orgId)
if (!limiter.allowed) {
  return NextResponse.json(
    { error: 'Rate limit exceeded' },
    { status: 429 }  // NOT silent allow
  )
}
```

**Vertical Enforcement:**
```typescript
// For dealer-only features, check backend:
const { data: org } = await supabase
  .from('organizations')
  .select('vertical')
  .eq('id', orgId)

if (org.vertical !== 'dealer') {
  return NextResponse.json(
    { error: 'Not available for your vertical' },
    { status: 403 }  // Backend enforcement, not just UI
  )
}
```

**Audit Logging (High-Risk Actions):**
```typescript
// After successful mutation:
await writeAuditLog({
  orgId,
  actorId: profile.id,
  action: 'bulk_vehicle_import',
  source: 'csv',  // paste | csv | auction
  entityType: 'vehicle',
  metadata: { ... }
})
```

### When Generating Code

1. **Always include org scoping** — Every query must filter by org_id
2. **Fail-closed on rate limits** — Return 429, never silent allow
3. **Enforce verticals in backend** — Not just UI gating
4. **Log high-risk actions** — Impersonation, payments, exports, settings
5. **Test on both verticals** — Code must work for dealers AND agents
6. **Verify no secrets in code** — All keys in Vercel env vars only

---

## For Google Gemini

### Vision/Parsing Tasks

**Monroney Extract (VIN from photos):**
- File: `app/api/vehicles/intake/monroney-extract/route.ts`
- Gemini extracts VIN from Monroney label photos
- Backend enforces vertical check (dealers only, 403 for agents)
- Uses `aiComplete()` from `lib/ai/client.ts` (NOT direct Gemini API)

**Receipt OCR (for BHPH):**
- Uses Gemini for vision parsing of receipt images
- Returns extracted data (amount, date, vehicle info)
- Always validate extracted data before database write

### Configuration

- **Model:** Use Gemini 2.5 via OpenRouter (see `lib/ai/client.ts`)
- **Never:** Use Opus for vision tasks (too expensive) — Gemini or Claude Haiku
- **Always:** Use `aiComplete()` helper, not direct API calls

---

## For Claude API Users (Including This Agent)

### Key Instructions

1. **Read .cursorrules first** — Context about project structure
2. **Check DEPLOY.md** — Before any deployment changes
3. **Verify multi-tenancy** — Every route touches org_id
4. **Test staging first** — Never deploy to production without staging test
5. **Use helper functions** — `requireProfile()`, `createClient()`, `writeAuditLog()`
6. **Read memory system** — For architecture decisions and why they were made

### Common Claude Tasks

**Code Review:**
- Check: Is org_id scoped? Is rate limit checked? Is vertical enforced?
- Check: Any secrets in code? Any silent-allow fallbacks?
- Check: Tests written? Build verified?

**New Feature:**
- Branch from develop, not main
- Test locally first (`npm run dev && npm test`)
- Deploy to staging (`./deploy-staging.sh`)
- Test on staging.dealerwyze.com
- Create PR develop → main
- Deploy to production (`./deploy-prod.sh`)

**Bug Triage:**
- Check Sentry for error context
- Check Vercel logs for deployment issues
- Check Supabase logs for database errors
- Verify issue reproduces on staging first

---

## Directory Map for AI Systems

```
dealerwyze-app/
│
├── app/
│   ├── api/                          # All API routes (ALWAYS org-scoped)
│   │   ├── vehicles/
│   │   │   ├── import/              # CSV import (dealer-only, rate-limited)
│   │   │   └── intake/
│   │   │       └── monroney-extract/ # Vision-parsed VIN (dealer-only)
│   │   ├── settings/
│   │   │   └── data-export/         # Paginated exports (10k rows/page)
│   │   ├── cron/                    # Background jobs (service-role)
│   │   ├── auth/                    # Authentication (public)
│   │   └── webhooks/                # Twilio, Stripe, etc. (service-role)
│   │
│   ├── (dealer)/                    # Dealer-specific UI pages
│   │   ├── dashboard/
│   │   ├── customers/
│   │   ├── vehicles/
│   │   └── settings/
│   │
│   └── (realtor)/                   # Real estate agent UI pages
│       ├── dashboard/
│       ├── prospects/
│       ├── properties/
│       └── settings/
│
├── lib/
│   ├── auth/
│   │   ├── profile.ts               # requireProfile() — always use this
│   │   ├── dealerRoles.ts           # Role helpers
│   │   └── platform.ts              # Platform admin checks
│   │
│   ├── supabase/
│   │   ├── server.ts                # createClient() (RLS enforced)
│   │   ├── admin.ts                 # createServiceClient() (service-role)
│   │   └── forRequest.ts            # createClientForRequest() (impersonation)
│   │
│   ├── rateLimit/
│   │   └── upstash.ts               # Rate limiters (fail-closed design)
│   │
│   ├── sms/
│   │   └── sendOutbound.ts          # Twilio SMS (checks orgSmsLimiter)
│   │
│   ├── audit/
│   │   └── log.ts                   # writeAuditLog() (append-only)
│   │
│   ├── ai/
│   │   └── client.ts                # aiComplete() (use this, not direct API)
│   │
│   ├── vehicles/
│   │   ├── bulkImporter.ts          # Vehicle import logic
│   │   └── extractionTypes.ts       # Monroney extraction types
│   │
│   └── properties/                  # Real estate property logic
│       └── ...
│
├── supabase/
│   ├── migrations/                  # Database schema changes
│   └── rls/                         # Row-level security policies
│
├── components/                      # Reusable UI components
│   └── (shadcn/ui + custom)
│
├── .cursorrules                     # Cursor IDE configuration
├── DEPLOY.md                        # Deployment workflows
├── GIT_STRUCTURE.md                 # Git & Vercel setup
└── STAGING_PRODUCTION_SETUP.md      # Environment reference
```

---

## Critical Files for Different Tools

### For Cursor
- `.cursorrules` — Architecture and rules

### For Code Generation (Codex, Claude, GPT)
- `lib/auth/profile.ts` — How to get org_id
- `lib/rateLimit/upstash.ts` — Rate limit patterns
- `lib/audit/log.ts` — Audit logging patterns
- `app/api/vehicles/import/route.ts` — Complete example (with all patterns)

### For Vision Tasks (Gemini)
- `app/api/vehicles/intake/monroney-extract/route.ts` — VIN extraction
- `lib/ai/client.ts` — How to call Gemini via `aiComplete()`

### For Deployment (Any CI/CD)
- `DEPLOY.md` — Workflows and scripts
- `./deploy-staging.sh` — Staging deployment
- `./deploy-prod.sh` — Production deployment (requires confirmations)

### For Architecture Understanding
- `GIT_STRUCTURE.md` — Repo layout
- Memory system: `/home/tim/.claude/projects/.../memory/`
  - `structure-c-migration-complete.md` — Why the current structure
  - `workflow_staging_to_production.md` — Development flow
  - `feedback_structure-c-lessons.md` — Architectural lessons

---

## Environment Setup

### Local Development
```bash
git clone https://github.com/themios/dealerwyze-app.git
cd dealerwyze-app
npm install
npm run dev        # http://localhost:3000
npm test           # Unit tests
npm run build      # Production build
```

### Staging Deployment
```bash
./deploy-staging.sh  # Deploys develop to staging.dealerwyze.com
```

### Production Deployment
```bash
./deploy-prod.sh     # Deploys main to dealerwyze.com + realtywyze.us
```

---

## Testing Checklist for AI Systems

Before suggesting code changes:
- ✅ Does it scope to org_id?
- ✅ Is rate limiting checked (if applicable)?
- ✅ Is vertical enforced in backend (if feature is vertical-specific)?
- ✅ Is high-risk action logged (if applicable)?
- ✅ Does it work for BOTH verticals?
- ✅ Are there tests?
- ✅ Does it pass TypeScript & ESLint?
- ✅ Did you test on staging first?

---

## Emergency / Rollback

**Production Issue:**
1. Check Sentry: https://sentry.io/...
2. Check Vercel: https://vercel.com/apollo-projects/dealer-wyze/deployments
3. Rollback: Find previous working deployment → "Promote to Production"

**Staging Issue:**
1. Check Vercel: https://vercel.com/apollo-projects/dealer-wyze-staging/deployments
2. Redeploy: `git checkout develop && git pull && ./deploy-staging.sh`

---

**This guide helps external AI systems understand the codebase structure, architecture, and deployment process. Reference this when working with the codebase.** ✅
