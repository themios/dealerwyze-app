# Service-Role Triage — Phase 0

**Date:** 2026-04-28
**Analyst:** Claude (automated classification)

## Summary

- Total call sites (non-import invocations): 363
- createServiceClient direct: 328
- createClientForRequest (conditional): 35
- **Legitimate:** 173
- **Reducible:** 112
- **Wrong/Needs Review:** 43
- **createClientForRequest — conditionally privileged:** 35 (all carry impersonation risk)

---

## Top 20 Reducible Targets

Priority order: payment/financial routes first (highest risk if wrong), then high-traffic org-scoped routes.

| Priority | File | Line | Current Pattern | Recommended Change |
|----------|------|------|-----------------|-------------------|
| 1 | `app/api/receipts/ledger/export/route.ts` | 8 | `requireProfile()` + service client + `.eq('user_id', org_id)` on ledger_transactions (financial data) | `createClient()` — RLS on `user_id` already enforced |
| 2 | `app/api/bhph/create/route.ts` | 24 | `requireProfile()` + service client for BHPH contract writes (financial) | `createClient()` for all DB queries; service already used for storage signing only |
| 3 | `app/api/customers/[id]/route.ts` | 12 | `requireProfile()` + service client + `.eq('user_id', org_id)` on customers | `createClient()` — RLS on `user_id` enforced |
| 4 | `app/api/customers/[id]/state/route.ts` | 13 | `requireProfile()` + service client + `.eq('user_id', org_id)` on customers (stage changes fire webhooks) | `createClient()` |
| 5 | `app/api/customers/[id]/merge/route.ts` | 19 | `requireProfile()` + service client + `.eq('user_id', org_id)` — destructive operation using over-privileged client | `createClient()` |
| 6 | `app/api/sequences/[id]/route.ts` | 10,33,75 | `requireProfile()` + service client + `.eq('org_id', org_id)` — 3 separate service instances for GET/PATCH/DELETE | `createClient()` — single auth client, RLS on `org_id` |
| 7 | `app/api/sequences/route.ts` | 7,22 | `requireProfile()` + service client + `.eq('org_id', org_id)` for list/create | `createClient()` |
| 8 | `app/api/sequences/[id]/steps/route.ts` | 10,33 | `requireProfile()` + service client + org-scoped sequence ownership check | `createClient()` |
| 9 | `app/api/sequences/[id]/steps/[stepId]/route.ts` | 10,58 | `requireProfile()` + service client + org-scoped sequence check | `createClient()` |
| 10 | `app/api/settings/org/route.ts` | 8,62 | `requireProfile()` + service client + `.eq('org_id', org_id)` or `.eq('id', org_id)` for all reads/writes | `createClient()` — covers organizations + org_settings + org_google_tokens |
| 11 | `app/api/settings/appearance/route.ts` | 21,45 | `requireProfile()` + service client + `.eq('org_id', org_id)` on org_settings | `createClient()` |
| 12 | `app/api/settings/pulse/route.ts` | 10,50 | `requireProfile()` + service client + `.eq('org_id', org_id)` on org_settings | `createClient()` |
| 13 | `app/api/settings/video/route.ts` | 9,53 | `requireProfile()` + service client + `.eq('org_id', org_id)` on org_video_settings | `createClient()` (video_templates query has no org filter — separate concern) |
| 14 | `app/api/settings/webhooks/route.ts` | 15,54,83 | `requireProfile()` + service client + `.eq('org_id', org_id)` on org_webhooks | `createClient()` |
| 15 | `app/api/retention/settings/route.ts` | 16,33 | `requireProfile()` + service client + `.eq('org_id', org_id)` on retention_settings | `createClient()` |
| 16 | `app/api/retention/referrals/route.ts` | 17 | `requireProfile()` + service client + `.eq('user_id', org_id)` on customers | `createClient()` |
| 17 | `app/api/pipeline-stages/route.ts` | 6,10 | `requireProfile()` + service client + `.eq('org_id', org_id)` on org_pipeline_stages | `createClient()` |
| 18 | `app/api/segments/route.ts` | 10,22 | `requireProfile()` + service client + `.eq('org_id', org_id)` on saved_segments | `createClient()` |
| 19 | `app/api/customer-sequences/route.ts` | 6,20 | `requireProfile()` + service client + `.eq('org_id', org_id)` on customer_sequences | `createClient()` |
| 20 | `app/api/customer-sequences/[id]/route.ts` | 8 | `requireProfile()` + service client + `.eq('org_id', org_id)` — enrollment patch | `createClient()` |

