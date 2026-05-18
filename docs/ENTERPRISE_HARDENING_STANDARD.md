# ENTERPRISE APPLICATION HARDENING & ENGINEERING STANDARD
Version: 1.1
Status: Mandatory
Applies To:
- All production applications (DealerWyze SaaS, ApolloCRM)
- All APIs and webhooks
- All AI-powered features (Anthropic, Groq, Retell)
- All automation systems (cron, Twilio, Stripe, social posting)
- All infrastructure components (Supabase, Vercel, Upstash Redis)

---

# PURPOSE

This document defines the mandatory engineering, security, scalability,
maintainability, observability, and operational standards required for any
change before deployment to staging or production.

The goal is not merely to create functioning software.

The goal is to create:
- reliable systems,
- secure systems,
- auditable systems,
- maintainable systems,
- scalable systems,
- enterprise-grade systems.

All architecture and implementation decisions MUST prioritize:
1. Security
2. Reliability
3. Maintainability
4. Operational simplicity
5. Scalability
6. Recoverability
7. Performance
8. Developer clarity

Feature velocity must NEVER compromise system integrity.

---

# CORE ENGINEERING PRINCIPLES

## 1. Simplicity Over Cleverness

Prefer:
- readable code,
- predictable systems,
- explicit logic,
- well-known patterns.

Avoid:
- hidden magic,
- excessive abstraction,
- premature optimization,
- over-engineering.

Code should be understandable by a senior engineer unfamiliar with the project.

---

## 2. Fail Safely

Systems MUST:
- fail gracefully,
- degrade safely,
- avoid cascading failures,
- preserve data integrity.

No single component failure should:
- corrupt data,
- expose secrets,
- crash the entire system,
- impact unrelated tenants.

---

## 3. Security By Default

Security is NOT optional.

Every component must assume:
- hostile traffic,
- malicious input,
- credential compromise attempts,
- abuse attempts,
- API misuse.

All systems must use:
- least privilege access,
- deny-by-default access control,
- secure secret management,
- encrypted transport,
- validated inputs.

Reference: OWASP Top 10 is the minimum baseline for all input validation,
auth, and injection defense decisions.

---

## 4. Maintainability Is Mandatory

Every feature must be:
- documented,
- testable,
- observable,
- debuggable,
- replaceable.

Avoid architecture that depends on:
- tribal knowledge,
- undocumented workflows,
- hidden dependencies.

---

# ARCHITECTURE STANDARDS

## REQUIRED

Applications MUST:
- use modular architecture,
- separate concerns cleanly,
- isolate business logic,
- isolate infrastructure logic,
- isolate UI concerns,
- isolate authentication logic.

---

## API DESIGN

All APIs MUST:
- be versioned,
- validate inputs (Zod schema at boundary),
- return structured errors,
- use idempotent operations where appropriate,
- enforce authentication via `requireProfile()`,
- enforce authorization via role helpers.

Use:
- typed schemas,
- request validation,
- response validation.

Never expose:
- stack traces,
- internal IDs,
- raw DB error messages,
- cross-tenant data in error responses.

---

## DATABASE STANDARDS

Databases MUST:
- use migrations (Supabase migration files; numbered, additive),
- support rollback,
- enforce constraints,
- use indexes intentionally,
- avoid N+1 queries,
- avoid unbounded queries.

**Pagination mandate:** Never fetch unbounded rows. Use cursor pagination
with `.limit(500)` as the maximum batch size. Cap analytics date ranges
at 365 days.

Never trust:
- client-provided tenant IDs,
- client-provided ownership,
- frontend validation alone.

Use:
- server-side authorization,
- Supabase Row Level Security (RLS) on all org-scoped tables,
- transactions (RPCs) for critical multi-step operations.

**DealerWyze schema gotchas (enforced):**
- `customers` has no `org_id` column — org scoping uses authenticated
  profile and `user_id` patterns.
- `activities` has no `org_id` column — never insert `org_id` into it.
- `bhph_payments` is scoped by `user_id` (org UUID), not `org_id`.
- `bhph_payment_ledger` is append-only — no UPDATE/DELETE RLS policies
  (migration 141). Never attempt to mutate ledger rows.
