# DealerWyze Rebrand Plan
**From:** Apollo CRM / apollo-crm.vercel.app
**To:** DealerWyze / dealerwyze.com
**Scope:** Name change only — no feature changes
**Estimated effort:** 4–6 hours (spread over 2 days due to DNS propagation)
**Last updated:** 2026-03-02

---

## 1. Overview

This is a brand-only rename. No database schema changes, no API changes, no new features.

**What changes:**
- Product name: `Apollo CRM` → `DealerWyze`
- App URL: `apollo-crm.vercel.app` → `dealerwyze.com`
- Support email: `support@apollocrm.app` → `support@dealerwyze.com`
- LocalStorage keys (internal, transparent to users)

**What does NOT change:**
- Tim's dealership identity: "Apollo Auto" in SMS templates, BHPH messages, voice scripts — these are **Tim's business identity**, not the product brand. Leave them alone.
- `APOLLO_USER_ID` environment variable — internal technical identifier, not user-facing. Leave it.
- Phone numbers: (818) 873-3123, (805) 404-3873
- Tim's website: `apolloauto-em.com`
- Database schema, Supabase, migrations — nothing touches the DB
- GitHub repo name (optional — can rename later without consequence)
- Vercel project internal name (keep as `apollo-crm` to avoid breaking deploy CLI)

---

## 2. Order of Operations

**Do in this order.** DNS must propagate before webhooks can be updated.

```
Phase A — Infrastructure (Day 1, ~1 hour)
  1. Add dealerwyze.com as custom domain in Vercel
  2. Configure DNS at your registrar
  3. Update NEXT_PUBLIC_APP_URL env var in Vercel
  4. Verify dealerwyze.com resolves (may take up to 48h)

Phase B — Code changes (Day 1, ~2 hours)
  5. Apply all code changes listed in Section 3
  6. Commit + push to GitHub
  7. Deploy: cd apollo-crm && npx vercel --prod

Phase C — External systems (Day 2, after DNS confirmed, ~1 hour)
  8. Update Twilio webhook URLs
  9. Update Retell webhook URLs
  10. Update Stripe webhook endpoint
  11. Update cron-job.org URLs
  12. Update CarGurus / Facebook feed URLs (if registered)

Phase D — Verify (Day 2, ~30 min)
  13. Test SMS inbound/outbound
  14. Test voice callback
  15. Verify Stripe webhook fires
  16. Verify cron jobs respond 200
  17. Check PWA install prompt shows "DealerWyze"
```

---

## 3. Code Changes

### 3A. package.json
**File:** `apollo-crm/package.json`

```
"name": "apollo-crm"
→
"name": "dealer-wyze"
```

---

### 3B. PWA Manifest
**File:** `apollo-crm/public/manifest.json`

```json
"name": "Apollo Auto CRM"       → "DealerWyze"
"short_name": "Apollo CRM"      → "DealerWyze"
"description": "Mobile-first CRM for Apollo Auto dealership"
→ "The Intelligent Operating System for Independent Dealers"
```

Note: `.vercel/output/static/manifest.json` is a build artifact — auto-regenerated on deploy, no manual edit needed.

---

### 3C. App Metadata
**File:** `apollo-crm/app/layout.tsx`

```
title: 'Apollo Auto CRM'              → 'DealerWyze'
description: 'Mobile CRM for Apollo Auto' → 'The Intelligent Operating System for Independent Dealers'
title: 'Apollo CRM'  (PWA name)       → 'DealerWyze'
```

---

### 3D. Auth Pages
**File:** `app/(auth)/login/page.tsx`
```
<CardTitle>Apollo Auto CRM</CardTitle>   → <CardTitle>DealerWyze</CardTitle>
alt="Apollo Auto"                         → alt="DealerWyze"
placeholder="you@apolloauto.com"          → placeholder="you@example.com"
```

**File:** `app/(auth)/signup/page.tsx`
```
alt="Apollo Auto"                         → alt="DealerWyze"
placeholder="you@apolloauto.com"          → placeholder="you@example.com"
```

**File:** `app/(auth)/forgot-password/page.tsx`
```
alt="Apollo Auto"                         → alt="DealerWyze"
placeholder="you@apolloauto.com"          → placeholder="you@example.com"
```

---

### 3E. Landing Page
**File:** `components/landing/LandingPage.tsx`