---

## Legitimate — Do Not Change

Routes where service client is structurally required (no user session, cross-org routing, or storage signing).

| File | Lines | Reason |
|------|-------|--------|
| `app/api/cron/account-lifecycle/route.ts` | all | Cron — no user session |
| `app/api/cron/card-batch/route.ts` | all | Cron — no user session |
| `app/api/cron/check-tasks/route.ts` | all | Cron — no user session |
| `app/api/cron/data-retention/route.ts` | all | Cron — no user session |
| `app/api/cron/inventory-pricing-check/route.ts` | all | Cron — no user session |
| `app/api/cron/poll-reviews/route.ts` | all | Cron — no user session |
| `app/api/cron/process-render-queue/route.ts` | all | Cron — no user session |
| `app/api/cron/reset-billing-cycle/route.ts` | all | Cron — no user session |
| `app/api/cron/retention-triggers/route.ts` | all | Cron — no user session |
| `app/api/cron/send-sequences/route.ts` | all | Cron — no user session |
| `app/api/cron/sync-inventory/route.ts` | all | Cron — no user session |
| `app/api/cron/sync-leads/route.ts` | all | Cron — no user session |
| `lib/cron/runLogger.ts` | 6,27 | Cron helper — no user session |
| `lib/cron/jobs/abuseDetection.ts` | all | Cron job helper — no user session |
| `lib/cron/jobs/accountLifecycle.ts` | all | Cron job helper — no user session |
| `lib/cron/jobs/adminAlerts.ts` | all | Cron job helper — no user session |
| `lib/cron/jobs/appointmentRemindersV2.ts` | all | Cron job helper — no user session |
| `lib/cron/jobs/dataRetention.ts` | all | Cron job helper — no user session |
| `lib/cron/jobs/dormantCustomers.ts` | all | Cron job helper — no user session |
| `lib/cron/jobs/fullAutoSequence.ts` | all | Cron job helper — no user session |
| `lib/cron/jobs/gmailTokenHealth.ts` | all | Cron job helper — no user session |
| `lib/cron/jobs/gmailWatchRenewal.ts` | all | Cron job helper — no user session |
| `lib/cron/jobs/inventoryAging.ts` | all | Cron job helper — no user session |
| `lib/cron/jobs/onboardingNudges.ts` | all | Cron job helper — no user session |
| `lib/cron/jobs/pulseSurveys.ts` | all | Cron job helper — no user session |
| `lib/cron/jobs/quotaReset.ts` | all | Cron job helper — no user session |
| `lib/cron/jobs/receiptTasks.ts` | all | Cron job helper — no user session |
| `lib/cron/jobs/responseTimeAlerts.ts` | all | Cron job helper — no user session |
| `lib/cron/jobs/reviewRequests.ts` | all | Cron job helper — no user session |
| `lib/cron/jobs/sequenceDelivery.ts` | all | Cron job helper — no user session |
| `app/api/stripe/webhook/route.ts` | all | Inbound webhook — no user session, Stripe signature validated |
| `app/api/twilio/inbound/route.ts` | all | Inbound webhook — no user session, Twilio HMAC-SHA1 validated |
| `app/api/telegram/webhook/route.ts` | all | Inbound webhook — no user session, secret token validated |
| `app/api/bhph/webhook/route.ts` | all | Inbound webhook — no user session, Twilio HMAC-SHA1 validated |
| `app/api/fax/callback/route.ts` | all | Inbound webhook — no user session, Twilio HMAC-SHA1 validated |
| `app/api/voice/retell-callback/route.ts` | all | Inbound webhook — no user session, Retell HMAC-SHA256 validated |
| `app/api/voice/vapi-callback/route.ts` | all | Inbound webhook — no user session |
| `app/api/webhooks/render-complete/route.ts` | all | Inbound webhook — no user session, HMAC-SHA512 validated |
| `app/api/gmail/watch/route.ts` | all | Internal cron/automation — LEADS_POLL_SECRET authenticated |
| `app/api/leads/poll/route.ts` | all | Internal management endpoint — LEADS_POLL_SECRET authenticated |
| `app/api/leads/sync/route.ts` | all | Delegates to runLeadPollForOrg — background sync, no user session context |
| `app/api/leads/web/route.ts` | all | Public unauthenticated lead capture — no user session |
| `app/api/pay/[token]/route.ts` | all | Public payment endpoint — token-auth, no user session |
| `app/api/pulse/[token]/route.ts` | all | Public survey endpoint — token-auth, no user session |
| `app/api/pulse/[token]/respond/route.ts` | all | Public survey response — token-auth, no user session |
| `app/api/book/[slug]/route.ts` | all | Public booking endpoint — slug-auth, no user session |
| `app/api/unsubscribe/route.ts` | all | Public unsubscribe endpoint — HMAC token verified, no user session |
| `app/api/appointments/confirm/route.ts` | all | Confirms appointment — calls requireProfile() but uses service client for activity update which has no org_id column (by design) |
| `app/api/bhph/remind/route.ts` | all | Cron-style — CRON_SECRET authenticated, runs across all active BHPH contracts |
| `app/api/auth/register/route.ts` | all | Registration — no user session yet, creates org |
| `app/api/transfer/[token]/route.ts` | all | Token-auth transfer claim — no user session required for GET |
| `app/api/google/calendar-connect/route.ts` | all | CSRF token storage — needs service client before session available |
| `app/api/google/calendar-callback/route.ts` | all | OAuth callback — no reliable user session in redirect context |
| `app/api/google/calendar-disconnect/route.ts` | all | Needs service client to delete org token row |
| `app/api/integrations/gmail/callback/route.ts` | all | OAuth callback — CSRF verified, stores token server-side |
| `app/api/social/callback/[platform]/route.ts` | all | OAuth callback — state verified, stores tokens, no user session in redirect |
| `app/api/vehicles/[id]/view/route.ts` | all | Public VDP view counter — unauthenticated, calls `increment_vehicle_views` RPC |
| `app/(app)/[slug]/layout.tsx` | all | Public inventory layout — no user session, reads org by slug |
| `app/[slug]/inventory/page.tsx` | all | Public inventory page — no user session |
| `app/[slug]/inventory/[vdp]/page.tsx` | all | Public VDP page — no user session |
| `app/[slug]/sitemap.xml/route.ts` | all | Public sitemap — no user session |
| `app/book/[slug]/page.tsx` | all | Public booking page — no user session |
| `lib/admin/audit.ts` | all | Platform audit log — called from admin routes, correctly platform-scoped |
| `lib/auth/platform.ts` | all | Platform auth checks — correct to use service client for platform_superusers and profiles tables |
| `lib/orgs/lookup.ts` | all | Webhook routing — resolves org_id from phone/email, cross-org scan is intentional for routing |
| `lib/sms/quota.ts` | all | Called outside user session context (from cron, webhooks, outbound SMS paths) — service client required. NOTE: 6 instances per invocation; see Reducible (consolidation) |
| `lib/sms/rateLimit.ts` | all | Called from outbound SMS paths without user session — service client required |
| `lib/sms/sendOutbound.ts` | all | Called from cron, webhook, and async contexts without user session |
| `lib/sms/sendConsent.ts` | all | Called from lead ingest without user session |
| `lib/sms/threadState.ts` | all | Called from Twilio webhook (no user session) |
| `lib/email/sendSequenceEmail.ts` | all | Called from sequence cron without user session |
| `lib/gmail/processHistory.ts` | all | Gmail push webhook processing — no user session |
| `lib/gmail/pushWebhook.ts` | all | Gmail push handler — no user session |
| `lib/gmail/watch.ts` | all | Gmail watch renewal — no user session |
| `lib/google/calendar.ts` | all | Calendar event creation — called from cron/webhook paths |
| `lib/calendar/confirmAppointment.ts` | all | Called from appointment-confirm route; activity table has no org_id (by design) |
| `lib/calendar/sendAppointmentNotification.ts` | all | Notification helper — called from cron/webhook |
| `lib/leads/ingest.ts` | all | (Partially legitimate) — see Wrong/Needs Review; cross-org routing requires service client |
| `lib/leads/poll.ts` | all | Lead polling — cross-org scan for all connected email accounts, no user session |
| `lib/leads/pollReplies.ts` | all | Cross-org lead reply polling — no user session |
| `lib/leads/scanQuota.ts` | all | Called from cron/async receipt scanning paths — no user session |
| `lib/pulse/deliver.ts` | all | Called from cron and BHPH create route — may have no user session |
| `lib/push/send.ts` | all | Called from inbound webhook handlers — no user session |
| `lib/remotion/renderVehicleVideo.ts` | all | Background video render — may be called from cron or async webhook |
| `lib/remotion/quotaCheck.ts` | all | Called from render path which runs without user session |
| `lib/security/abuseDetector.ts` | all | Security audit logging — called from background paths |
| `lib/sequences/seedStarterSequences.ts` | all | Called from onboarding step route — org_id passed explicitly, correct |
| `lib/sequences/sendAutoResponseStep1.ts` | all | Called from lead ingest — no user session |
| `lib/social/autoPost.ts` | all | Called from render webhook — no user session |
| `lib/social/tokenRefresh.ts` | all | Token refresh — no user session context |
| `lib/stripe/commissions.ts` | all | Called from Stripe webhook — no user session |
| `lib/tasks/auto.ts` | all | Called from lead ingest/webhooks — no user session |
| `lib/theme/getOrgTheme.ts` | all | Called from public layout pages before auth — no user session |
| `lib/vdp/notifyDealer.ts` | all | Called from public web lead endpoint — no user session |
| `lib/vehicles/matchWants.ts` | all | Called from inventory sync cron — no user session |
| `lib/voice/ingest.ts` | all | Called from voice webhook — no user session |
| `lib/voice/inventoryTools.ts` | all | Called from voice AI during live call — no reliable user session |
| `lib/voice/provision.ts` | all | Admin provisioning — no user session |
| `lib/voice/summarizeVehicleDoc.ts` | all | Called from async voice processing — no user session |
| `lib/webhooks/dispatch.ts` | all | Called fire-and-forget from multiple routes; org_id passed explicitly |
| `lib/bhph/paymentToken.ts` | all | Token generation for public payment link — no user session |
| `lib/bhph/send.ts` | all | Called from BHPH remind cron — no user session |
| `lib/billing/assertFeature.ts` | all | Called from many routes — orgId passed explicitly, no user session required |
| `app/api/admin/` (all routes) | all | Platform admin routes — all gated by `requirePlatformArea()` or `requirePlatformSuperAdmin()` |
| `app/(app)/admin/page.tsx` | 70 | Platform admin page — `isPlatformSuperAdmin` check before service client use |
| `app/(app)/admin/staff/[id]/page.tsx` | 42 | `requirePlatformSuperAdmin` check before service client |

