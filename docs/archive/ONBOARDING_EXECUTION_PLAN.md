# DealerWyze — Dealer Onboarding: Execution Plan

**Version:** 1.0
**Date:** 2026-03-03
**Reference PRD:** `ONBOARDING_PRD.md`
**Status:** Ready for implementation

---

## What Already Exists (do not rebuild)

- ✅ Onboarding wizard — 5-step at `/onboarding` (`app/(onboarding)/onboarding/page.tsx`)
- ✅ `org_settings.onboarding_step` and `onboarding_completed_at` columns
- ✅ `(app)/layout.tsx` redirects dealers with null `onboarding_completed_at` to `/onboarding`
- ✅ OnboardingChecklist widget on Today (7-day post-completion)
- ✅ Resend API key set in Vercel env vars
- ✅ Support ticket system (`/support`, `/admin/tickets`)
- ✅ `organizations.approved_at` column (migration 039 — Phase 1 of SAAS_CHECKLIST)
- ✅ `/admin/orgs/[id]` detail page (needs onboarding fields added)

---

## Phase Overview

```
Phase A — Database (migration 040_onboarding_emails.sql)
Phase B — Email Service (lib/email/onboarding.ts)
Phase C — Email Triggers (hook into existing event points)
Phase D — Pending Approval Page (/pending)
Phase E — Wizard Refinements (existing wizard improvements)
Phase F — Admin Visibility (onboarding status on /admin/orgs/[id])
Phase G — Automated Follow-up Emails (day 3, 7, 14 cron)
```

Critical path: **A → B → C → D**. E, F, G can run in parallel after B.

---

## Phase A — Database

**File:** `supabase/migrations/040_onboarding_emails.sql`

```sql
-- ============================================================
-- 040_onboarding_emails.sql
-- Onboarding email log + unsubscribe flag
-- Apply in Supabase SQL editor
-- ============================================================

-- 1. Email log — tracks every onboarding email sent
CREATE TABLE IF NOT EXISTS onboarding_email_log (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email_type        TEXT        NOT NULL,  -- 'welcome', 'approved', 'setup_complete',
                                           -- 'day3', 'day7', 'day14'
  recipient_email   TEXT        NOT NULL,
  sent_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resend_message_id TEXT,                  -- Resend API response ID for tracking
  error             TEXT                   -- NULL = sent OK; non-null = failure reason
);

CREATE INDEX IF NOT EXISTS idx_onboarding_email_log_org
  ON onboarding_email_log (org_id, email_type);

-- 2. Unsubscribe flag + token on org_settings
ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS onboarding_emails_unsubscribed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS onboarding_unsubscribe_token   TEXT;

-- Generate unsubscribe tokens for any existing orgs that don't have one
-- (Run once — new orgs get the token set in the register route)
UPDATE org_settings
SET onboarding_unsubscribe_token = encode(gen_random_bytes(32), 'hex')
WHERE onboarding_unsubscribe_token IS NULL;

-- 3. Helper function: has this email type already been sent to this org?
-- Used to prevent duplicate sends on retry/crash
CREATE OR REPLACE FUNCTION onboarding_email_sent(p_org_id UUID, p_email_type TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM onboarding_email_log
    WHERE org_id = p_org_id
      AND email_type = p_email_type
      AND error IS NULL
  );
$$;
```

**Apply:** Supabase SQL editor. Verify with:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'org_settings'
  AND column_name IN ('onboarding_emails_unsubscribed', 'onboarding_unsubscribe_token');

SELECT COUNT(*) FROM onboarding_email_log;  -- should be 0 (new table)
```

---

## Phase B — Email Service

**New file:** `lib/email/onboarding.ts`

This module owns all onboarding email logic: template rendering, sending via Resend, and logging.

### File structure

```typescript
// lib/email/onboarding.ts

import { Resend } from 'resend'
import { createServiceClient } from '@/lib/supabase/service'
import { PLAN_LABEL, PLAN_PRICE, PlanTier } from '@/lib/stripe'
import { logger } from '@/lib/logger'

const resend = new Resend(process.env.RESEND_API_KEY!)
const FROM   = 'DealerWyze <onboarding@dealerwyze.com>'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://dealerwyze.com'

// ── Types ───────────────────────────────────────────────────────────────────