- `org_settings` writes must use `.update().eq('org_id', ...)`, not
  blind upserts.
- Always pass `p_payment_date` consistently into `finalize_bhph_payment`
  and `record_bhph_manual_payment`.

---

# MULTI-TENANT SAAS REQUIREMENTS

All SaaS systems MUST:
- isolate tenant data,
- prevent tenant cross-access,
- log tenant activity (see Audit Logging section),
- support tenant deletion,
- support tenant export.

Tenant isolation MUST be enforced:
- server-side (via `requireProfile()` — never from request input),
- database-side (RLS),
- API-side.

**Ownership disclosure:** Prefer `404` over `403` when resource ownership
should not be revealed to the caller.

Never trust frontend organization identifiers.

---

# AUTHENTICATION & AUTHORIZATION

## REQUIRED

- MFA support
- Secure session handling
- HttpOnly cookies
- CSRF protection
- Rate limiting (Upstash Redis for expensive/abuse-prone paths)
- Session expiration
- Role-based access control
- Principle of least privilege

## DealerWyze Auth Helpers (Enforced)

- All org-scoped API routes: call `requireProfile()` first.
- Platform admin routes (`app/api/admin/`): call
  `requirePlatformSuperAdmin(profile.id)` or a narrower platform-area helper.
- Do NOT use raw role string comparisons. Use helpers from
  `lib/auth/dealerRoles.ts` and `lib/auth/platform.ts`.
- Staff impersonation: authenticated via the signed `dealerwyze_staff_org_id`
  cookie using `STAFF_SESSION_SECRET`. Impersonation start/end must be
  audit-logged.

---

# SERVICE-ROLE CLIENT POLICY (Enforced — v1.1)

`createServiceClient()` bypasses ALL Supabase RLS. It is ONLY permitted in:

| Context | Reason |
|---|---|
| Platform admin routes (`app/api/admin/`) | Cross-org by design |
| Cron jobs (`app/api/cron/`, `lib/cron/`) | No user session |
| Inbound webhooks (Stripe, Twilio, Retell, Telegram, fax, render) | No user session |
| Public/token routes (pay, book, pulse survey, unsubscribe, transfer) | No user session |
| OAuth callbacks (Gmail, Google Calendar, social platforms) | Session unreliable mid-redirect |
| Storage signing | Supabase Storage ignores session-level RLS |
| Auth and onboarding flows | No session yet |
| `lib/auth/platform.ts` | Platform superadmin checks |
| `lib/audit/log.ts` → `writeAuditLog()` | RLS blocks authenticated INSERT on audit_log |

**Any new use of `createServiceClient()` in an org-scoped authenticated route REQUIRES:**
1. A code comment explaining WHY service role is needed (not just "belt and suspenders")
2. Explicit `.eq('org_id', ...)` or `.eq('user_id', ...)` on EVERY query touching org data
3. Review in the next PR that touches that file

**If `requireProfile()` is called in the same handler → use `createClient()` instead.**
RLS enforces org scoping automatically. Service role + requireProfile in the same
handler is a red flag and must be justified explicitly.

For staff impersonation queries that must run under RLS as the impersonated org,
use `createClientForRequest()` from `lib/supabase/forRequest.ts`.

See `.planning/service-role-triage.md` for the current service-role classification inventory.

---

# WEBHOOK & PUBLIC ROUTE SECURITY

All webhook and public routes MUST implement the full control set:

1. **Signature verification** — validate cryptographic signature before any logic
2. **Replay resistance** — reject duplicate or replayed requests (timestamp or nonce)
3. **Idempotency** — safe to retry or process concurrently without duplicate side effects
4. **Rate limiting** — abuse controls before expensive operations

## DealerWyze Webhook Contracts (Enforced)