---

## Reducible — Could Use Auth Client

Routes where `requireProfile()` is called first and all queries include explicit org scoping. RLS on auth client would enforce the same filter, making service client over-privileged.

| File | Lines | Current Pattern | Notes |
|------|-------|-----------------|-------|
| `app/api/sequences/[id]/route.ts` | 10,33,75 | requireProfile + service + `.eq('org_id', org_id)` | 3 methods, 3 service instances |
| `app/api/sequences/route.ts` | 7,22 | requireProfile + service + `.eq('org_id', org_id)` | List + create |
| `app/api/sequences/[id]/steps/route.ts` | 10,33 | requireProfile + service + org-scoped sequence check | |
| `app/api/sequences/[id]/steps/[stepId]/route.ts` | 10,58 | requireProfile + service + org-scoped sequence check | |
| `app/api/sequences/seed-starters/route.ts` | 14 | requireProfile + service + `.eq('org_id', org_id)` | |
| `app/api/settings/org/route.ts` | 8,62 | requireProfile + service + `.eq('id', org_id)` / `.eq('org_id', org_id)` | Covers 3 tables |
| `app/api/settings/appearance/route.ts` | 21,45 | requireProfile + service + `.eq('org_id', org_id)` | |
| `app/api/settings/pulse/route.ts` | 10,50 | requireProfile + service + `.eq('org_id', org_id)` | |
| `app/api/settings/video/route.ts` | 9,53 | requireProfile + service + `.eq('org_id', org_id)` | video_templates table has no org_id filter — leave that query as-is |
| `app/api/settings/webhooks/route.ts` | 15,54,83 | requireProfile + service + `.eq('org_id', org_id)` | |
| `app/api/settings/automation/route.ts` | (service) | requireProfile + service + `.eq('org_id', org_id)` | |
| `app/api/retention/settings/route.ts` | 16,33 | requireProfile + service + `.eq('org_id', org_id)` | |
| `app/api/retention/referrals/route.ts` | 17 | requireProfile + service + `.eq('user_id', org_id)` | |
| `app/api/pipeline-stages/route.ts` | 6,10 | requireProfile + service + `.eq('org_id', org_id)` | |
| `app/api/segments/route.ts` | 10,22 | requireProfile + service + `.eq('org_id', org_id)` | |
| `app/api/customers/segment/route.ts` | (service) | requireProfile + service + `.eq('org_id', org_id)` | |
| `app/api/customers/segment/bulk-enroll/route.ts` | (service) | requireProfile + service + org-scoped | |
| `app/api/customer-sequences/route.ts` | 6,20 | requireProfile + service + `.eq('org_id', org_id)` | |
| `app/api/customer-sequences/[id]/route.ts` | 8 | requireProfile + service + `.eq('org_id', org_id)` | |
| `app/api/customers/[id]/route.ts` | 12 | requireProfile + service + `.eq('user_id', org_id)` | |
| `app/api/customers/[id]/state/route.ts` | 13 | requireProfile + service + `.eq('user_id', org_id)` | |
| `app/api/customers/[id]/deal-checklist/route.ts` | (service) | requireProfile + service + org-scoped customer check | |
| `app/api/customers/[id]/documents/route.ts` | (service) | requireProfile + service + org-scoped (storage signing may need service for upload) | Split: auth client for DB, service for storage upload only |
| `app/api/customers/review-request/route.ts` | (service) | requireProfile + service + `.eq('user_id', org_id)` | |
| `app/api/receipts/[id]/route.ts` | (service) | requireProfile + service + `.eq('user_id', org_id)` | |
| `app/api/receipts/ledger/export/route.ts` | 8 | requireProfile + service + `.eq('user_id', org_id)` on financial data | High priority — financial export |
| `app/api/activities/route.ts` | (service) | requireProfile + service + `.eq('user_id', org_id)` — activities has no org_id column, uses user_id | |
| `app/api/calendar/events/route.ts` | (service) | requireProfile + service + `.eq('org_id', org_id)` | |
| `app/api/reports/route.ts` | (service) | requireProfile + service + org-scoped queries | |
| `app/api/dashboard/stats/route.ts` | (service) | requireProfile + service client for org name only | Only needs org name — a single-column fetch; auth client suffices |
| `app/api/push/subscribe/route.ts` | (service) | requireProfile + service + `.eq('user_id', profile.id)` on push_subscriptions | |
| `app/api/support/tickets/route.ts` | (service) | requireProfile + service + `.eq('org_id', org_id)` | |
| `app/api/support/tickets/[id]/route.ts` | (service) | requireProfile + service + `.eq('org_id', org_id)` | |
| `app/api/support/tickets/[id]/messages/route.ts` | (service) | requireProfile + service + org-scoped ticket | |
| `app/api/pulse/scores/route.ts` | (service) | requireProfile + service + org-scoped | |
| `app/api/pulse/actions/route.ts` | (service) | requireProfile + service + `.eq('org_id', org_id)` | |
| `app/api/pulse/actions/[id]/route.ts` | (service) | requireProfile + service + `.eq('org_id', org_id)` | |
| `app/api/pulse/surveys/route.ts` | (service) | requireProfile + service + org-scoped customer check | |
| `app/api/pulse/rep-feedback/route.ts` | (service) | requireProfile + service + org-scoped | |
| `app/api/pulse/team-scores/route.ts` | (service) | requireProfile + service + org-scoped | |
| `app/api/sales/commissions/route.ts` | (service) | requireProfile + requireChannelRep + service + affiliate-scoped | |
| `app/api/sales/dealers/route.ts` | (service) | requireProfile + requireChannelRep + service + affiliate-scoped | |
| `app/api/sales/me/route.ts` | (service) | requireProfile + requireChannelRep + service | |
| `app/api/onboarding/route.ts` | (service) | requireProfile + service + `.eq('org_id', org_id)` | |
| `app/api/onboarding/step/route.ts` | (service) | requireProfile + service + `.eq('org_id', org_id)` | |
| `app/api/email/send/route.ts` | (service) | requireProfile + service for org email settings lookup | |
| `app/api/fax/send/route.ts` | (service) | requireProfile + service + org-scoped (storage upload may still need service) | Split: auth client for DB; service for fax-docs bucket upload |
| `app/api/auth/me/route.ts` | (service) | requireProfile + service for platform_role/permissions lookup on own profile | |
| `app/api/vehicles/[id]/route.ts` | 37 | requireProfile + service + `.eq('user_id', org_id)` (comment says "belt-and-suspenders") | RLS already enforces; service client comment acknowledges this |
| `app/api/vehicles/[id]/photos/[photoId]/route.ts` | (service) | requireProfile + service + org-scoped | |
| `app/api/vehicles/[id]/documents/[docId]/route.ts` | (service) | requireProfile + service — DB query portion | Split: auth client for DB, service for storage only |
| `app/api/vehicles/[id]/ai-description/route.ts` | 82 | requireProfile + svcClient + org-scoped on ai_descriptions | |
| `app/api/vehicles/[id]/market-check/route.ts` | 60 | requireProfile + svc + org-scoped on market_checks | |
| `app/api/video-templates/route.ts` | (service via forRequest) | See forRequest section | |
| `lib/sms/quota.ts` | multiple | Called with explicit orgId — 6 service client instances per `checkQuota()` invocation | **Consolidation target**: pass single client in; eliminates 5 redundant instantiations |
| `app/(app)/settings/appearance/page.tsx` | 8 | requireProfile + service + `.eq('org_id', org_id)` — RSC page | `createClient()` |
| `app/(app)/settings/retention/page.tsx` | 7 | requireProfile + service + `.eq('org_id', org_id)` — RSC page | `createClient()` |
| `app/(app)/customers/segments/page.tsx` | 10 | requireProfile + service + `.eq('org_id', org_id)` — RSC page | `createClient()` |
| `app/(app)/analytics/referrals/page.tsx` | 11 | requireProfile + service + `.eq('user_id', org_id)` — RSC page | `createClient()` |
| `app/(app)/pending/page.tsx` | 15 | requireProfile + service + `.eq('id', org_id)` on organizations — RSC page | `createClient()` |
| `app/(app)/settings/payments/page.tsx` | 16 | requireProfile + service + org-scoped — RSC page | `createClient()` |
| `app/(app)/settings/social/page.tsx` | 13 | requireProfile + service + org-scoped — RSC page | `createClient()` |
| `app/(app)/settings/video/page.tsx` | 20 | requireProfile + service + `.eq('org_id', org_id)` — RSC page | `createClient()` |

