# ApolloCRM Security, Abuse, and Cost-Control Audit

Date: 2026-04-28

Scope:
- `app/api/**`
- key auth, billing, webhook, communications, AI, and settings flows in `lib/**`

Focus:
- loopholes that allow unauthorized state changes
- service abuse and cost amplification
- weak or inconsistent rate limiting
- webhook and public endpoint hardening
- preserving a good user experience while tightening controls

## Executive Summary

The app already has several solid protections in place:
- signed webhook validation for Stripe, Twilio, Retell, and fax callbacks
- centralized cron auth
- SMS monthly quota and velocity caps
- several org-scoped AI rate limiters
- basic signup, booking, payment, pulse, and lead public IP throttles

The main residual risk is inconsistency. A few important flows are hardened well, but adjacent flows bypass the same controls. The biggest issues are:
- a critical public payment confirmation path that can mark a payment as paid without verifying Stripe
- org-level settings routes that allow sensitive writes without an admin-role check
- outbound email and intro-SMS paths that bypass the stronger quota/consent/rate-limit controls already implemented elsewhere
- multiple authenticated cost-driving routes with no rate limiting
- SSRF-capable fetch paths driven by user-supplied URLs
- fail-open behavior when Upstash is misconfigured in production

## Method

Reviewed:
- route surface under `app/api`
- auth helpers and role checks
- rate limiting and quota utilities
- payment, webhook, SMS, email, AI, video, support, and settings routes

Did not fully review:
- database RLS policies and migrations in detail
- frontend-only UX behavior except where it affects protected routes
- third-party infra configuration outside repository code

## Findings

### 1. Critical: public BHPH payment confirmation can be forged

Severity: Critical

Affected files:
- [app/api/pay/[token]/route.ts](/home/tim/Applications/ApolloCRM/apollo-crm/app/api/pay/[token]/route.ts:122)

What happens:
- `POST /api/pay/[token]` with `action === 'confirm'` trusts a caller-supplied `payment_intent_id`.
- It marks the token paid, logs activity, and advances the contract balance without retrieving the PaymentIntent from Stripe.
- There is no verification that:
  - the intent exists
  - the intent succeeded
  - the amount and currency match
  - the metadata belongs to the payment token
  - the dealer Stripe account actually processed the payment

Why it matters:
- anyone holding a valid payment link can likely mark an installment as paid without money moving
- this is direct financial loss and accounting corruption

Evidence:
- token marked paid in [route.ts](/home/tim/Applications/ApolloCRM/apollo-crm/app/api/pay/[token]/route.ts:136)
- contract advanced in [route.ts](/home/tim/Applications/ApolloCRM/apollo-crm/app/api/pay/[token]/route.ts:169)

Remediation:
1. Remove client-driven `confirm` as the source of truth.
2. Confirm payment only via Stripe webhook or via a server-side Stripe retrieval call.
3. On confirmation, verify:
   - `status === succeeded`
   - exact `amount`
   - `currency === usd`
   - expected metadata token id
   - expected Stripe account / dealer credentials
4. Make the update idempotent with a persisted processed-payment record.
5. Consider replacing token confirmation entirely with webhook-driven state changes.

### 2. High: sensitive org settings can be changed without admin authorization

Severity: High

Affected files:
- [app/api/settings/org/route.ts](/home/tim/Applications/ApolloCRM/apollo-crm/app/api/settings/org/route.ts:56)
- contrast with properly gated route [app/api/settings/video/route.ts](/home/tim/Applications/ApolloCRM/apollo-crm/app/api/settings/video/route.ts:30)

What happens:
- `PATCH /api/settings/org` only requires authentication.
- It accepts and writes sensitive org-level fields including:
  - `postgrid_api_key`
  - `stripe_dealer_publishable_key`
  - `stripe_dealer_secret_key`
  - business contact settings
  - review configuration
  - lead assignment configuration

Why it matters:
- a rep-level user could change payment configuration, break outbound services, alter lead routing, or sabotage operations
- this is both an abuse path and an insider-risk path

Evidence:
- no role check after `requireProfile()` in [route.ts](/home/tim/Applications/ApolloCRM/apollo-crm/app/api/settings/org/route.ts:56)
- sensitive writes accepted in [route.ts](/home/tim/Applications/ApolloCRM/apollo-crm/app/api/settings/org/route.ts:119)

