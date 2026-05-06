# DealerWyze / Apollo CRM — Feature inventory & free vs paid guidance

**Spreadsheet:** same content as CSV → [`features-free-vs-paid-inventory.csv`](./features-free-vs-paid-inventory.csv) (columns: `section_num`, `section_name`, `feature`, `surfaces`, `tier`, `notes`).

**Scope:** `apollo-crm` app (routes + API surface as of inventory pass).  
**Legend:** **Free** = marginal infra if lightly used (mostly your DB + app compute). **Paid** = AI tokens, third‑party APIs, messaging, heavy storage, render/video, or multi‑tenant cron at scale. **Split** = reasonable to offer a limited free tier and full paid.

This is a **product guidance** matrix, not wired billing flags in code.

---

## 1. Auth, account, legal

| Feature | Surfaces | Free / Paid |
|--------|----------|-------------|
| Login / logout / session | `(auth)/login`, `auth/callback`, `api/auth/me` | **Free** |
| Signup / register | `(auth)/signup`, `api/auth/register` | **Free** (onboarding may lead to paid) |
| Forgot / reset password | `(auth)/forgot-password`, `reset-password` | **Free** |
| Privacy / terms | `(auth)/privacy`, `terms` | **Free** |
| Account suspended | `(app)/suspended` | **Free** (state page) |

---

## 2. Onboarding & org provisioning

| Feature | Surfaces | Free / Paid |
|--------|----------|-------------|
| Dealer onboarding wizard | `(onboarding)/onboarding`, `api/onboarding`, `api/onboarding/step` | **Split** — free “shell”; steps that connect Gmail/Twilio/voice = **Paid** |
| Org / members | `api/org/members`, settings org | **Free** (data) |

---

## 3. Today (command center for the day)

| Feature | Surfaces | Free / Paid |
|--------|----------|-------------|
| Unified queue (new leads, tasks, waiting, appts, voice, vehicle match) | `(app)/today`, `TodayContent`, `api/today/*` | **Split** — base queue **Free**; AI-ranked reasons / intent / command center cache **Paid** |
| At-risk stale leads | `api/today/at-risk`, Today UI | **Split** — rule-based **Free**; if gated with AI brief **Paid** |
| Bulk / last-ditch actions | `api/today/bulk-action`, `last-ditch`, `action` | **Free** (writes); volume limits = **Paid** |
| Dealer brief + command center | `api/intelligence/briefing`, `command-center`, `DealerBrief` | **Paid** (LLM + cached aggregates) |
| Gmail sync button (UX) | Today `SyncGmailButton` | **Paid** (Gmail API + poll infra) |

---

## 4. Customers & pipeline

| Feature | Surfaces | Free / Paid |
|--------|----------|-------------|
| Customer list / search / detail | `(app)/customers`, `[id]`, `new`, `api/customers/*`, `search` | **Free** (CRUD) |
| Customer edit | `customers/[id]/edit` | **Free** |
| Merge customers | `api/customers/[id]/merge` | **Free** |
| Lead state / pipeline stage | `api/customers/[id]/state`, `pipeline-stages`, `(app)/pipeline` | **Free** |
| Deal checklist | `api/customers/[id]/deal-checklist` | **Free** |
| Customer documents | `api/customers/[id]/documents` | **Paid** (storage + bandwidth) |
| Manual intent / tier override | `api/customers/[id]/intent` (if present) | **Free** |
| AI conversation intent / scoring | Ingest + Twilio + Gmail hooks → scoring | **Paid** (LLM) |
| Review request SMS/email | `api/customers/review-request` | **Paid** (Twilio / email) |
| Segments & bulk enroll | `(app)/customers/segments`, `api/customers/segment`, `bulk-enroll` | **Split** — UI + small segments **Free**; bulk messaging **Paid** |

---

## 5. Leads (inbound capture & processing)

| Feature | Surfaces | Free / Paid |
|--------|----------|-------------|
| Web lead form (dealer) | `(app)/leads/web`, `api/leads/web`, `web/[id]`, `count` | **Split** — low volume **Free**; scale/hosting **Paid** |
| Lead ingest (marketplaces, email) | `api/leads/ingest`, `paste`, `import` | **Split** — manual paste/import **Free**; automated ingest **Paid** |
| Lead poll / sync | `api/leads/poll`, `sync` | **Paid** (Gmail/poller infra) |
| Business card / scan → lead | `api/contacts/scan`, `api/leads/scan`, `create-from-scan` | **Paid** (vision / LLM if used) |
| Lead import template | `api/leads/import/template` | **Free** |

---

## 6. Activities, tasks, calendar