export type OnboardingEmailType =
  | 'welcome'        // Email 1 — sent on signup (pending approval)
  | 'approved'       // Email 2 — sent when SuperAdmin approves
  | 'setup_complete' // Email 3 — sent when wizard step 5 completes
  | 'day3'           // Email 4 — 3 days after wizard complete
  | 'day7'           // Email 5 — 7 days after wizard complete
  | 'day14'          // Email 6 — 14 days after wizard complete

interface OrgContext {
  orgId:         string
  orgName:       string
  ownerName:     string
  ownerEmail:    string
  plan:          PlanTier
  hasPhone:      boolean   // twilio_phone_number IS NOT NULL
  hasVoice:      boolean   // retell_agent_id IS NOT NULL
  hasLeadEmail:  boolean   // email_accounts count > 0
  leadCount:     number    // customers count
  smsCount:      number    // activities count type=sms this month
  unsubToken:    string
}

// ── Guard: already sent? ────────────────────────────────────────────────────

export async function alreadySent(orgId: string, type: OnboardingEmailType): Promise<boolean> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .rpc('onboarding_email_sent', { p_org_id: orgId, p_email_type: type })
  return data === true
}

// ── Log: record send attempt ────────────────────────────────────────────────

async function logEmail(
  orgId: string,
  type: OnboardingEmailType,
  recipient: string,
  messageId: string | null,
  error: string | null
) {
  const supabase = createServiceClient()
  await supabase.from('onboarding_email_log').insert({
    org_id: orgId,
    email_type: type,
    recipient_email: recipient,
    resend_message_id: messageId,
    error,
  })
}

// ── Unsubscribe URL ─────────────────────────────────────────────────────────

function unsubUrl(token: string): string {
  return `${APP_URL}/unsubscribe?token=${token}`
}

// ── Send helper ─────────────────────────────────────────────────────────────