- **Twilio:** validate `x-twilio-signature` using Twilio's auth helper.
- **Cron:** use `validateCronAuth(req)` from `lib/cron/validateCronAuth.ts`.
- **Gmail push:** `POST /api/gmail/webhook` with Google OIDC verification only.
  Do NOT reintroduce `/api/integrations/gmail/push` or `PUBSUB_VERIFICATION_TOKEN`.
  The legacy path is permanently deleted.
- **Stripe:** validate webhook signature before acting on any payment event.
- **Public token routes:** must be one-time or replay-safe and must verify external
  payment or delivery state before mutating records.

Webhook auth failures MUST be audit-logged with action `webhook_auth_failure`.

---

# AUDIT LOGGING (Enforced — v1.1)

High-risk actions MUST call `writeAuditLog()` from `lib/audit/log.ts`.

Properties of `writeAuditLog()`:
- Uses service role for append-only inserts into `audit_log`
- **Never throws** — callers must not depend on its return value
- The `audit_log` table is append-only (no UPDATE/DELETE)

**Five required audited action categories:**

| Area | Required `action` values |
|---|---|
| Impersonation | `impersonation_start`, `impersonation_end` (`actor_type: 'staff'`) |
| Payments | `payment_confirmed` (after successful BHPH RPC; `entity_type: 'bhph_token'`; `actor_id` null on public token routes) |
| Data export | `data_export` (successful ZIP export; `actor_type: 'user'`) |
| Settings & roles | `settings_updated` (`metadata.changed_keys`); `role_changed` (`entity_type: 'profile'`, `metadata.from_role` / `to_role`) |
| Webhook auth failures | `webhook_auth_failure` (`org_id` / `actor_id` null; `metadata.path` + `metadata.reason`) |

**Never log stack traces or raw secrets in `metadata`.**

Structured log fields required: `timestamp`, `request_id`, `actor_id`, `org_id`,
`action`, `entity_type`, `entity_id`, `metadata`.

---

# SECRET MANAGEMENT

Secrets MUST NEVER:
- exist in source code,
- exist in frontend bundles,
- exist in Git history,
- exist in logs,
- exist in query parameters,
- exist in API response bodies.

Use:
- environment variables,
- secret managers,
- encrypted secret stores.

**Secret comparisons MUST use `crypto.timingSafeEqual()`** — never string equality.

Rotate:
- API keys,
- tokens,
- credentials.

All new environment variables MUST be:
- documented in `.env.example`,
- validated in `lib/env/validate.ts`.

---

# INPUT VALIDATION

All external input MUST be treated as untrusted.

Validate at the API boundary using Zod schemas:
- API request bodies,
- query parameters,
- form submissions,
- file uploads,
- webhooks,
- AI-generated outputs.

No unsanitized user content in SQL, HTML, or shell commands.

Validate before use:
- phone numbers,
- email addresses,
- dates,
- external URLs,
- file inputs (size-cap before decoding or forwarding).

---

# FILE UPLOAD SECURITY

All uploaded files MUST:
- validate MIME type server-side,
- validate extension,
- validate and enforce size caps before decoding or forwarding,
- use randomized filenames,
- avoid executable permissions.

Never trust client-side validation.

---

# HTTP SECURITY HEADERS