| Feature | Surfaces | Free / Paid |
|--------|----------|-------------|
| Activities CRUD | `api/activities`, `[id]`, `reconcile` | **Free** |
| Tasks | `api/tasks`, `tasks/[id]`, `count` | **Free** |
| Calendar UI | `(app)/calendar` | **Free** |
| Manual calendar events | `api/calendar/manual`, `calendar/events` | **Free** |
| Google Calendar connect | `api/google/calendar-*` | **Paid** (Google quota + tokens) |
| Appointment confirm flows | `api/appointments/confirm` | **Split** (email/SMS = variable cost) |

---

## 7. Sequences & automation

| Feature | Surfaces | Free / Paid |
|--------|----------|-------------|
| Sequence builder / steps | `(app)/settings/sequences`, `api/sequences`, `steps` | **Split** — design **Free**; **sending** = **Paid** |
| Sequence cron send | `api/cron/send-sequences` | **Paid** |
| Customer sequence enroll / patch | `api/customer-sequences` | **Paid** when messages send |
| Auto-respond / automation settings | `(app)/settings/automation`, related APIs | **Split** |

---

## 8. SMS, voice, telephony

| Feature | Surfaces | Free / Paid |
|--------|----------|-------------|
| Twilio inbound | `api/twilio/inbound`, `status` | **Paid** |
| Outbound SMS | `api/sms/send` | **Paid** |
| Voice AI (Vapi / Retell) | `api/voice/*`, voice webhooks | **Paid** |
| SMS add-on / quota (Stripe) | `api/stripe/sms-addon` | **Paid** |

---

## 9. Email & Gmail

| Feature | Surfaces | Free / Paid |
|--------|----------|-------------|
| Send one-off email | `api/email/send` | **Paid** (SMTP/Gmail send + deliverability) |
| Gmail OAuth + watch + webhook | `api/integrations/gmail`, `gmail/watch`, `gmail/webhook` | **Paid** |
| Generic email integration | `api/integrations/email` | **Paid** |

---

## 10. Vehicles & inventory

| Feature | Surfaces | Free / Paid |
|--------|----------|-------------|
| Inventory list / filters | `(app)/vehicles`, filters | **Free** |
| Vehicle detail / edit / new | `(app)/vehicles/[id]`, `edit`, `new` | **Free** |
| Vehicle CRUD API | `api/vehicles`, `[id]`, `status`, `merge` | **Free** |
| Photos upload / reorder | `api/vehicles/[id]/photos` | **Paid** (storage) |
| Documents | `api/vehicles/[id]/documents` | **Paid** |
| Publish / VDP | `publish`, `post`, `view`, public `[slug]/inventory` | **Split** — **Free** minimal pages; traffic + images = **Paid** at scale |
| VIN decode / intake | `vehicles/intake/*` | **Split** — external data vendors often **Paid** |
| AI listing description | `api/vehicles/[id]/ai-description` | **Paid** (Anthropic) |
| Reanalyze / market check | `reanalyze`, `market-check` | **Paid** (external + compute) |
| Video / render queue | `video`, `render`, `webhooks/render-complete`, `cron/process-render-queue` | **Paid** |
| Video packs (Stripe) | `api/stripe/video-pack` | **Paid** |
| Inventory sync cron | `cron/sync-inventory`, `api/inventory/sync` | **Paid** |
| Feeds (CarGurus / Facebook) | `api/inventory/*-feed` | **Split** — generation cheap; partner traffic policy = product |
| Vehicle wants | `api/vehicle-wants` | **Free** |
| Carrying costs / mechanic notes / overview reflow | related `api/vehicles/[id]/*` | **Free** |
| Mark sold / BHPH finalize | `api/bhph/create` | **Free** DB writes; **Paid** if triggers SMS + AI learning aggregates |

---

## 11. BHPH & payments

| Feature | Surfaces | Free / Paid |
|--------|----------|-------------|
| BHPH portfolio UI | `(app)/bhph`, `[id]` | **Free** (read) |
| Deferred payments API | `api/bhph/deferred` | **Free** |
| Payment reminders cron | `api/bhph/remind` | **Paid** (SMS/email) |
| BHPH Stripe webhook | `api/bhph/webhook` | **Paid** |
| Customer pay link | `app/pay/[token]` | **Paid** (Stripe) |

---

## 12. Receipts & ledger

| Feature | Surfaces | `(app)/receipts`, ledger, `api/receipts/*` | **Split** — metadata **Free**; uploads/OCR/export volume **Paid** |
| Storage packs | `api/stripe/storage-pack` | **Paid** |

---

## 13. Fax

| Feature | Surfaces | `(app)/fax`, `api/fax/*` | **Paid** (provider) |

---

## 14. Pulse (CSAT / NPS-style)

