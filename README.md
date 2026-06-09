# DealerWyze CRM

Multi-tenant SaaS CRM for used-car dealerships. Handles leads, texting, email, voice AI, BHPH payments, inventory, receipts, customer retention, and reporting.

**Brand:** DealerWyze | **Domain:** dealerwyze.com | **Staging:** staging.dealerwyze.com  
**Test tenant:** Apollo Auto (El Monte CA) — slug: `apollo-auto`

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind v4, shadcn/ui |
| Backend | Supabase (Postgres + Auth + RLS + Storage) |
| Messaging | Twilio (SMS/MMS/fax/voice SIP) |
| Voice AI | Retell AI (inbound voice agent) |
| Billing | Stripe (subscriptions + usage overage) |
| AI | Anthropic (receipt OCR, voice summarizer), Groq (Dealer Brief) |
| Video | Remotion Lambda + Cloudflare R2 |
| Social | Facebook/Instagram/TikTok/YouTube posting |
| Deploy | Vercel (manual — see Deployment below) |

---

## Local Development

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env.local
```

Fill in the values in `.env.local`. At minimum you need the Supabase vars to start the app locally. See the comments in `.env.example` for what each var does.

### 3. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 4. Database

Migrations live in `supabase/migrations/`. They are applied manually in the Supabase SQL editor — there is no CLI migration runner configured.

The app uses Row Level Security (RLS) on all tables. The `public.get_org_id()` SECURITY DEFINER function is the backbone of all RLS policies.

---

## Project Structure

```
app/
  (app)/          # Authenticated dealer app (all routes require login)
  (onboarding)/   # New dealer setup flow
  api/            # API routes
  blog/           # Marketing blog
  pulse/[token]/  # Public customer survey (no auth)
  pay/[token]/    # Public BHPH payment page (no auth)
  book/[slug]/    # Public appointment booking (no auth)

components/
  ui/             # shadcn/ui primitives
  layout/         # TopBar, nav, shells
  customer/       # Customer list, detail, merge
  vehicle/        # Vehicle cards, mark-sold sheet
  today/          # Today queue items
  landing/        # Marketing landing page + section components
  sequences/      # Autoresponder UI

lib/
  auth/           # requireProfile(), role helpers, staff impersonation
  cron/           # Cron job runners (jobs/ subdirectory has one file per job)
  leads/          # Lead parsers and ingest
  pulse/          # Customer pulse survey logic
  sequences/      # Sequence enrollment and delivery
  supabase/       # Supabase client factories
  utils/          # Shared utilities (phone, formatting)
  ...             # One directory per external service (twilio, stripe, gmail, etc.)

supabase/
  migrations/     # SQL migration files (applied manually in Supabase SQL editor)
```

---

## Architecture: Key Rules

### Multi-tenancy
Every query must be scoped to `profile.org_id` from `requireProfile()`. Never trust `org_id` from the request body.

- `customers` and `activities` tables use `user_id` (not `org_id`) for org scoping — always filter with `user_id = profile.org_id`
- `org_settings` must use `.update().eq('org_id', ...)` — never `.upsert()` (RLS blocks INSERT, causing silent failure)

### Two Supabase clients
- `createServiceClient()` — bypasses RLS. Use when RLS cannot handle the query (storage ops, cross-org admin views, tables without RLS). **Each usage in `app/api/vehicles/` has a comment explaining why.**
- `createClient()` — respects RLS. Default for all authenticated user routes.

### Auth
- All API routes call `requireProfile()` first — checks auth, `deactivated_at`, and null `org_id`
- Role checks use helpers from `lib/auth/dealerRoles.ts` (`isDealerAdmin()`, `canAccessBhph()`, etc.) — never raw role strings
- Platform admin routes call `requirePlatformSuperAdmin()` after `requireProfile()`

### Webhooks
- Twilio: HMAC-SHA1 via `validateTwilioSignature()` — see CLAUDE.md for the pattern
- Retell: HMAC-SHA256 with timestamp replay protection
- All secret comparisons use `crypto.timingSafeEqual()`

---

## Cron Jobs

| Route | Schedule | What it does |
|-------|----------|-------------|
| `/api/cron/check-tasks` | Daily | 16 jobs: receipts, inventory aging, dormant customers, quota reset, appointment reminders, response alerts, admin alerts, data retention, onboarding nudges, sequence delivery, full-auto sequences, review requests, Gmail watch renewal, Gmail token health, pulse surveys, appointment reminders V2 |
| `/api/cron/sync-leads` | Every 15min | Gmail + IMAP lead polling for all orgs |
| `/api/cron/poll-reviews` | Every 4h | Google Business Profile review sync |
| `/api/cron/retention-triggers` | Daily 9am PT | Auto-enroll customers in retention sequences |
| `/api/cron/card-batch` | Mondays 6am PT | Generate print card batches + PostGrid submissions |
| `/api/cron/process-render-queue` | Every minute | Dispatch queued Remotion Lambda video renders |

Auth: `Authorization: Bearer <CRON_SECRET>` header.

---

## Deployment

**Staging:**
```bash
./deploy-staging.sh
```
Deploys to staging.dealerwyze.com.

**Production:**
```bash
./deploy-prod.sh
```
Deploys to dealerwyze.com. **No GitHub auto-deploy on production** — always deploy manually.

Before deploying to production:
1. Ensure all required env vars are set in Vercel (see `.env.example`)
2. Apply any pending migrations in Supabase SQL editor
3. Review `CLAUDE.md` for any deploy notes

---

## Key Documentation

| File | Contents |
|------|---------|
| `CLAUDE.md` | Security rules, architecture decisions, coding patterns — **read before making any change** |
| `docs/enhancements.md` | Feature backlog and known tech debt |
| `docs/growth-strategy.md` | Business and growth plans |
| `docs/archive/` | Historical planning documents (PRDs, execution plans, design docs) — preserved for reference |
| `supabase/migrations/` | All database migrations in chronological order |

---

## Common Gotchas

- **`org_settings`**: always `.update().eq('org_id', ...)`, never `.upsert()`. INSERT is RLS-blocked and fails silently.
- **`customers` table**: filter with `user_id`, not `org_id` (that column does not exist on this table).
- **`activities` table**: insert with `user_id` only — `org_id` column does not exist.
- **Phone numbers**: use `normalizePhone()` from `lib/utils/phone.ts` for E.164 normalization.
- **Sentinel org**: UUID `00000000-0000-0000-0000-000000000001` is reserved for platform staff profiles.
- **`lib/blog.ts`**: powers the marketing blog at `/blog` — used by `app/blog/` and `app/sitemap.ts`.
