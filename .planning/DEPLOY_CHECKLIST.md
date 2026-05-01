# DealerWyze Deploy Checklist

**Policy:** All three gates must pass before deploying to staging or production. No exceptions.

---

## Release Gates (Run in Order)

### 1. Lint
```bash
npx eslint "app/**/*.ts" "lib/**/*.ts" --max-warnings=0
```
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
| `TWILIO_AUTH_TOKEN` | Yes | Used for webhook HMAC-SHA1 validation |
| `STRIPE_SECRET_KEY` | Yes | Platform Stripe key |

---

## Pre-Deploy Verification Steps

1. **Confirm Pub/Sub subscription** points to `https://dealerwyze.com/api/gmail/webhook`.
2. **Confirm `GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL`** matches the exact service account email in Google Cloud Console under the Pub/Sub subscription.
3. **Run release gates** (lint + test + build) locally or in CI.
4. **Deploy staging** and run smoke tests (see below).
5. **Deploy production** only after staging smoke tests pass.

---

## Smoke Tests (After Deploy)

Run these manually after each production deploy:

| Test | Expected |
|------|----------|
| Send a Gmail from a connected account → check CRM activities | Gmail sync working |
| Hit `GET /api/settings/data-export` twice within 24h | Second request returns 429 |
| PATCH `POST /api/settings/org` → check `org_audit_log` in Supabase | Settings audit row written |
| `POST /api/admin/impersonate` → check `org_audit_log` | Impersonation audit row written |
| `POST /api/pay/[token]` with `action: confirm` → check `org_audit_log` | Payment audit row written |
| Webhook from invalid source → check `org_audit_log` for `gmail_webhook_auth_failure` | Auth failure logged |

---

## Rollback Procedure

1. In Vercel dashboard: **Deployments** → select previous successful deployment → **Promote to Production**.
2. If database migration was applied: assess whether it is reversible. All v1.1 migrations are additive (new tables/columns) and do not require rollback in most cases.
3. If Supabase RPC was updated: re-run prior migration SQL in the Supabase SQL editor.

---

*Last updated: 2026-04-29 — v1.1 Enterprise Hardening milestone*