async function send(
  orgId: string,
  type: OnboardingEmailType,
  to: string,
  subject: string,
  html: string,
  text: string
): Promise<void> {
  try {
    const { data, error } = await resend.emails.send({ from: FROM, to, subject, html, text })
    if (error) {
      logger.error({ org_id: orgId, type, error }, 'onboarding email send failed')
      await logEmail(orgId, type, to, null, JSON.stringify(error))
    } else {
      await logEmail(orgId, type, to, data?.id ?? null, null)
      logger.info({ org_id: orgId, type, to }, 'onboarding email sent')
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await logEmail(orgId, type, to, null, msg)
    logger.error({ org_id: orgId, type, err }, 'onboarding email exception')
  }
}
```

### Email 1 — Welcome (plan-aware)

```typescript
export async function sendWelcomeEmail(ctx: OrgContext): Promise<void> {
  if (await alreadySent(ctx.orgId, 'welcome')) return

  const smsSection = (ctx.plan === 'tier2' || ctx.plan === 'tier3') ? `
<h3>For SMS Messaging</h3>
<p>You'll get a dedicated local phone number for texting your customers. You have two options:</p>
<ul>
  <li><strong>Option A</strong> — Get a new number (we set it up, free)</li>
  <li><strong>Option B</strong> — Port your existing number (3–7 business days; you'll need your carrier account info)</li>
</ul>
<p>Not sure? Start with Option A — you can always port later.</p>
` : ''

  const voiceSection = ctx.plan === 'tier3' ? `
<h3>For Your AI Voice Assistant</h3>
<ul>
  <li>Your Google account login (for Calendar sync)</li>
  <li>Your business hours</li>
  <li>What name you want the AI to use (e.g., "Hi, thanks for calling [Business Name]!")</li>
  <li>Your inventory website URL (optional — the voice agent can look up vehicles)</li>
</ul>
` : ''

  const html = `
<p>Hi ${ctx.ownerName},</p>
<p>Welcome to DealerWyze! We're excited to have <strong>${ctx.orgName}</strong> on board.</p>
<p>Your account is being reviewed and will be approved within <strong>1 business day</strong>.
While you wait, here's what to have ready — it makes setup go much faster.</p>

<h3>What Every Dealer Needs</h3>
<ul>
  <li>Your dealership's exact business name (as customers will see it in texts)</li>
  <li>Your main business phone number and address</li>
  <li>The email address where you receive leads from CarGurus, AutoTrader, OfferUp, or Facebook Marketplace</li>
</ul>

${smsSection}
${voiceSection}

<h3>What Our Team Handles For You</h3>
<ul>
  <li>✓ Your SMS phone number (provisioned within 24 hours of approval)</li>
  <li>✓ Your AI voice agent setup (within 48 hours)</li>
  <li>✓ Connecting your lead email to DealerWyze</li>
  <li>✓ Any technical questions — just reply to this email</li>
</ul>

<p>You'll hear from us within 1 business day.</p>
<p>Questions? Reply to this email — a real person reads it.</p>
<p>— The DealerWyze Team<br>support@dealerwyze.com</p>
<hr>
<small><a href="${unsubUrl(ctx.unsubToken)}">Unsubscribe from onboarding emails</a></small>
`

  const text = `Hi ${ctx.ownerName},\n\nWelcome to DealerWyze! Your account is under review and will be approved within 1 business day.\n\nWhile you wait, have these ready:\n- Your exact business name\n- Business phone + address\n- The email where you receive CarGurus/AutoTrader/Facebook leads\n\nOur team handles: phone number setup, voice agent config, and technical questions.\n\nQuestions? Reply here.\n\n— The DealerWyze Team\n\nUnsubscribe: ${unsubUrl(ctx.unsubToken)}`

  await send(ctx.orgId, 'welcome', ctx.ownerEmail,
    'Welcome to DealerWyze — here\'s what to have ready', html, text)
}
```

### Email 2 — Approved

```typescript
export async function sendApprovedEmail(ctx: OrgContext): Promise<void> {
  if (await alreadySent(ctx.orgId, 'approved')) return

  const teamItems = ctx.plan === 'tier3' ? `
  <li>Step 3 — Connect your lead email (3 min)</li>
  <li>Step 4 — Invite your team (optional)</li>
` : `
  <li>Step 3 — Connect your lead email (3 min)</li>
  <li>Step 4 — Invite your team (optional)</li>
`

  const backgroundItems = ctx.plan !== 'tier1' ? `
<h3>While You Set Up, We're Working On:</h3>
<ul>
  ${ctx.plan === 'tier2' || ctx.plan === 'tier3' ? '<li>📱 Your SMS phone number — ready within 24 hours</li>' : ''}
  ${ctx.plan === 'tier3' ? '<li>🎙️ Your AI voice assistant — configured within 48 hours</li>' : ''}
</ul>
` : ''

  const html = `
<p>Hi ${ctx.ownerName},</p>
<p>Great news — your DealerWyze account for <strong>${ctx.orgName}</strong> is approved!</p>
<p><a href="${APP_URL}/onboarding" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Get Started →</a></p>
<p>Your setup takes about 10 minutes:</p>
<ol>
  <li>Step 1 — Confirm your business info (2 min)</li>
  <li>Step 2 — Choose your plan (already selected — just confirm)</li>
  ${teamItems}
  <li>Step 5 — Done ✓</li>
</ol>
${backgroundItems}
<p>Need help? Reply here or open a support ticket from inside the app.</p>
<p>— The DealerWyze Team</p>
<hr>
<small><a href="${unsubUrl(ctx.unsubToken)}">Unsubscribe from onboarding emails</a></small>
`

  const text = `Hi ${ctx.ownerName},\n\nYour DealerWyze account is approved!\n\nGet started: ${APP_URL}/onboarding\n\nSetup takes about 10 minutes.\n\n— The DealerWyze Team\n\nUnsubscribe: ${unsubUrl(ctx.unsubToken)}`

  await send(ctx.orgId, 'approved', ctx.ownerEmail,
    `You're approved — time to set up ${ctx.orgName}`, html, text)
}
```

### Email 3 — Setup Complete (implement similarly — see PRD §4 for content)
### Email 4 — Day 3 (conditional on lead count — see PRD §4)
### Email 5 — Day 7 (includes weekly stats — see PRD §4)
### Email 6 — Day 14 (plan-aware feature spotlight — see PRD §4)

> All six functions follow the same pattern: `alreadySent()` guard → build html/text → `send()` → logged automatically.

---

## Phase C — Email Triggers

Wire `sendWelcomeEmail` and `sendApprovedEmail` into existing event points. Day 3/7/14 go into the cron job.

### Trigger 1 — Welcome email on signup

**File:** `app/api/auth/register/route.ts`

After successfully creating the org and profile, add (use `after()` from `next/server` for non-blocking):

```typescript
import { after } from 'next/server'
import { sendWelcomeEmail } from '@/lib/email/onboarding'
import { buildOrgContext } from '@/lib/email/onboarding'

// After org created successfully:
after(async () => {
  const ctx = await buildOrgContext(orgId)
  if (ctx) await sendWelcomeEmail(ctx)
})
```

### Trigger 2 — Approved email on admin approval

**File:** `app/api/admin/orgs/[id]/approve/route.ts` (Phase 2 of SAAS_CHECKLIST)

```typescript
import { after } from 'next/server'
import { sendApprovedEmail, buildOrgContext } from '@/lib/email/onboarding'

// After setting approved_at in DB:
after(async () => {
  const ctx = await buildOrgContext(orgId)
  if (ctx) await sendApprovedEmail(ctx)
})
```

### Trigger 3 — Setup complete email when wizard finishes

**File:** `app/api/settings/org/route.ts` (the PATCH endpoint the wizard calls)

When `onboarding_completed_at` transitions from NULL to a value:

```typescript
// Detect transition: if body contains onboarding_completed_at and current value is NULL
if (updates.onboarding_completed_at && !currentSettings?.onboarding_completed_at) {
  after(async () => {
    const ctx = await buildOrgContext(orgId)
    if (ctx) await sendSetupCompleteEmail(ctx)
  })
}
```

### Trigger 4 — Day 3 / Day 7 / Day 14 via cron

**File:** `app/api/cron/check-tasks/route.ts` — add a new job to the existing daily cron.

```typescript
// Job 7 — Onboarding follow-up emails
// Runs daily; checks each org's onboarding_completed_at and sends the right email

const { data: orgs } = await supabase
  .from('org_settings')
  .select('org_id, onboarding_completed_at, onboarding_emails_unsubscribed')
  .not('onboarding_completed_at', 'is', null)
  .eq('onboarding_emails_unsubscribed', false)

for (const org of orgs ?? []) {
  const completedAt = new Date(org.onboarding_completed_at)
  const now = new Date()
  const daysSince = Math.floor((now.getTime() - completedAt.getTime()) / 86400000)

  const ctx = await buildOrgContext(org.org_id)
  if (!ctx) continue

  if (daysSince >= 3  && daysSince < 4)  await sendDay3Email(ctx)
  if (daysSince >= 7  && daysSince < 8)  await sendDay7Email(ctx)
  if (daysSince >= 14 && daysSince < 15) await sendDay14Email(ctx)
}
```

---

## Phase D — Pending Approval Page

**New file:** `app/(app)/pending/page.tsx`

> **Note:** This is also required by Phase 2 of `SAAS_CHECKLIST.md`. Build it once here.

```typescript
// app/(app)/pending/page.tsx
// Server component — shown to dealers whose org has approved_at = NULL

import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { isDealerAdmin } from '@/types/index'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function PendingPage() {
  const profile = await requireProfile()
  if (!isDealerAdmin(profile.role)) redirect('/today')

  const supabase = createServiceClient()
  const { data: org } = await supabase
    .from('organizations')
    .select('name, approved_at, rejection_reason, created_at')
    .eq('id', profile.org_id)
    .single()

  if (org?.approved_at) redirect('/onboarding')

  const { data: settings } = await supabase
    .from('org_settings')
    .select('plan, dealer_cell_number')
    .eq('org_id', profile.org_id)
    .single()

  const plan = (settings?.plan ?? 'tier1') as 'tier1' | 'tier2' | 'tier3'
  const showSms   = plan === 'tier2' || plan === 'tier3'
  const showVoice = plan === 'tier3'

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
      <div className="w-full max-w-lg space-y-6">

        {/* Status banner */}
        {org?.rejection_reason ? (
          <div className="rounded-lg border border-destructive p-5 space-y-2">
            <h1 className="text-lg font-semibold text-destructive">Account Not Approved</h1>
            <p className="text-sm text-muted-foreground">{org.rejection_reason}</p>
            <p className="text-sm">
              Questions? <a href="mailto:support@dealerwyze.com" className="underline">Email our team</a>
            </p>
          </div>
        ) : (
          <div className="rounded-lg border p-5 space-y-2">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-yellow-400 animate-pulse" />
              <h1 className="text-lg font-semibold">Your account is under review</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              A member of the DealerWyze team will review <strong>{org?.name}</strong> and
              send you an approval email within <strong>1 business day</strong>.
            </p>
          </div>
        )}

        {/* What to have ready */}
        {!org?.rejection_reason && (
          <div className="rounded-lg border p-5 space-y-4">
            <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
              While you wait — have these ready
            </h2>

            <ul className="space-y-2 text-sm">
              <li className="flex gap-2"><span>□</span> Your exact business name (as customers will see it in texts)</li>
              <li className="flex gap-2"><span>□</span> Your main business phone number and address(es)</li>
              <li className="flex gap-2"><span>□</span> The email where you receive CarGurus, AutoTrader, or Facebook leads</li>
            </ul>

            {showSms && (
              <>
                <h3 className="font-medium text-sm pt-2">For SMS Messaging</h3>
                <ul className="space-y-2 text-sm">
                  <li className="flex gap-2"><span>□</span> Do you want a new phone number, or port your existing one?</li>
                  <li className="flex gap-2 text-muted-foreground">
                    <span> </span> If porting: have your current carrier account number ready (takes 3–7 business days)
                  </li>
                </ul>
              </>
            )}

            {showVoice && (
              <>
                <h3 className="font-medium text-sm pt-2">For Your AI Voice Assistant</h3>
                <ul className="space-y-2 text-sm">
                  <li className="flex gap-2"><span>□</span> Your Google account (for Calendar sync)</li>
                  <li className="flex gap-2"><span>□</span> Your business hours</li>
                  <li className="flex gap-2"><span>□</span> What name the AI should use when greeting callers</li>
                  <li className="flex gap-2"><span>□</span> Your inventory website URL (optional)</li>
                </ul>
              </>
            )}
          </div>
        )}

        {/* Support */}
        <p className="text-sm text-center text-muted-foreground">
          Questions? <a href="mailto:support@dealerwyze.com" className="underline">support@dealerwyze.com</a>
        </p>

      </div>
    </main>
  )
}
```

---

## Phase E — Wizard Refinements

Changes to `app/(onboarding)/onboarding/page.tsx` and related components.

### E.1 — Step 1: Add satellite lot + lead source question

```typescript
// Add to Step1 form fields:
const [lot2Address, setLot2Address] = useState('')
const [leadSource, setLeadSource] = useState<string>('gmail')