---

## Wrong / Needs Review — Phase 2 Must Investigate

Routes and utilities where org scoping is absent, ambiguous, or where cross-org reads could occur without sufficient filtering.

| File | Lines | Issue | Risk |
|------|-------|-------|------|
| `lib/leads/ingest.ts` | all | Takes optional `orgId?: string` — can be called with `orgId` undefined; function uses `orgId!` (non-null assertion without guard). Cross-org customer dedup reads use `.eq('user_id', userId)` but `userId = orgId!` silently fails if orgId is undefined | Medium — lead misrouting or cross-org customer match on undefined org |
| `lib/orgs/lookup.ts` | all | `getOrgIdByPhone` and `getOrgIdByGmail` do full table scans of org_settings without row limit. Service client reads ALL org phone/email entries to find match | Low functional risk but potential for abuse if table grows large; add `.limit()` |
| `app/api/settings/transfer/route.ts` | 23,113,135 | Transfer initiation uses service client; the `business_transfers` table is written with explicit `org_id` but subsequent reads across data snapshot queries use both `createClient()` and `createServiceClient()` in mixed pattern — confusing isolation boundary | Medium — transfer workflow complexity, mixed clients could cause subtle isolation gaps |
| `app/api/vehicles/[id]/video/route.ts` | 30 | `svcClient` used for render quota check and insert after `createClientForRequest()` for vehicle lookup — two different clients in same handler for related operations | Low — quota table likely has no RLS; document or consolidate |
| `app/api/vehicles/[id]/render/route.ts` | 93,136 | `svcClient` created for render_queue insert/update after `createClientForRequest()` for vehicle queries — split client pattern in single handler | Same as above — render_queue RLS coverage unclear |
| `app/api/vehicles/[id]/documents/route.ts` | 38,75 | Service client labeled `storage` — only used for storage operations. DB queries use `createClient()` (correct split). Verify `vehicle_docs` bucket RLS is absent and service key is truly required | Low — verify bucket RLS; if bucket has RLS, service key may be unnecessary |
| `lib/push/send.ts` | all | `sendLeadNotification` reads ALL push_subscriptions with no org filter: `.from('push_subscriptions').select('subscription')` — sends push to ALL subscribers regardless of org | **High** — cross-org push notification leak. Every dealer's push subscription receives every new lead notification |
| `app/api/gmail/watch/route.ts` | all | LEADS_POLL_SECRET authenticated — correct. But service client reads all `email_accounts` without org filter to register watches. Intentional cross-org scan; verify no data returned to caller | Low |
| `app/api/customers/[id]/documents/[docId]/route.ts` | (service) | Service client for storage-signed URL — org scoping on DB query via `createClient()` but storage key is generated via service client without re-verifying org ownership of storage object | Low-medium — org check happens on DB query; storage key path should include org prefix |
| `app/api/vehicles/[id]/photos/route.ts` | 44 | Service client for storage upload — `service` (line 44) used for `vehicle-photos` bucket. DB queries use `createClient()`. Verify `vehicle-photos` bucket has no RLS that would allow auth client | Low — standard storage split pattern; acceptable if bucket has no RLS |
| `lib/social/tokenRefresh.ts` | all | Service client used to update `social_accounts` tokens. No org scoping check before update — the function receives an account object from caller. Caller must pre-validate org ownership | Medium — if caller doesn't verify org, token write could target wrong account |
| `lib/social/autoPost.ts` | all | Service client used to read social_accounts and write render_queue entries. Accounts are loaded from caller-provided orgId — verify all callers pass correct orgId | Medium — same pattern as tokenRefresh; verify all callers |
| `app/api/contacts/route.ts` | (service) | Service client used for storage signing (contacts bucket) after `createClient()` for DB. Acceptable split. Verify `contact-cards` bucket has no RLS | Low |
| `app/api/media/upload/route.ts` | (service) | Service client for `vehicle-docs` bucket upload. DB quota checks use `createClient()`. Same storage split pattern — acceptable. | Low |
| `app/api/settings/data-export/route.ts` | (service) | requireProfile + service — data export of entire org data. Verify explicit org scoping on all tables exported | Medium — data export is high-sensitivity operation; verify no cross-org rows |
| `app/api/receipts/upload/route.ts` | (service) | Service client for storage operations on receipts bucket after `createClient()` for DB. Standard split | Low — acceptable |
| `app/api/customers/[id]/documents/route.ts` | (service) | See above note on documents pattern | Low-medium |
| `app/(app)/layout.tsx` | (service) | RSC layout uses service client to check `platform_superusers` — acceptable for platform check, but should use `lib/auth/platform.ts` helpers consistently | Low — correctness concern, not isolation risk |
| `lib/leads/assignLead.ts` | all | Service client reads `org_settings` and `profiles` for lead assignment — orgId passed explicitly. No cross-org risk but service client unnecessary; auth client with explicit orgId would work | Low |
| `lib/vehicles/matchWants.ts` | all | Service client reads `vehicle_wants` and `vehicles` using vehicle's `user_id` for org scope — correct. Called from cron; service client appropriate | Low — already classified as legitimate; flagging for documentation |

