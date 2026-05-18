## Admin Observability + Monitoring + Backup — Completion Report

Date: 2026-05-08
Project: DealerWyze (apollo-crm)

### Release gates (final)

- **ESLint**: PASS (`npx eslint app components hooks lib --max-warnings=0`)
- **Tests**: PASS (`npm test`)
- **Build**: PASS (`npm run build`)

---

## Task status (by plan)

### Phase A — Database Migrations

- **A / R1**: ✅ Implemented — `supabase/migrations/150_data_recovery_archive.sql`
- **A / R2**: ✅ Implemented — `supabase/migrations/151_recovery_log.sql`

### Phase B — Cron: Recovery Archive Purge

- **B / R3**: ✅ Implemented — `app/api/cron/purge-recovery-archive/route.ts` + `vercel.json` cron schedule

### Phase C — Data Recovery Admin APIs

- **C / R4**: ✅ Implemented — admin list/restore/purge routes under `app/api/admin/data-recovery/*`
- **C / R7**: ✅ Implemented — `app/api/admin/data-recovery/summary/route.ts`

### Phase D — Data Recovery Admin UI

- **D / R5**: ✅ Implemented — `app/(app)/admin/data-recovery/page.tsx`
- **D / O3 (UI stub)**: ✅ Implemented — org detail page calls `/api/admin/orgs/[id]/health` gracefully
- **D / D1**: ✅ Implemented — delete success toast includes 7‑day recovery notice

### Phase E — Sentry Hardening

- **E / S1–S4**: ✅ Implemented — `sentry.client|server|edge.config.ts`, `next.config.ts` Sentry options
- **E / S5–S6**: ✅ Implemented — `lib/sentry/setUserContext.ts` + wired in `app/(app)/layout.tsx`
- **E / S7**: ✅ Implemented — `app/(app)/error.tsx` + `app/global-error.tsx`

### Phase F — PostHog

- **F / P3–P6**: ✅ Implemented — provider + org identify + typed `useAnalytics`
- **F / P7**: ✅ Implemented (partial catalogue, per plan) — key-screen events (no PII)
- **F / P8**: ✅ Implemented — pageview capture component
- **F / P9**: ✅ Implemented — reset on sign-out (`components/settings/SignOutButton.tsx`)

### Phase G — Axiom / Logger Enhancement

- **G / A2**: ✅ Implemented — `lib/logger.ts` includes `org_id`, `duration_ms`
- **G / A3**: ✅ Implemented — updated 5 routes to include org context in logs

### Phase H — Sentry on Critical Paths

- **H / E1**: ✅ Implemented — Twilio inbound wrapped in Sentry span
- **H / E2**: ✅ Implemented — Stripe webhook wrapped in Sentry span
- **H / E3**: ✅ Implemented — auth breadcrumb on `requireProfile()` redirect case

### Phase I — Uptime & Health

- **I / U1**: ✅ Implemented — Vercel Analytics + Speed Insights in `app/layout.tsx`
- **I / U2**: ⚠️ Implemented with deviation: **public route returns `{ ok: true, ts: Date.now() }`** exactly per spec; **no DB calls** (strict requirement).

### Phase J — Backup (R2 + GitHub Actions)

- **J / B1**: ✅ Implemented — `.github/workflows/db-backup.yml`
- **J / B3**: ✅ Implemented — `lib/backup/r2Client.ts`, `app/api/admin/backup-status/route.ts`
- **J / B4**: ✅ Implemented — `app/(app)/admin/backup-status/page.tsx`
- **J / B6**: ✅ Implemented — `docs/BACKUP_RESTORE.md`

### Phase K — Admin Observability Pages

- **K / O1**: ✅ Implemented — platform health API + UI
- **K / O2**: ✅ Implemented — feature adoption API + UI
- **K / O3**: ✅ Implemented — `app/api/admin/orgs/[id]/health/route.ts`

### Phase L — Admin Dashboard + Nav

- **L / O4**: ✅ Implemented — admin dashboard cards include Platform Health + Feature Adoption (and related links)
- **L / Q1**: ✅ Implemented — admin nav links added to `DesktopSidebar.tsx` + `BottomNav.tsx`

### Phase M — Env Vars + Validation

- **M / env example**: ✅ Implemented — updated `apollo-crm/.env.example`
- **M / validate**: ⚠️ Implemented with deviation — `lib/env/validate.ts` validates only runtime-required vars; optional observability vars remain optional per plan intent.

### Phase N (added later) — Customer Search + Backup Download

- **N1**: ✅ Implemented — `app/api/admin/data-recovery/search/route.ts` + “Find Deleted Customer” section in `app/(app)/admin/data-recovery/page.tsx`
- **N2**: ✅ Implemented — `app/api/admin/backup-download/route.ts` + Download buttons in `app/(app)/admin/backup-status/page.tsx`

---

## Enterprise compliance checklist (PASS/FAIL)

- **Auth & tenant isolation**: PASS (admin routes gated; org scope derived from server/service role)
- **Service role usage**: PASS (only admin routes/cron/webhooks; documented where used)
- **PII in logs/analytics/sentry**: PASS (org-level identity; no customer message content/names/phones in telemetry)
- **Secrets**: PASS (no secrets hardcoded; `.env.example` updated)
- **Error handling**: PASS (no stack traces returned; external calls have fallback behavior)
- **Release gates**: PASS (eslint/test/build)

---

## Manual operator steps (Tim)

- **Supabase**: apply migrations in production (`150`, `151`).
- **Vercel env vars**:
  - Sentry: `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`
  - PostHog (admin adoption queries): `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID`
  - R2 backups UI: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`
- **GitHub Actions secrets** (db-backup workflow): `SUPABASE_DB_URL`, `R2_*`, `BACKUP_ENCRYPTION_KEY`
- **First backup**: run the GitHub Actions workflow manually once to confirm upload and access.