// Lead source options:
const LEAD_SOURCES = [
  { value: 'gmail',   label: 'Gmail' },
  { value: 'yahoo',   label: 'Yahoo Mail' },
  { value: 'outlook', label: 'Outlook / Office 365' },
  { value: 'other',   label: 'Other email' },
  { value: 'none',    label: "I don't get online leads yet" },
]

// Save to org_settings via PATCH:
// satellite_address: lot2Address (new field in org_settings — add to migration 039 or 040)
// lead_source_hint: leadSource (for conditional email step messaging)
```

### E.2 — Step 2: "Not sure?" help text

```tsx
// Add below plan cards:
<p className="text-xs text-center text-muted-foreground mt-3">
  Not sure which plan? Start with <strong>Basic CRM</strong> — you can upgrade at any time
  from Settings → Billing.
</p>
```

### E.3 — Step 3: Email connect explainer

```tsx
// Add above the Gmail / IMAP buttons:
<div className="rounded-md bg-muted p-3 text-sm text-muted-foreground mb-4">
  <strong>What is this?</strong> This is the inbox where CarGurus, AutoTrader,
  and Facebook Marketplace send you lead notification emails. DealerWyze reads
  those emails automatically so every lead lands in your CRM — usually within
  15 minutes.
</div>
<button onClick={() => setSkipped(true)} className="text-xs text-muted-foreground underline">
  I'll set this up later