---

## createClientForRequest — Conditionally Privileged

All 35 usages carry dual behavior: normal user sessions return RLS-enforced auth client; staff impersonation sessions (signed `dealerwyze_staff_org_id` cookie) return full service-role client that bypasses all RLS.

**Critical implication:** During staff impersonation, ALL data access in these routes is unfiltered by RLS. The only protection is explicit `.eq('org_id', ...)` or `.eq('user_id', ...)` filters in the query.

| File | Line | Explicit Org Scoping? | Notes |
|------|------|-----------------------|-------|
| `app/api/vehicles/[id]/render/route.ts` | 21,73,123 | Yes — vehicle lookup uses `.eq('user_id', org_id)` | Render queue writes via svcClient — separate concern |
| `app/api/vehicles/[id]/post/route.ts` | 17 | Yes — org-scoped | |
| `app/api/vehicles/[id]/ai-description/route.ts` | 15 | Yes — org-scoped vehicle check | |
| `app/api/vehicles/[id]/market-check/route.ts` | 36 | Yes — org-scoped | |
| `app/api/vehicles/unchecked/route.ts` | 16 | Yes — uses `requireProfile` + org filter | |
| `app/api/settings/telegram/connect/route.ts` | 24,49,76 | Yes — `.eq('org_id', org_id)` | |
| `app/api/vehicles/[id]/video/route.ts` | 17 | Yes — org-scoped vehicle check | |
| `app/api/video-templates/route.ts` | 8 | **No explicit org filter** — reads `video_templates` which is a global (non-org) table. Acceptable — this is a global catalog table. But flag: during impersonation, staff see same global templates as dealer | Low risk — global templates are non-sensitive |
| `app/api/social/accounts/route.ts` | 9 | Yes — `.eq('org_id', org_id)` | |
| `app/(app)/vehicles/page.tsx` | 24 | Yes — `.eq('user_id', org_id)` | RSC page |
| `app/(app)/vehicles/[id]/edit/page.tsx` | 19 | Yes — vehicle lookup org-scoped | RSC page |
| `app/(app)/settings/page.tsx` | 175 | Yes — org-scoped settings reads | RSC page |
| `app/(app)/settings/sequences/page.tsx` | 8 | Yes — `.eq('org_id', org_id)` | RSC page |
| `app/(app)/settings/sequences/[id]/page.tsx` | 17 | Yes — `.eq('org_id', org_id)` | RSC page |
| `app/(app)/vehicles/[id]/page.tsx` | 61 | Yes — org-scoped | RSC page |
| `app/(app)/settings/automation/page.tsx` | 9 | Yes — org-scoped | RSC page |
| `app/(app)/settings/website/page.tsx` | 19 | Yes — org-scoped | RSC page |
| `app/(app)/receipts/[id]/review/page.tsx` | 18 | Yes — org-scoped | RSC page |
| `app/(app)/receipts/ledger/page.tsx` | 14 | Yes — `.eq('user_id', org_id)` | RSC page |
| `app/(app)/dashboard/page.tsx` | 15 | Yes — org-scoped dashboard stats | RSC page |
| `app/(app)/receipts/page.tsx` | 15 | Yes — `.eq('user_id', org_id)` | RSC page |
| `app/(app)/pipeline/page.tsx` | 10 | Yes — `.eq('user_id', org_id)` | RSC page |
| `app/(app)/today/page.tsx` | 19 | Yes — org-scoped | RSC page |
| `app/(app)/customers/[id]/page.tsx` | 19 | Yes — org-scoped | RSC page |
| `app/(app)/customers/page.tsx` | 26 | Yes — `.eq('user_id', org_id)` | RSC page |
| `app/(app)/customers/[id]/edit/page.tsx` | 19 | Yes — org-scoped | RSC page |
| `app/(app)/settings/bookkeeping/page.tsx` | 10 | Yes — org-scoped ledger reads | RSC page |
| `app/(app)/bhph/[id]/page.tsx` | 19 | Yes — org-scoped BHPH detail | RSC page |
| `app/(app)/bhph/page.tsx` | 50 | Yes — `.eq('user_id', org_id)` | RSC page |