Related inconsistency:
- some settings routes do enforce admin/manager permissions:
  - [app/api/settings/video/route.ts](/home/tim/Applications/ApolloCRM/apollo-crm/app/api/settings/video/route.ts:33)
  - [app/api/settings/website/route.ts](/home/tim/Applications/ApolloCRM/apollo-crm/app/api/settings/website/route.ts:27)
  - [app/api/settings/pulse/route.ts](/home/tim/Applications/ApolloCRM/apollo-crm/app/api/settings/pulse/route.ts:26)
- others do not:
  - [app/api/settings/org/route.ts](/home/tim/Applications/ApolloCRM/apollo-crm/app/api/settings/org/route.ts:56)
  - [app/api/settings/automation/route.ts](/home/tim/Applications/ApolloCRM/apollo-crm/app/api/settings/automation/route.ts:40)

Remediation:
1. Require `dealer_admin` or equivalent management role for all org-wide settings writes.
2. Split especially sensitive secrets into separate admin-only endpoints.
3. Add audit logging for all settings changes involving secrets, routing, or billing.
4. Add tests asserting reps cannot PATCH org-wide settings.

### 3. High: scan-to-SMS intro flow bypasses consent, quota, and rate-limit controls

Severity: High

Affected files:
- [app/api/leads/create-from-scan/route.ts](/home/tim/Applications/ApolloCRM/apollo-crm/app/api/leads/create-from-scan/route.ts:89)
- compare with guarded SMS route [app/api/sms/send/route.ts](/home/tim/Applications/ApolloCRM/apollo-crm/app/api/sms/send/route.ts:39)

What happens:
- when `send_intro_sms` is enabled, the route sends Twilio SMS directly
- it does not route through `/api/sms/send`
- it does not enforce:
  - `sms_opt_out`
  - pending consent state
  - org burst limiter
  - monthly quota
  - daily cap logic used in normal SMS flow

Why it matters:
- this creates a side door around the primary outbound SMS safety layer
- high-volume scans can trigger unbounded outbound texting and compliance violations

Evidence:
- direct Twilio send begins in [route.ts](/home/tim/Applications/ApolloCRM/apollo-crm/app/api/leads/create-from-scan/route.ts:117)
- no call to SMS quota or consent checks in that flow

Remediation:
1. Delete the direct Twilio send path.
2. Reuse the existing SMS send service path or a shared server utility that enforces the same policy stack.
3. Add a regression test that opted-out or pending-consent customers cannot receive intro SMS via scan flow.

### 4. High: outbound email has no equivalent rate limit, quota, or unsubscribe enforcement

Severity: High

Affected files:
- [app/api/email/send/route.ts](/home/tim/Applications/ApolloCRM/apollo-crm/app/api/email/send/route.ts:167)
- current limiter inventory [lib/rateLimit/upstash.ts](/home/tim/Applications/ApolloCRM/apollo-crm/lib/rateLimit/upstash.ts:44)

What happens:
- authenticated users can send email if a customer belongs to the org and the org has a connected account
- there is no org/day quota, no burst limiter, no per-user limiter, and no `unsubscribe_email` enforcement in this route

Why it matters:
- compromised accounts or abusive reps can rapidly damage sender reputation
- Gmail/SMTP limits can be exhausted
- email follow-up compliance becomes inconsistent with customer preferences

Remediation:
1. Add org-level email burst and daily limits.
2. Add per-user send caps to contain compromised rep accounts.
3. Enforce `unsubscribe_email` before sending.
4. Add a soft warning threshold and a hard stop threshold.
5. Track provider-level failures and temporarily pause sending when bounce/rejection spikes appear.

### 5. Medium: server-side SSRF via email attachments

Severity: Medium

Affected files:
- [app/api/email/send/route.ts](/home/tim/Applications/ApolloCRM/apollo-crm/app/api/email/send/route.ts:51)

What happens:
- `resolveAttachments()` fetches arbitrary `signedUrl` values supplied by the client
- there is no host allowlist, scheme restriction, redirect policy, or response size cap

Why it matters:
- authenticated users can coerce the server into fetching attacker-controlled or internal URLs
- this can probe internal services, cloud metadata endpoints, or create bandwidth/memory abuse

Remediation:
1. Only allow attachments from approved storage hosts or signed object IDs resolved server-side.
2. Reject private-address destinations and unexpected redirects.
3. Cap download size and timeout aggressively.
4. Prefer attachment IDs over raw URLs from the client.

### 6. Medium: webhook delivery feature enables authenticated SSRF / internal egress abuse

Severity: Medium

Affected files:
- [app/api/settings/webhooks/route.ts](/home/tim/Applications/ApolloCRM/apollo-crm/app/api/settings/webhooks/route.ts:40)
- [lib/webhooks/dispatch.ts](/home/tim/Applications/ApolloCRM/apollo-crm/lib/webhooks/dispatch.ts:43)