</button>
```

### E.4 — Step 4: Role descriptions in invite form

```tsx
const ROLE_OPTIONS = [
  { value: 'dealer_admin',   label: 'Admin',    desc: 'Full access — manages billing and settings' },
  { value: 'dealer_manager', label: 'Manager',  desc: 'All leads and reports, no billing' },
  { value: 'dealer_rep',     label: 'Sales Rep', desc: 'Sees only leads assigned to them' },
  { value: 'dealer_staff',   label: 'Staff',    desc: 'Full operational access, no admin' },
]

// Replace the current role selector with this list
// Each option shows label + desc
```

### E.5 — Step 5: Personalized "what's running" summary

```tsx
// Replace generic done screen with dynamic summary:
<div className="space-y-3">
  <h2 className="text-xl font-semibold">You're set up!</h2>

  <div className="rounded-lg border divide-y text-sm">
    <div className="flex justify-between p-3">
      <span>Plan</span>
      <span className="font-medium">{PLAN_LABEL[plan]} — ${PLAN_PRICE[plan]}/mo</span>
    </div>
    <div className="flex justify-between p-3">
      <span>Lead email</span>
      <span className={hasEmail ? 'text-green-600' : 'text-yellow-600'}>
        {hasEmail ? 'Connected ✓' : 'Pending setup'}
      </span>
    </div>
    <div className="flex justify-between p-3">
      <span>SMS number</span>
      <span className={hasPhone ? 'text-green-600' : 'text-yellow-600'}>
        {hasPhone ? phone : plan !== 'tier1' ? 'Being provisioned (24h)' : 'Not on this plan'}
      </span>
    </div>
    {plan === 'tier3' && (
      <div className="flex justify-between p-3">
        <span>Voice assistant</span>
        <span className="text-yellow-600">Being configured (48h)</span>
      </div>
    )}
  </div>

  {/* DealerWyze team items */}
  {plan !== 'tier1' && (
    <div className="rounded-md bg-muted p-3 text-sm space-y-1">
      <p className="font-medium">Our team is handling:</p>
      {(plan === 'tier2' || plan === 'tier3') && (
        <p>📱 SMS phone number — ready within 24 hours</p>
      )}
      {plan === 'tier3' && (
        <p>🎙️ Voice assistant setup — ready within 48 hours</p>
      )}
      <p className="text-muted-foreground text-xs">
        You'll get an email when each item is live.
      </p>
    </div>
  )}