All HTTP responses MUST include:
- `Strict-Transport-Security` (HSTS)
- `Content-Security-Policy` (CSP)
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`

HTTPS must be enforced on all routes. No plaintext HTTP in production.

---

# LOGGING & OBSERVABILITY

## Structured Logging
Include in every log entry:
- timestamps,
- request IDs,
- user IDs,
- tenant (org) IDs,
- correlation IDs,
- severity levels.

Never log: secrets, tokens, raw credentials, PII beyond minimum identifiers,
stack traces in external-facing outputs.

## Monitoring
Track:
- uptime,
- API latency (target <500ms under normal load),
- queue depth,
- memory and CPU usage,
- DB performance,
- error rates,
- AI API usage and cost (Anthropic, Groq, Retell tokens/minutes).

## Alerting
Alert on:
- elevated errors,
- downtime,
- queue failures,
- security anomalies,
- failed jobs,
- failed payments,
- webhook auth failure spikes.

---

# ERROR HANDLING

Applications MUST:
- never expose stack traces publicly,
- return safe, plain-English error messages,
- log detailed internal errors for diagnosis,
- support centralized error tracking.

Use:
- retry logic with backoff,
- dead-letter queues for async jobs,
- circuit breakers for external APIs.

---

# PERFORMANCE STANDARDS

Applications MUST:
- lazy load where appropriate,
- paginate large datasets (cursor pagination, `.limit(500)` max),
- cache expensive operations (Upstash Redis for rate limits and hot data),
- avoid blocking operations,
- avoid unnecessary re-renders,
- optimize database access.

Targets:
- API response <500ms under normal load,
- frontend interaction <100ms where feasible.

---

# SCALABILITY REQUIREMENTS

Systems MUST:
- support horizontal scaling,
- avoid local-only state,
- support distributed deployments,
- externalize sessions, cache, and storage.

Avoid:
- single points of failure,
- in-memory production state,
- hardcoded infrastructure assumptions.

---

# BACKUP & RECOVERY

All production systems MUST:
- support automated backups (Supabase point-in-time recovery),
- support restore testing,
- define RPO/RTO targets,
- support disaster recovery.

Backups must be:
- encrypted,
- monitored,
- regularly tested.

---

# DEVOPS & INFRASTRUCTURE

Infrastructure MUST:
- be reproducible,
- support automated deployment (`./deploy-staging.sh`, `./deploy-prod.sh`),
- support rollback deployment.

Environments required:
- local,
- staging,
- production.

Production must NEVER be the test environment.

---

# RELEASE GATE POLICY (Enforced — v1.1)

All three gates MUST pass before any deploy to staging or production:

1. `npx eslint app components hooks lib --max-warnings=0` — zero problems
2. `npm test` — all tests pass; none skipped on payment, tenancy, webhook,
   or impersonation files
3. `npm run build` — compiles with no type errors

See `.planning/DEPLOY_CHECKLIST.md` for full pre-deploy steps, env var
requirements, and rollback procedure.

---

# TESTING REQUIREMENTS

Minimum required:
- unit tests,
- integration tests,
- authentication tests,
- authorization tests (role-based, tenant-scoped),
- API tests,
- error-path testing.

Critical business logic MUST have automated tests.

Security-critical paths (auth gates, payment flows, webhook dedup, tenant
isolation, impersonation) MUST have tests. No test file on these paths
may be skipped or marked `.todo`.

Tests must assert behavior, not implementation details.

---

# FRONTEND STANDARDS

Frontend applications MUST:
- never expose secrets or service keys in bundles,
- validate user permissions before rendering sensitive UI,
- handle loading and empty states (no blank panels or unhandled null renders),
- support accessibility (keyboard navigable, labeled inputs, sufficient contrast),
- support responsive layouts,
- avoid excessive bundle sizes.

---

# AI SYSTEM REQUIREMENTS

AI-powered systems (Anthropic, Groq, Retell) MUST:
- validate AI outputs before using them in business logic,
- defend against prompt injection — never pass raw user input directly
  into system prompts without sanitization and trust-boundary enforcement,
- log prompts and outputs securely (no secrets in prompt logs),
- support human override on all AI-driven actions,
- define confidence thresholds for automated decisions,
- isolate AI failures from critical operations,
- enforce token/cost controls and quotas per tenant.

Never allow AI systems to:
- execute unrestricted actions,
- bypass authorization,
- expose secrets,
- make irreversible financial or legal decisions automatically.

---

# COMPLIANCE & PRIVACY

Applications MUST:
- minimize stored PII,
- support data deletion (tenant offboarding),
- maintain audit trails (`audit_log`, append-only),
- support consent handling,
- support export requests.

Applicable frameworks:
- CCPA (California — minimum baseline for dealer and consumer data),
- GDPR (if European dealers or data subjects),
- PCI DSS (Stripe payment flows),
- SOC 2 (target as platform matures).

---

# THIRD-PARTY DEPENDENCIES

All dependencies MUST:
- be actively maintained,
- be version pinned (lockfile committed),
- pass `npm audit` with no critical or high severity findings.

Avoid:
- abandoned packages,
- unnecessary dependencies,
- dependency sprawl.

Run dependency integrity checks in CI. Monitor for supply chain vulnerabilities
via automated tooling (Dependabot or equivalent).

---

# DOCUMENTATION REQUIREMENTS

Every project MUST include:
- architecture overview,
- setup instructions,
- deployment instructions,
- environment variable documentation (`.env.example` + `lib/env/validate.ts`),
- API documentation,
- operational runbooks,
- recovery procedures.

---

# PRODUCTION READINESS CHECKLIST

Before any deploy to staging or production, verify all gates:

## Security
- [ ] Secrets secured — not in code, logs, params, or bundles
- [ ] HTTPS enforced, HTTP security headers configured
- [ ] Rate limiting enabled on abuse-prone and expensive paths
- [ ] Auth validated — `requireProfile()` present on all org routes
- [ ] Authorization validated — correct role helper used, no raw string comparisons
- [ ] Service-role usage justified, all queries filtered
- [ ] Webhook signatures verified, replay-safe, idempotent
- [ ] Input validated with Zod at all external boundaries
- [ ] Dependency scan passed (`npm audit`)

## Reliability
- [ ] Error tracking enabled
- [ ] Structured logging enabled
- [ ] Monitoring and alerting enabled
- [ ] Backups verified
- [ ] Rollback tested

## Performance
- [ ] Load tested
- [ ] Queries optimized, indexes reviewed
- [ ] Caching reviewed (Upstash Redis)
- [ ] No unbounded queries — cursor pagination with `.limit(500)` enforced

## Maintainability
- [ ] Documentation complete
- [ ] Tests passing — no skips on payment/tenancy/webhook/impersonation files
- [ ] CI/CD operational — all three release gates pass

## SaaS Readiness
- [ ] Tenant isolation verified (server-side + RLS)
- [ ] Audit logging verified for all five required action categories
- [ ] Billing tested
- [ ] Subscription edge cases handled
- [ ] Cancellation and offboarding flows tested

---

# DEFINITION OF DONE

A feature is NOT complete unless:
- code is secure and tenant-isolated,
- code is tested (including error paths),
- code is documented,
- monitoring and structured logging exist,
- authorization is enforced via correct helpers,
- error handling exists and messages are plain English,
- audit logging covers any high-risk actions,
- deployment impact reviewed,
- rollback strategy exists,
- all three release gates pass.

"Works locally" is NOT sufficient.

---

# AI CODING ASSISTANT ENFORCEMENT

Claude Code, Cursor AI, and all AI coding systems operating on this codebase MUST:

- Derive tenant scope from `requireProfile()` — never from request-supplied `org_id`
- Use `createClient()` for org-scoped routes; `createServiceClient()` only in
  permitted contexts (see Service-Role Policy section)
- Call role helpers from `lib/auth/dealerRoles.ts` and `lib/auth/platform.ts` —
  never raw role string comparisons
- Respect schema gotchas: no `org_id` in `customers` or `activities`; no
  mutations to `bhph_payment_ledger`
- Use `crypto.timingSafeEqual()` for secret comparisons
- Call `writeAuditLog()` for all five required action categories
- Apply `.limit(500)` cursor pagination — no unbounded queries
- Prefer 404 over 403 when ownership should not be disclosed
- Flag any new use of `createServiceClient()` in an authenticated route for review
- Reject insecure implementations, hardcoded secrets, authorization bypasses,
  suppressed errors, and hidden technical debt
- Explain risky architectural decisions and flag scalability, security, and
  operational concerns before implementing
- If uncertain: choose the safer implementation, ask before dangerous changes

---

# FINAL ENGINEERING RULE

Build systems that survive:
- scale,
- abuse,
- operator error,
- bad inputs,
- infrastructure failure,
- developer turnover,
- and time.

Enterprise-grade software is operationally resilient software.

DealerWyze handles dealer finances, consumer data, and payment processing.
The cost of a security or reliability failure is not a bug report — it is
a dealer's business and a customer's trust. Build accordingly.