| Feature | Surfaces | `(app)/pulse`, `actions`, `team`, `api/pulse/*`, public `pulse/[token]` | **Split** — collecting responses **Free**; SMS delivery **Paid** |

---

## 15. Analytics, dashboard, reports

| Feature | Surfaces | `(app)/dashboard`, `analytics`, `reports`, `api/dashboard/stats`, `analytics`, `reports`, `reports/ai-brief` | **Split** — internal dashboards **Free**; **AI brief** = **Paid** |
| Data export | `api/export`, ledger export | **Split** — small **Free**; large **Paid** |

---

## 16. Retention, referrals, cards

| Feature | Surfaces | `api/retention/*`, settings retention, `cron/card-batch`, `cron/retention-triggers` | **Paid** (print/mail + cron) |

---

## 17. Reviews (Google)

| Feature | Surfaces | settings reviews, `api/reviews/*`, `cron/poll-reviews` | **Paid** (Google API + cron) |

---

## 18. Social posting

| Feature | Surfaces | `(app)/settings/social`, `api/social/*`, `api/cron/daily-social`, `settings/social-posting` | **Paid** (Meta etc. + scheduling) |

---

## 19. Media & branding

| Feature | Surfaces | `api/media/upload`, `settings/website/*`, favicon/logo/og | **Split** — small assets **Free**; large packs **Paid** |

---

## 20. Intelligence & AI ops

| Feature | Surfaces | `api/intelligence/*`, `cron/daily-intelligence`, conversation scoring (if enabled in codebase) | **Paid** |
| Dealer goals | `api/intelligence/goals` | **Free** (stored targets); AI coaching against goals = **Paid** |

---

## 21. Booking (public)

| Feature | Surfaces | `app/book/[slug]`, `api/book/[slug]` | **Split** — low volume **Free**; notifications = variable **Paid** |

---

## 22. Transfers & affiliates (growth)

| Feature | Surfaces | `app/transfer/[token]`, `api/transfer/*`, admin affiliates | **Free** mechanics; incentives = business rule |

---

## 23. Support

| Feature | Surfaces | `(app)/support`, `api/support/*` | **Free** (ticketing UX); storage for attachments = **Paid** |

---

## 24. Settings (dealer)

| Feature | Surfaces | All `(app)/settings/*` pages + `api/settings/*` | Mostly **Free**; **billing**, **webhooks** (events), **video**, **social**, **telegram** lean **Paid** |
| Stripe customer portal / checkout / webhooks | `api/stripe/*` | **Paid** (billing product) |
| Webhooks outbound | `settings/webhooks` | **Free** code path; outbound volume = your infra |

---

## 25. Admin (platform / internal)

| Feature | Surfaces | `(app)/admin/*`, `api/admin/*` | **Not** a dealer “free vs paid” tier — internal ops. Still **cost** to you (support, impersonation, provisioning). |

---

## 26. Cron jobs (platform cost)

All under `api/cron/*` (account lifecycle, card batch, check tasks, daily intelligence, daily social, data retention, inventory pricing, poll reviews, render queue, billing reset, retention triggers, send sequences, sync inventory/leads, weekly performance): treat as **Paid / platform** — they drive third‑party usage or heavy compute.

---

## 27. Marketing / static site

| Feature | Surfaces | `app/page`, `blog/*`, `lp/*` | **Free** (CDN); forms that hit APIs inherit that API’s tier |

---

## Suggested packaging (high level)

**Free (or “Starter”)** — good faith, low variable cost  
- Auth, basic customer/vehicle/activity/task CRUD, manual calendar entries, pipeline stages, vehicle wants, small exports, onboarding without connected senders, basic Today **without** AI layers, public inventory **with** tight caps.

**Paid** — anything that hits your margin  
- **All LLM paths** (brief, description, scan, scoring, reports/ai-brief).  
- **All messaging** (SMS, outbound email at volume, voice, fax, BHPH reminders).  
- **Connected cloud** (Gmail sync/watch, Google Calendar, social APIs, review polling).  
- **Heavy media** (photos, docs, video render queue, large uploads).  
- **Automation at scale** (sequence cron, lead poller, inventory sync, daily social).  
- **Stripe add-ons** already modeled: SMS, storage, video packs, overage top-up.

**Split (metered or capped free)**  
- Web leads, segments, exports, VIN decode, public VDP traffic, booking.

---

## How to keep this list accurate

- Re-run: `find apollo-crm/app/api -name route.ts | sed …` after major releases.  
- Cross-check new `lib/**/*` for `process.env.*API*` and `createServiceClient` heavy jobs.  
- When you add **feature flags** in DB, mirror columns here for sales/legal.