What happens:
- dealer admins may register any `http` or `https` URL
- the server later POSTs signed payloads to that URL
- there is no destination allowlist or private-network blocking

Why it matters:
- a malicious tenant admin can use the platform as an SSRF/evasion proxy
- this can hit localhost, RFC1918 ranges, metadata services, or abuse egress

Remediation:
1. Require HTTPS except possibly in explicit dev mode.
2. Block localhost, link-local, RFC1918, and metadata IP ranges after DNS resolution.
3. Add destination validation at create time and again at send time.
4. Add webhook delivery logging with failure counts and automatic disable on repeated errors.

### 7. Medium: production rate limiting is fail-open if Upstash is missing

Severity: Medium

Affected files:
- [lib/rateLimit/upstash.ts](/home/tim/Applications/ApolloCRM/apollo-crm/lib/rateLimit/upstash.ts:3)

What happens:
- if Upstash env vars are unset, all exported limiters allow traffic
- this disables abuse controls for registration, leads, booking, pulse, and payment endpoints

Why it matters:
- a configuration regression silently removes core abuse defenses in production

Remediation:
1. Fail closed or fail degraded in production.
2. At minimum, log loudly and emit an admin alert when limiters are disabled.
3. Add startup health checks for rate-limit infrastructure.
4. Add a fallback in-process limiter for partial containment.

### 8. High: AI performance brief endpoint is cost-exposed and unthrottled

Severity: High

Affected files:
- [app/api/reports/ai-brief/route.ts](/home/tim/Applications/ApolloCRM/apollo-crm/app/api/reports/ai-brief/route.ts:19)

What happens:
- any report-capable user can trigger a streamed Groq completion
- there is no billing feature gate, no org/day limiter, and no per-user limiter
- unlike the other hardened AI routes, this endpoint does not use `assertCanUseFeature(...)` and has no dedicated Upstash limiter

Why it matters:
- this is a direct recurring cost sink with effectively unbounded invocation volume
- compromised low-privilege accounts can spam it continuously
- in practice this belongs in the same risk bucket as the other AI routes already protected by plan gates and org-scoped daily limits

Remediation:
1. Add `assertCanUseFeature(profile.org_id, 'ai_brief')` or equivalent billing gate before provider invocation.
2. Add a new Upstash-backed `orgAiBriefLimiter` with the same org-scoped daily pattern as `market-check`.
3. Add per-user short-window rate limiting if this remains user-triggerable from the UI.
4. Consider short-TTL caching for repeated identical requests.

### 9. Medium: support tickets and feedback email flows can be spammed

Severity: Medium

Affected files:
- [app/api/support/tickets/route.ts](/home/tim/Applications/ApolloCRM/apollo-crm/app/api/support/tickets/route.ts:20)
- [app/api/feedback/route.ts](/home/tim/Applications/ApolloCRM/apollo-crm/app/api/feedback/route.ts:22)

What happens:
- both routes send mail or create operational workload
- neither route has route-level rate limiting, attachment-count quotas per user, or org spam controls

Why it matters:
- abusive users can flood support inboxes and inflate provider usage
- this is operational abuse, not just cost abuse

Remediation:
1. Add per-user and per-org rate limits.
2. Deduplicate repeated submissions within a short window.
3. Add attachment byte quotas per submission and per day.
4. Consider a cooldown for repeated identical subjects/messages.

### 10. Medium: org-wide automation settings can be changed by non-admin users

Severity: Medium

Affected files:
- [app/api/settings/automation/route.ts](/home/tim/Applications/ApolloCRM/apollo-crm/app/api/settings/automation/route.ts:40)

What happens:
- authenticated users can change autoresponder mode, SLA timings, email signature, consent messaging, and selected auto-response sequences
- there is no admin/manager authorization check on PATCH

Why it matters:
- a rep can disable or alter automation globally
- this can create service degradation, compliance issues, and silent lead loss

Remediation:
1. Require admin or manager authorization for all automation writes.
2. Separate presentation preferences from org-wide automation controls.
3. Add audit logs for automation changes.

## Additional Review Notes

### Strengths observed