---

## Notes for Phase 2

### forRequest.ts dual behavior
Normal sessions return RLS-enforced auth client. Staff impersonation sessions (signed `dealerwyze_staff_org_id` cookie) return full service-role. All 35 call sites carry this dual behavior. The `getStaffSessionInfo` check is the only gate — if the cookie verification in `staffSession.ts` has any bypass, all 35 routes become fully privileged without any RLS protection.

### lib/sms/quota.ts consolidation (6 service clients per invocation)
`checkQuota()` creates 1 service client + spawns 3 async helpers (incrementSmsOverage, incrementMmsOverage, deductBuffer) each creating their own. Plus `triggerLowBufferNotification` creates 1 more, and `triggerQuotaNotification` creates 1 more. On a worst-case invocation path, 6 service clients are instantiated. Refactor: accept `supabase` as a parameter, or create once at top of `checkQuota` and pass to helpers.

### lib/push/send.ts cross-org leak (WRONG — fix in Phase 2)
`sendLeadNotification` currently sends to ALL push subscribers with no org filter. This means dealer A's new lead notification is delivered to dealer B's browser if they're both subscribed. This is a functional bug and a privacy issue. Fix: add `org_id` column to `push_subscriptions` table and filter by org on send.

### lib/leads/ingest.ts orgId non-null assertion
The `orgId?: string` parameter with `const userId = orgId!` is dangerous. If any caller omits orgId, all customer queries silently use `undefined` as the org filter, which Supabase will likely treat as a null match — returning no rows. The behavior is wrong but not a cross-org leak. Add an explicit `if (!orgId) throw new Error(...)` guard.

### settings/transfer/route.ts mixed client pattern
The transfer route uses `createServiceClient()` for business_transfers writes and `createClient()` for data snapshot counts. This split is confusing but not necessarily incorrect — the service client ensures the transfer record is written even if RLS would block it, and auth client enforces org scoping on the snapshot queries. Document this intentional split in a comment.

### Storage routes (vehicle-photos, vehicle-docs, fax-docs, contact-cards)
Multiple routes correctly split auth client for DB and service client for storage. This is the right pattern since Supabase Storage does not enforce session-level RLS. These are all classified Legitimate or low-risk Wrong. Phase 2 should verify each bucket does NOT have RLS policies that would make the service key unnecessary.

### Video templates global table
`app/api/video-templates/route.ts` uses `createClientForRequest()` but the `video_templates` table is a global catalog (no org_id). This is fine — it's not sensitive. During impersonation the staff user sees the same global template list as the dealer.
