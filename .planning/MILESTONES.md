# Milestones

## Completed

### v1.1 — Enterprise Hardening
**Started:** 2026-04-29
**Completed:** 2026-04-29
**Goal:** Move from audit score 12/20 to enterprise-grade (18+/20) by closing verified security, reliability, maintainability, and testing gaps.

**Score achieved:** ~19/20

**What shipped:**
- Service-role narrowing: 20 authenticated org routes converted from createServiceClient() to createClient() + RLS
- BHPH payment atomicity: finalize_bhph_payment RPC with optimistic-lock idempotency
- Zod schema validation at all public boundaries (web lead, booking, unsubscribe, pay token)
- Org-level audit log (org_audit_log table) with hooks on: impersonation, payment, data export, org/appearance/automation/webhook settings, user lifecycle (invite/deactivate/role-change), Gmail auth failures
- Gmail Pub/Sub OIDC-only verification (legacy token path removed)
- isomorphic-dompurify for email signature sanitization
- Upstash Redis for distributed rate limiting (export cooldown, payment limiter)
- Release gate policy: lint + test + build required before every deploy (documented in CLAUDE.md and DEPLOY_CHECKLIST.md)
- GitHub Actions CI: 3 jobs enforce gates on every push/PR to main/staging
- Security headers: X-Frame-Options, X-Content-Type-Options, HSTS, Referrer-Policy, Permissions-Policy
- VAPID keys configured for push notification feature
- Sentry error monitoring active
- 116 tests across 16 files covering: auth/tenancy, payments, impersonation, webhooks (math + route-level), Gmail OIDC, public ingestion, booking, unsubscribe

**Remaining gaps (v2 targets):**
- DB-backed proof of finalize_bhph_payment RPC atomicity (currently mocked)
- 43 "Wrong/Needs Review" service-role sites from triage inventory
- Dealer-facing audit log UI (API exists at /api/audit)