- Stripe webhook signature verification is present in [app/api/stripe/webhook/route.ts](/home/tim/Applications/ApolloCRM/apollo-crm/app/api/stripe/webhook/route.ts:24)
- Twilio inbound signature validation is present in [app/api/twilio/inbound/route.ts](/home/tim/Applications/ApolloCRM/apollo-crm/app/api/twilio/inbound/route.ts:55)
- Retell signature verification is present in [app/api/voice/retell-callback/route.ts](/home/tim/Applications/ApolloCRM/apollo-crm/app/api/voice/retell-callback/route.ts:58)
- cron authentication is centralized in [lib/cron/validateCronAuth.ts](/home/tim/Applications/ApolloCRM/apollo-crm/lib/cron/validateCronAuth.ts:1)
- SMS send path has materially better controls than adjacent communication flows in [app/api/sms/send/route.ts](/home/tim/Applications/ApolloCRM/apollo-crm/app/api/sms/send/route.ts:39)

### Architecture pattern to standardize

The safest routes share a common pattern:
- authenticate user or verify webhook signature
- assert role
- assert org ownership
- assert billing entitlement
- assert rate limit
- assert quota
- call provider
- write activity log
- write audit/security event when unusual

Several weaker routes skip one or more of those layers.

## Remediation Plan

### P0: fix immediately

1. Fix BHPH payment confirmation by verifying the Stripe PaymentIntent server-side before marking the token paid.
2. Add `isDealerAdmin()` authorization checks to `settings/org` PATCH and `settings/automation` PATCH.
3. Remove direct Twilio send from `create-from-scan` and reuse the guarded SMS path with quota, rate-limit, and opt-out enforcement.
4. Add `ai-brief` billing gate plus a new `orgAiBriefLimiter` daily limit.

### P1: next hardening sprint

1. Add SSRF protections for attachment fetching and webhook destinations.
2. Add email send rate limits and unsubscribe enforcement.
3. Add org and per-user rate limits for:
   - `email/send`
   - `feedback`
   - `support/tickets`
4. Add production safety behavior for missing Upstash config, ideally fail-closed or alerting on first request.
5. Add security audit logs for sensitive settings mutations.

## Suggested Execution Order

1. `P0-1`: Fix BHPH confirm — verify PaymentIntent via Stripe API before marking paid.
2. `P0-2`: Add `isDealerAdmin()` check to `settings/org` PATCH and `settings/automation` PATCH.
3. `P0-3`: Remove direct Twilio from `create-from-scan`, reuse `checkQuota` / `checkRateLimit` / `sms_opt_out`.
4. `P0-4`: Add `ai-brief` billing gate + Upstash daily limit using the same pattern as `market-check`.
5. `P1`: Add SSRF blocklist for attachment fetch + webhook destinations.
6. `P1`: Add email send rate limits + unsubscribe enforcement.
7. `P1`: Add Upstash fail-closed alerting or startup health check.

### P2: resilience and abuse analytics

1. Add centralized policy helpers for:
   - `assertDealerAdmin`
   - `assertOrgQuota`
   - `assertFeatureEntitlement`
   - `assertSafeOutboundUrl`
2. Add anomaly detection for:
   - unusual email volume
   - repeated failed provider sends
   - repeated webhook delivery failures
   - repeated support/feedback submissions
3. Add dashboard visibility for limiter health and provider spend.

## Suggested Engineering Tasks

### Auth and authorization

- Create a shared server helper for admin-only org settings writes.
- Add tests proving rep users cannot mutate org-wide settings.

### Payments

- Make payment-link confirmation webhook-driven and idempotent.
- Persist processed Stripe event/payment identifiers in DB, not process memory only.

### Communications

- Unify SMS sending through one shared internal service.
- Add a shared email send policy module mirroring SMS controls.

### Egress and SSRF

- Introduce a single outbound fetch wrapper with:
  - host allowlisting
  - IP range blocking
  - response size caps
  - timeout defaults

### Rate limiting

- Add limiter coverage matrix for every public and cost-driving route.
- Emit warnings when a route is intentionally unthrottled.

## Recommended Test Cases

1. BHPH payment link cannot be marked paid with a fake PaymentIntent id.
2. Rep user receives `403` on `PATCH /api/settings/org`.
3. Rep user receives `403` on `PATCH /api/settings/automation`.
4. Scan intro SMS does not send for opted-out or pending-consent customers.
5. Email send blocks unsubscribed customers.
6. Email send returns `429` after burst threshold.
7. Feedback and support routes throttle repeated submissions.
8. Webhook creation rejects localhost/private IP targets.
9. Attachment fetch rejects non-allowlisted hosts.
10. Production build/health check fails loudly when Upstash is missing.

## Closing

The app is not missing security thinking; it already contains strong controls in several high-risk areas. The main gap is control consistency across similar flows. The fastest way to materially improve safety without degrading service is:
- standardize authorization on org-wide settings
- standardize quota/rate/consent enforcement across all outbound communications
- close SSRF-capable fetch paths
- make payment confirmation server-authoritative
