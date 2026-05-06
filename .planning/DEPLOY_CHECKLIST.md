# DealerWyze Deploy Checklist

**Policy:** All three gates must pass before deploying to staging or production. No exceptions.

---

## Release Gates (Run in Order)

### 1. Lint
```bash
npx eslint app components hooks lib --max-warnings=0
```
(Equivalent scoped check: `npx eslint "app/**/*.ts" "lib/**/*.ts" "components/**/*.ts" "hooks/**/*.ts" --max-warnings=0`.)
- Must exit 0 with zero warnings.
- Any new `createServiceClient()` usage in an org-scoped handler must have a comment explaining why.

### 2. Tests
```bash
npm test
```
- Must exit 0 with all tests passing.
- No skipped tests allowed on payment, tenancy, or webhook test files.

### 3. Build
```bash
npm run build
```
- Must compile successfully with no type errors.

---

## Environment Variables (Verify in Vercel Before First Deploy)

| Variable | Required | Notes |
|----------|----------|-------|
| `NEXT_PUBLIC_APP_URL` | Yes | Must match production domain exactly (used in Gmail OIDC audience) |
| `STAFF_SESSION_SECRET` | Yes | Min 32 chars; rotates impersonation cookie signing |
| `UNSUBSCRIBE_SECRET` | Yes | HMAC key for unsubscribe token |
| `UPSTASH_REDIS_REST_URL` | Yes | Distributed rate limiting (export cooldown, payment limiter) |
| `UPSTASH_REDIS_REST_TOKEN` | Yes | |
| `GMAIL_PUBSUB_TOPIC` | Yes | Google Cloud Pub/Sub topic name |
| `GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL` | Yes | Exact service account email from Pub/Sub subscription; must match OIDC email claim |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Never expose to client |
| `SUPABASE_JWT_SECRET` | Yes | Required for staff impersonation JWT minting (`lib/supabase/impersonation.ts`); must match project JWT secret |
| `TWILIO_AUTH_TOKEN` | Yes | Used for webhook HMAC-SHA1 validation |
| `STRIPE_SECRET_KEY` | Yes | Platform Stripe key |

---

## Pre-Deploy Verification Steps

1. **Apply pending Supabase migrations** (`supabase db push` or SQL editor) — including `audit_log` (Phase 5) and any newer files.
2. **Confirm Pub/Sub subscription** points to `https://dealerwyze.com/api/gmail/webhook`.
3. **Confirm `GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL`** matches the exact service account email in Google Cloud Console under the Pub/Sub subscription.
4. **Confirm `SUPABASE_JWT_SECRET`** is set in Vercel (and `.env.local` for local impersonation tests) for every environment that uses staff impersonation.
5. **Run release gates** (lint + test + build) locally or in CI — all three must pass.
6. **Deploy staging** and run smoke tests (see below).
7. **Deploy production** only after staging smoke tests pass.

---

## Smoke Tests (After Deploy)

Run these manually after each production deploy:

| Test | Expected |
|------|----------|
| Send a Gmail from a connected account → check CRM activities | Gmail sync working |
| Hit `GET /api/settings/data-export` twice within the export rate window | Second request returns 429 (Upstash: 1/org/hour when configured) |
| `PATCH /api/settings/org` with a small change → query `audit_log` (`action = 'settings_updated'`) | Row present with `metadata.changed_keys` |
| `POST /api/admin/impersonate` then `DELETE /api/admin/impersonate` → query `audit_log` | `impersonation_start` and `impersonation_end` rows |
| `POST /api/pay/[token]` confirm (test token) → query `audit_log` | `payment_confirmed` row (`entity_type = bhph_token`) |
| Twilio webhook with bad `x-twilio-signature` → query `audit_log` | `webhook_auth_failure` with `reason: invalid_signature` |
| Invalid Gmail OIDC → query `audit_log` | `webhook_auth_failure` with Gmail path / OIDC reason (also `org_audit_log` may still record legacy row) |

Legacy `org_audit_log` / `admin_audit_log` rows may still exist in parallel; **Phase 5 canonical trail** is public **`audit_log`**.

---

## Rollback Procedure

1. In Vercel dashboard: **Deployments** → select previous successful deployment → **Promote to Production**.
2. If database migration was applied: assess whether it is reversible. All v1.1 migrations are additive (new tables/columns) and do not require rollback in most cases.
3. If Supabase RPC was updated: re-run prior migration SQL in the Supabase SQL editor.

---

*Last updated: 2026-05-05 — Phase 5 audit_log + release gates*
