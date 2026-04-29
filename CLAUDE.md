# DealerWyze Working Rules

## Project
- Multi-tenant SaaS CRM for used-car dealerships.
- Brand: DealerWyze.
- Apollo Auto is Tim's tenant for testing, not the product.
- Stack: Next.js App Router, TypeScript, Tailwind, Supabase, Twilio, Stripe, Retell, Anthropic, Groq.

## Non-Negotiables
- Treat every change as multi-tenant and security-sensitive.
- Never trust `org_id` from request input. Derive tenant scope from `requireProfile()`.
- Never expose cross-tenant data, secrets, internal IDs, stack traces, or raw DB errors.
- Never put secrets in query params, logs, or response bodies.
- Use `crypto.timingSafeEqual()` for secret comparisons.

## Auth And Authorization
- API routes must call `requireProfile()` first unless the route is intentionally public.
- Platform admin routes must call `requirePlatformSuperAdmin(profile.id)` or the narrower platform-area helper.
- Do not use raw role strings. Use helpers from `lib/auth/dealerRoles.ts` and `lib/auth/platform.ts`.
- Admin routes use `createServiceClient()`. Regular org-scoped routes use `createClient()`.

## Data Safety
- Scope all DB access to the authenticated org.
- Prefer `404` over `403` when ownership should not be disclosed.
- Cap analytics date ranges at 365 days.
- Never fetch unbounded rows. Batch with cursor pagination and `.limit(500)`.
- Validate phone numbers, emails, dates, and any external URL or file input before use.
- File and image uploads must be size-capped before decoding or forwarding.

## Webhooks And Public Routes
- Twilio routes must validate `x-twilio-signature`.
- Cron routes must use `validateCronAuth(req)`.
- Public token routes must be one-time or replay-safe and must verify external payment or delivery state before mutating records.

## User-Facing Messaging
- Use plain English.
- Say what happened, what the impact is, and what the dealer should do next.
- Avoid internal jargon in dealer-facing copy.

## Project-Specific Gotchas
- `customers` has no `org_id`; org scoping often uses the authenticated profile and `user_id`.
- `activities` has no `org_id`; inserting `org_id` will break writes.
- `org_settings` writes should use `.update().eq('org_id', ...)`, not blind upserts.
- Staff impersonation uses the signed `dealerwyze_staff_org_id` cookie and `STAFF_SESSION_SECRET`.

## Before Finishing
- Check tenant isolation.
- Check authorization helper usage.
- Check rate-limit, quota, and billing implications for any expensive path.
- Check error responses for info leaks.
- Run the smallest meaningful verification for touched code.