</div>
```

---

## Phase F — Admin Visibility

### F.1 — Onboarding status on `/admin/orgs/[id]/page.tsx`

Add an "Onboarding Status" card to the org detail page:

```typescript
// Fetch alongside existing org data:
const [emailLog, emailAccounts, lastActivity] = await Promise.allSettled([
  supabase
    .from('onboarding_email_log')
    .select('email_type, sent_at, error')
    .eq('org_id', orgId)
    .order('sent_at', { ascending: true }),
  supabase
    .from('email_accounts')
    .select('id, email, provider')
    .eq('org_id', orgId),
  supabase
    .from('customers')
    .select('created_at')
    .eq('user_id', orgId)
    .order('created_at', { ascending: false })
    .limit(1),
])
```

Render as a table:

| Field | Value |
|-------|-------|
| Signed up | `organizations.created_at` |
| Approved | `organizations.approved_at` or "Pending" |
| Wizard complete | `org_settings.onboarding_completed_at` or "Not complete" |
| Lead email | Connected (N accounts) / Not connected |
| SMS number | Phone number or "Not provisioned" |
| Voice agent | Agent ID or "Not provisioned" |
| Last customer added | Date from customers query |
| Emails sent | List of sent email types with timestamps |
| Any email errors | Highlight in red |

### F.2 — "In Onboarding" count on `/admin/page.tsx`

```typescript
// Add to existing admin dashboard query:
const { count: inOnboarding } = await supabase
  .from('org_settings')
  .select('org_id', { count: 'exact', head: true })
  .not('org_id', 'eq', '00000000-0000-0000-0000-000000000001')
  .is('onboarding_completed_at', null)
  // only for approved orgs:
  // (join with organizations WHERE approved_at IS NOT NULL)

const { count: stalled } = await supabase
  .from('org_settings')
  // approved 7+ days ago, wizard not complete
  // ... requires join with organizations