| Find | Replace |
|------|---------|
| `Apollo CRM` (heading, line ~48) | `DealerWyze` |
| `Apollo CRM gives you one place...` | `DealerWyze gives you one place...` |
| `Running Apollo Auto as a small lot owner...` | Change to generic dealer testimonial |
| `— Tim, Owner · Apollo Auto · Los Angeles, CA` | Keep or update to generic (Tim's choice) |
| `Apollo CRM started as an internal tool...` | `DealerWyze started as an internal tool...` |
| `AutoTrader, CarGurus...land in Gmail and auto-import into Apollo.` | `...auto-import into DealerWyze.` |
| `support@apollocrm.app` (×2) | `support@dealerwyze.com` |
| `Apollo CRM by KMA Auto Inc` | `DealerWyze by KMA Auto Inc` |

---

### 3F. Billing Page
**File:** `app/(app)/settings/billing/page.tsx`

```
`Apollo CRM — ${PLAN_LABEL[smsPlan] ?? 'Active'}`
→
`DealerWyze — ${PLAN_LABEL[smsPlan] ?? 'Active'}`
```

---

### 3G. Support Thread Pages
**File:** `app/(app)/support/[id]/page.tsx`
```
'Apollo Support'   → 'DealerWyze Support'  (×2)
```

**File:** `app/(app)/admin/tickets/[id]/page.tsx`
```
'Apollo Support'   → 'DealerWyze Support'
```

---

### 3H. LocalStorage Keys
These are invisible to users but should be consistent with the new brand.

**File:** `components/settings/FontSizeSetting.tsx`
```
'apollo-font-size'   → 'dealerwyze-font-size'
```

**File:** `components/providers/FontSizeProvider.tsx`
```
'apollo-font-size'   → 'dealerwyze-font-size'
```

**File:** `components/today/OnboardingChecklist.tsx`
```
`apollo_onboarding_dismissed_${orgId}`   → `dealerwyze_onboarding_dismissed_${orgId}`
```

**File:** `components/call/usePendingCall.ts`
```
'apollo_pending_call'   → 'dealerwyze_pending_call'
```

> **Note:** Existing users will lose their font-size and onboarding-dismiss state on first load after deploy. This is cosmetic and one-time. Not worth a migration.

---

### 3I. URL Fallbacks in Code
These are fallback URLs used when `NEXT_PUBLIC_APP_URL` is not set. Since we're setting that env var, these matter only as safety nets.

**File:** `lib/stripe.ts` (line 15)
```
'https://apollo-crm.vercel.app'   → 'https://dealerwyze.com'
```

**File:** `lib/twilio/provision.ts` (line 9)
```
'https://apollo-crm.vercel.app'   → 'https://dealerwyze.com'
```

**File:** `app/api/twilio/inbound/route.ts` (line 68)
```
'https://apollo-crm.vercel.app'   → 'https://dealerwyze.com'
```

**File:** `app/api/fax/send/route.ts` (line 98)
```
'https://apollo-crm.vercel.app'   → 'https://dealerwyze.com'
```

---

### 3J. Code Comments (Low Priority)
These are doc comments only — not functional. Update for accuracy but not blocking.

| File | Line | Change |
|------|------|--------|
| `app/api/cron/reset-billing-cycle/route.ts` | 12 | URL in comment |
| `app/api/voice/tools/route.ts` | 11 | URL in comment |
| `app/api/voice/retell-callback/route.ts` | 49 | URL in comment |
| `app/api/voice/vapi-callback/route.ts` | 11 | URL in comment |
| `app/api/twilio/inbound/route.ts` | 15 | URL in comment |
| `app/api/bhph/webhook/route.ts` | 4 | URL in comment |
| `lib/intelligence/rss.ts` | 19 | User-Agent string `ApolloCRM/1.0` → `DealerWyze/1.0` |

---

### 3K. Legal Pages
**Files:** `public/terms.md` and `public/privacy.md`

These have `[PLACEHOLDER: confirm domain]` throughout — they need a full pass regardless of rebrand.

| Find | Replace |
|------|---------|
| `Apollo CRM` | `DealerWyze` |
| `apollocrm.app` | `dealerwyze.com` |
| `apollocrm.app/privacy-request` | `dealerwyze.com/privacy-request` |
| Domain references | `dealerwyze.com` |

> **Note:** These are already partially drafted as placeholders. The rebrand is a good forcing function to finalize them.

---

### 3L. SAAS_ROADMAP.md
**File:** `apollo-crm/SAAS_ROADMAP.md`

```
# Apollo CRM — SaaS Roadmap   → # DealerWyze — SaaS Roadmap
NEXT_PUBLIC_APP_URL=https://apollo-crm.vercel.app  → https://dealerwyze.com
```

---

## 4. Environment Variables

### Vercel Dashboard Changes Required

| Variable | Current | New Value |
|----------|---------|-----------|
| `NEXT_PUBLIC_APP_URL` | `https://apollo-crm.vercel.app` | `https://dealerwyze.com` |

### Variables to Leave Unchanged
| Variable | Why |
|----------|-----|
| `APOLLO_USER_ID` | Internal technical identifier — not user-facing. Renaming risks breaking things. Leave it. |
| `DEV_LOGIN_SECRET` | Internal dev secret. Not user-facing. |
| All Twilio keys | No change needed |
| All Retell keys | No change needed |
| All Stripe keys | No change needed |

---

## 5. External Systems (Manual Steps)

### 5A. Vercel — Add Custom Domain
1. Go to Vercel dashboard → Project `apollo-crm` → Settings → Domains
2. Add `dealerwyze.com`
3. Add `www.dealerwyze.com` (redirect to apex)
4. Vercel will give you DNS records to add

### 5B. DNS Registrar (wherever dealerwyze.com is registered)
Add the records Vercel provides. Typically:
```
A     @     76.76.21.21
CNAME www   cname.vercel-dns.com
```
DNS propagation: 15 minutes to 48 hours.

### 5C. Twilio — Update Webhook URLs
Go to Twilio Console → Phone Numbers → Manage → select dealer number:

| Webhook | Old URL | New URL |
|---------|---------|---------|
| SMS Incoming | `https://apollo-crm.vercel.app/api/twilio/inbound` | `https://dealerwyze.com/api/twilio/inbound` |
| Voice Incoming | `https://apollo-crm.vercel.app/api/...` | `https://dealerwyze.com/api/...` |
| Fax callback | `https://apollo-crm.vercel.app/api/fax/callback` | `https://dealerwyze.com/api/fax/callback` |

> ⚠️ **Do this AFTER dealerwyze.com DNS is confirmed live.** Switching before DNS resolves = dropped messages.

### 5D. Retell AI — Update Webhook URLs
Go to Retell dashboard → Agent settings:

| Setting | New Value |
|---------|-----------|
| Webhook URL | `https://dealerwyze.com/api/voice/retell-callback` |
| Tool Call Webhook URL | `https://dealerwyze.com/api/voice/tools?secret=<LEADS_POLL_SECRET>` |

> ⚠️ Same warning: do after DNS confirmed.

### 5E. Stripe — Update Webhook Endpoint
Go to Stripe Dashboard → Developers → Webhooks:
1. Add new endpoint: `https://dealerwyze.com/api/stripe/webhook`
2. Copy the new `STRIPE_WEBHOOK_SECRET` to Vercel env vars
3. Verify events are received on new endpoint
4. Disable/delete old `apollo-crm.vercel.app` endpoint

> ⚠️ Run both endpoints in parallel during transition (Stripe supports multiple endpoints).

### 5F. Cron-job.org — Update Job URLs
Update all jobs from `apollo-crm.vercel.app/...` to `dealerwyze.com/...`:

| Job | New URL |
|-----|---------|
| check-tasks | `https://dealerwyze.com/api/cron/check-tasks` |
| sync-leads | `https://dealerwyze.com/api/cron/sync-leads` |
| poll-reviews | `https://dealerwyze.com/api/cron/poll-reviews` |
| sync-inventory | `https://dealerwyze.com/api/cron/sync-inventory` |
| reset-billing-cycle | `https://dealerwyze.com/api/cron/reset-billing-cycle` |

### 5G. CarGurus / Facebook Business Manager
If inventory feed URLs were already registered:
- Old: `https://apollo-crm.vercel.app/api/inventory/cargurus-feed`
- New: `https://dealerwyze.com/api/inventory/cargurus-feed`
- Old: `https://apollo-crm.vercel.app/api/inventory/facebook-feed`
- New: `https://dealerwyze.com/api/inventory/facebook-feed`

### 5H. Support Email
Set up `support@dealerwyze.com` email inbox before deploying (so the landing page contact link works). Options:
- Cloudflare Email Routing (free — forward to your Gmail)
- Google Workspace (paid)
- Resend inbound (if using Resend already)

---

## 6. What apollo-crm.vercel.app Becomes

After dealerwyze.com is live, `apollo-crm.vercel.app` still works (Vercel keeps it). Options:
- **Leave it** — it just works as a backup. No action needed.
- **Redirect it** — add a Next.js redirect in `next.config.ts` to 301 → dealerwyze.com (good for SEO if any links exist)

Recommended: leave it active for 30 days, then redirect.

---

## 7. Files NOT Changing (Confirmed)

These contain "Apollo Auto" but refer to **Tim's dealership identity**, not the product:

| File | Reason to keep |
|------|---------------|
| `lib/bhph/messages.ts` | BHPH SMS messages are from Tim's dealership |
| `lib/bhph/send.ts` | Email from `payments@apolloauto-em.com` |
| `lib/voice/ingest.ts` | "Tim from Apollo Auto" — his personal identity |
| `lib/voice/summarize.ts` | Prompt context for Tim's business |
| `components/sms/TemplatePicker.tsx` | SMS templates with "Apollo Auto" are Tim's templates |
| `components/leads/NewLeadCard.tsx` | Email follow-up templates |
| `components/leads/EmailFollowUpItem.tsx` | Email templates |
| `components/customer/EmailButton.tsx` | Email templates |
| `app/api/cron/check-tasks/route.ts` (line 197) | Appointment reminder SMS from Tim's lot |
| `app/api/twilio/inbound/route.ts` (lines 339, 365) | TCPA opt-out/in text — uses Tim's business name |
| `app/api/bhph/webhook/route.ts` (line 72) | BHPH opt-in disclosure |
| `app/api/inventory/sync/route.ts` | Points to Tim's website `apolloauto-em.com` |
| `lib/inventory/feeds.ts` (line 58) | Inventory description mentions "Apollo Auto, El Monte CA" |
| `app/(app)/settings/page.tsx` (line 279) | Tim's dealership website link |
| `app/api/admin/provision-voice/route.ts` | Fallback to `org?.name` (correct) |
| `app/api/intelligence/briefing/route.ts` | Fallback to `org?.name` (correct) |
| `app/api/admin/provision-phone/route.ts` | Twilio number label uses `dealershipName` (correct) |

---

## 8. Difficulty Assessment

| Area | Difficulty | Notes |
|------|-----------|-------|
| Code changes | **Low** | ~15 files, mostly string replacements |
| Vercel domain setup | **Low** | Standard custom domain flow |
| DNS setup | **Low** | Standard A + CNAME records |
| Twilio webhook update | **Low** | 2–3 URL changes in console |
| Retell webhook update | **Low** | 2 URL changes in dashboard |
| Stripe webhook update | **Medium** | New endpoint + new secret + parallel testing |
| Cron job updates | **Low** | URL changes in cron-job.org |
| Legal pages | **Medium** | Need to finalize placeholders while updating brand |
| LocalStorage migration | **None** | Users just reset their preference once |

**Overall: Low-Medium difficulty. Biggest risk is sequencing (DNS before webhooks).**

---

## 9. Rollback Plan

Everything is backward-compatible during transition:
- `apollo-crm.vercel.app` continues to work while `dealerwyze.com` is being set up
- Run both Stripe webhook endpoints in parallel until confirmed
- Code changes are pure string replacements — easy to revert via git

If something breaks after deploy:
```bash
cd /home/tim/Applications/ApolloCRM/apollo-crm
git revert HEAD
npx vercel --prod
```

---

## 10. Post-Rebrand Checklist

- [ ] `dealerwyze.com` loads the app correctly
- [ ] PWA "Install App" prompt shows "DealerWyze"
- [ ] Login page shows "DealerWyze"
- [ ] Billing page shows "DealerWyze — ..."
- [ ] Support page shows "DealerWyze Support"
- [ ] Inbound SMS still routes correctly (Twilio webhook updated)
- [ ] Voice calls still route correctly (Retell webhook updated)
- [ ] Stripe payments still work (webhook + secret updated)
- [ ] All cron jobs return 200
- [ ] Inventory feeds accessible at new URLs
- [ ] `support@dealerwyze.com` email is working
- [ ] Legal pages updated and finalized
- [ ] ROADMAP.md + MEMORY.md updated

---

## 11. Future (Not in This Rebrand)

These are hardcoded dealer-specific items that would need to be org-configurable for a true multi-tenant SaaS. Out of scope now:

- `app/(app)/today/TodayContent.tsx` — hardcoded "Apollo Auto" header (should read `org.name`)
- `components/calendar/AddAppointmentSheet.tsx` — hardcoded `location: 'Apollo Auto'` (should read `org.name`)
- `components/customer/AddTaskModal.tsx` — "@ Apollo Auto" in task title (should be dynamic)
- BHPH messages using "Apollo Auto" — should use `org.name` in true multi-tenant mode