```

Add summary cards: **In Onboarding** and **Stalled (7+ days)**.

---

## Phase G — Automated Follow-up Emails (Cron)

**File:** `app/api/cron/check-tasks/route.ts` — add Job 7.

The cron already runs daily. Add this job at the end of the job list:

```typescript
// ─── Job 7: Onboarding follow-up emails ────────────────────────────────────
{
  const { data: pendingOrgs } = await supabase
    .from('org_settings')
    .select('org_id, onboarding_completed_at, onboarding_emails_unsubscribed')
    .not('onboarding_completed_at', 'is', null)
    .eq('onboarding_emails_unsubscribed', false)

  for (const org of pendingOrgs ?? []) {
    try {
      const completedAt = new Date(org.onboarding_completed_at)
      const daysSince = Math.floor((Date.now() - completedAt.getTime()) / 86400000)
      const ctx = await buildOrgContext(org.org_id)
      if (!ctx) continue

      if (daysSince >= 3  && daysSince < 4)  await sendDay3Email(ctx)
      if (daysSince >= 7  && daysSince < 8)  await sendDay7Email(ctx)
      if (daysSince >= 14 && daysSince < 15) await sendDay14Email(ctx)
    } catch (err) {
      logger.error({ org_id: org.org_id, err }, 'Job 7: onboarding email error')
    }
  }
}
```

---

## Unsubscribe Route

**New file:** `app/api/unsubscribe/route.ts` + `app/(auth)/unsubscribe/page.tsx`

```typescript
// GET /api/unsubscribe?token=xxx
// Sets org_settings.onboarding_emails_unsubscribed = true for the matching token

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token')
  if (!token) return NextResponse.redirect('/unsubscribed?status=invalid')

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('org_settings')
    .update({ onboarding_emails_unsubscribed: true })
    .eq('onboarding_unsubscribe_token', token)
    .select('org_id')

  if (!data?.length) return NextResponse.redirect('/unsubscribed?status=invalid')
  return NextResponse.redirect('/unsubscribed?status=ok')
}
```

---

## buildOrgContext Helper

This function is called by every email sender. Centralizes all DB lookups.

**File:** `lib/email/onboarding.ts` (add to same file)

```typescript
export async function buildOrgContext(orgId: string): Promise<OrgContext | null> {
  const supabase = createServiceClient()

  const [orgRes, settingsRes, profileRes, emailAccountsRes, customerCountRes] =
    await Promise.allSettled([
      supabase.from('organizations').select('name').eq('id', orgId).single(),
      supabase.from('org_settings')
        .select('plan, twilio_phone_number, retell_agent_id, onboarding_unsubscribe_token')
        .eq('org_id', orgId).single(),
      supabase.from('profiles')
        .select('display_name, email:auth.users(email)')
        .eq('org_id', orgId)
        .eq('role', 'dealer_admin')  // or 'admin'
        .limit(1).single(),
      supabase.from('email_accounts').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
      supabase.from('customers').select('id', { count: 'exact', head: true }).eq('user_id', orgId),
    ])

  const org      = orgRes.status      === 'fulfilled' ? orgRes.value.data      : null
  const settings = settingsRes.status === 'fulfilled' ? settingsRes.value.data : null
  const profile  = profileRes.status  === 'fulfilled' ? profileRes.value.data  : null

  if (!org || !settings || !profile) {
    logger.warn({ orgId }, 'buildOrgContext: missing org/settings/profile')
    return null
  }

  const emailCount   = emailAccountsRes.status === 'fulfilled' ? (emailAccountsRes.value.count ?? 0) : 0
  const customerCount = customerCountRes.status === 'fulfilled' ? (customerCountRes.value.count ?? 0) : 0

  return {
    orgId,
    orgName:       org.name ?? 'Your Dealership',
    ownerName:     profile.display_name ?? 'there',
    ownerEmail:    (profile as any).email?.email ?? '',  // Supabase join
    plan:          (settings.plan ?? 'tier1') as PlanTier,
    hasPhone:      !!settings.twilio_phone_number,
    hasVoice:      !!settings.retell_agent_id,
    hasLeadEmail:  emailCount > 0,
    leadCount:     customerCount,
    smsCount:      0,   // populated in day7 email only
    unsubToken:    settings.onboarding_unsubscribe_token ?? '',
  }
}
```

---

## New Env Vars Required

| Var | Value | Notes |
|-----|-------|-------|
| `RESEND_FROM_DOMAIN` | `dealerwyze.com` | Already set; verify `onboarding@dealerwyze.com` is a valid sender in Resend |
| No new vars needed | — | Resend API key already set |

**Resend setup:**
- Add `onboarding@dealerwyze.com` as a sender in Resend dashboard
- Verify the domain `dealerwyze.com` in Resend (likely already done for BHPH emails)

---

## Checklist

### Phase A — Database
- 🔲 Write `040_onboarding_emails.sql`
- 🔲 Apply in Supabase SQL editor
- 🔲 Verify `onboarding_email_log` table created
- 🔲 Verify `onboarding_unsubscribe_token` generated for all existing orgs

### Phase B — Email Service
- 🔲 Create `lib/email/onboarding.ts`
- 🔲 Implement `buildOrgContext()`
- 🔲 Implement `sendWelcomeEmail()` (plan-aware)
- 🔲 Implement `sendApprovedEmail()`
- 🔲 Implement `sendSetupCompleteEmail()`
- 🔲 Implement `sendDay3Email()` (conditional on lead count)
- 🔲 Implement `sendDay7Email()` (includes weekly stats)
- 🔲 Implement `sendDay14Email()` (plan-aware feature spotlight)
- 🔲 Test each email template renders correctly for all 3 plans

### Phase C — Triggers
- 🔲 `app/api/auth/register/route.ts` — trigger `sendWelcomeEmail` on new dealer signup
- 🔲 `app/api/admin/orgs/[id]/approve/route.ts` — trigger `sendApprovedEmail` on approval
- 🔲 `app/api/settings/org/route.ts` — trigger `sendSetupCompleteEmail` on wizard completion
- 🔲 `app/api/cron/check-tasks/route.ts` — add Job 7 for day 3/7/14 follow-ups

### Phase D — Pending Page
- 🔲 Create `app/(app)/pending/page.tsx` (plan-aware checklist)
- 🔲 Update `app/(app)/layout.tsx` to redirect pending dealers to `/pending`
- 🔲 Add auto-redirect to `/onboarding` when `approved_at` becomes non-null (Supabase realtime or polling)
- 🔲 Create `app/(auth)/unsubscribed/page.tsx` (confirmation after unsubscribe)
- 🔲 Create `app/api/unsubscribe/route.ts`

### Phase E — Wizard Refinements
- 🔲 Step 1: satellite lot address field
- 🔲 Step 1: lead source hint dropdown
- 🔲 Step 2: "Not sure? Start with Basic" helper text
- 🔲 Step 3: "What is this?" explainer box + "I'll set this up later" skip
- 🔲 Step 4: role descriptions in invite form (requires SAAS_CHECKLIST Phase 4 roles first)
- 🔲 Step 5: personalized "what's running" summary (plan-aware)

### Phase F — Admin Visibility
- 🔲 `/admin/orgs/[id]` — add onboarding status card
- 🔲 `/admin` dashboard — add "In Onboarding" and "Stalled" count cards

### Phase G — Cron Follow-ups
- 🔲 Add Job 7 to `check-tasks` cron
- 🔲 Test with a test org: verify day 3/7/14 emails fire on correct days
- 🔲 Verify `alreadySent()` guard prevents duplicates on cron retry

### Final Checks
- 🔲 Test full flow: signup → pending page → approval → email 2 → wizard → email 3
- 🔲 Test unsubscribe link works and stops future emails
- 🔲 Test plan-aware content: tier1 doesn't see SMS/voice sections
- 🔲 Verify `onboarding@dealerwyze.com` delivers (check Resend logs)
- 🔲 Update `SAAS_CHECKLIST.md` — mark onboarding phase complete

---

## Dependencies on SAAS_CHECKLIST

| This plan | Depends on |
|-----------|-----------|
| Phase D (`/pending` page) | SAAS_CHECKLIST Phase 2 (approval gate) — build together |
| Phase E (Step 4 roles) | SAAS_CHECKLIST Phase 4 (dealer user roles) |
| Phase C (approve trigger) | SAAS_CHECKLIST Phase 2 (`/api/admin/orgs/[id]/approve` route) |
| Phase F (admin visibility) | SAAS_CHECKLIST Phase 9 (admin dashboard upgrades) |

**Recommendation:** Implement Phase A, B, C (welcome + approved emails), and D (pending page) as one sprint — these are the highest value and share a deploy with SAAS_CHECKLIST Phases 2 and 9.
