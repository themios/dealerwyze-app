# Maintainability Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve long-term readability and type safety across five targeted areas of the DealerWyze codebase without changing any user-facing behavior.

**Architecture:** Each task is fully independent — no shared state, no new abstractions, no cross-task dependencies. Every task is a pure refactor (behavior unchanged) or a pure addition (new file, no side effects). Commit after each task so any change can be reverted with a single `git revert`.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind v4, shadcn/ui, Lucide icons

**Rollback strategy:** Each task ends with a `git commit`. To undo any task: `git log --oneline` to find the commit SHA, then `git revert <sha>`. No database changes. No env var changes. No migration files.

---

## File Map

| File | Action | Task |
|------|--------|------|
| `.vscode/settings.json` | Create | Task 1 |
| `app/(app)/settings/page.tsx` | Modify (JSX → config array) | Task 2 |
| `components/settings/SettingsLinkCard.tsx` | Create | Task 2 |
| `app/(app)/bhph/page.tsx` | Modify (remove `any`) | Task 3 |
| `docs/ARCHITECTURE.md` | Create | Task 4 |
| `proxy.ts` | Modify (add section headers + named helpers) | Task 5 |

---

## Task 1: VS Code search.exclude — hide marketing/archive noise

**Files:**
- Create: `.vscode/settings.json`

These folders contain non-code assets (Ads/, Marketing/, Design/, docs/archive/, remotion source comps). They pollute VS Code's search results and file picker. Adding `search.exclude` hides them from Cmd+Shift+F without removing any code from the project.

- [ ] **Step 1: Verify the directory does not already exist**

```bash
ls /home/tim/Applications/ApolloCRM/apollo-crm/.vscode/ 2>/dev/null || echo "directory does not exist yet"
```

Expected: directory does not exist yet (or exists but no settings.json)

- [ ] **Step 2: Create `.vscode/settings.json`**

Create file at `apollo-crm/.vscode/settings.json`:

```json
{
  "search.exclude": {
    "**/Ads/**": true,
    "**/Marketing/**": true,
    "**/Design/**": true,
    "**/docs/archive/**": true,
    "**/remotion/**": true,
    "**/.next/**": true,
    "**/node_modules/**": true
  },
  "files.exclude": {
    "**/.next": true,
    "**/node_modules": true
  }
}
```

- [ ] **Step 3: Verify the file parses as valid JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('.vscode/settings.json','utf8')); console.log('valid JSON')"
```

Expected: `valid JSON`

- [ ] **Step 4: Commit**

```bash
git add .vscode/settings.json
git commit -m "chore: add VS Code search.exclude for non-code asset folders"
```

---

## Task 2: Settings page — config-driven link cards

**Files:**
- Create: `components/settings/SettingsLinkCard.tsx`
- Modify: `app/(app)/settings/page.tsx`

The settings page has 14+ identical JSX blocks: `<Link href=...><div flex items-center justify-between...><Icon /><p title /><p desc /></div><ChevronRight /></Link>`. All have identical structure. This task extracts a `SettingsLinkCard` component and converts every repeated block to a config array render. The Telegram, Storage, Integration status, Export, FontSize, SignOut, Profile, and Legal blocks are NOT converted (they have custom markup) — only the simple nav link cards.

- [ ] **Step 1: Create `SettingsLinkCard` component**

Create file at `components/settings/SettingsLinkCard.tsx`:

```tsx
import Link from 'next/link'
import { ChevronRight, type LucideIcon } from 'lucide-react'

interface SettingsLinkCardProps {
  href: string
  icon: LucideIcon
  title: string
  description: string
  /** Add top divider — true for every item after the first in a group */
  divider?: boolean
}

export default function SettingsLinkCard({
  href,
  icon: Icon,
  title,
  description,
  divider = false,
}: SettingsLinkCardProps) {
  return (
    <Link href={href}>
      <div
        className={`flex items-center justify-between p-4 hover:bg-accent transition-colors${
          divider ? ' border-t border-border' : ''
        }`}
      >
        <div className="flex items-center gap-3">
          <Icon className="h-5 w-5 text-primary" />
          <div>
            <p className="font-medium text-sm">{title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </Link>
  )
}
```

- [ ] **Step 2: Verify the component file is valid TypeScript**

```bash
npx tsc --noEmit --skipLibCheck 2>&1 | head -20
```

Expected: 0 errors (or errors unrelated to the new file).

- [ ] **Step 3: Update `app/(app)/settings/page.tsx`**

Replace the entire file with the config-driven version below. Read the current file before editing to confirm line counts match.

The full replacement for `app/(app)/settings/page.tsx`:

```tsx
import { createClientForRequest } from '@/lib/supabase/forRequest'
import { requireProfile } from '@/lib/auth/profile'
import TopBar from '@/components/layout/TopBar'
import Link from 'next/link'
import {
  BarChart2, Users, ChevronRight, ExternalLink, CreditCard, Building2,
  Target, BookOpen, Zap, MessageSquare, ClipboardList, ListOrdered,
  Webhook, DollarSign, Layers, GitBranch, Video, Share2, Palette, Heart,
  type LucideIcon,
} from 'lucide-react'
import FontSizeSetting from '@/components/settings/FontSizeSetting'
import SignOutButton from '@/components/settings/SignOutButton'
import ProfileEditForm from '@/components/settings/ProfileEditForm'
import ExportDataButton from '@/components/settings/ExportDataButton'
import StorageWidget from '@/components/settings/StorageWidget'
import TelegramConnect from '@/components/settings/TelegramConnect'
import SettingsLinkCard from '@/components/settings/SettingsLinkCard'

// ── Types ─────────────────────────────────────────────────────────────────────

interface LinkCardDef {
  href: string
  icon: LucideIcon
  title: string
  description: string
}

// ── Config arrays ─────────────────────────────────────────────────────────────
// One array per settings group. Rendering is: wrap the array in
// <div className="rounded-lg border bg-card overflow-hidden"> and map each item
// to <SettingsLinkCard divider={index > 0} .../>

const BILLING_LINKS: LinkCardDef[] = [
  {
    href: '/settings/billing',
    icon: CreditCard,
    title: 'Plan & Billing',
    description: 'Manage your subscription and payment method',
  },
]

const ORG_LINKS: LinkCardDef[] = [
  {
    href: '/settings/organization',
    icon: Building2,
    title: 'Dealership Info',
    description: 'Name, phone, address, timezone',
  },
  {
    href: '/settings/users',
    icon: Users,
    title: 'Manage Team',
    description: 'Invite agents, assign roles, manage access',
  },
  {
    href: '/settings/pipeline',
    icon: GitBranch,
    title: 'Pipeline Stages',
    description: 'Rename, reorder, and add custom stages to match your sales process',
  },
]

const FINANCE_LINKS: LinkCardDef[] = [
  {
    href: '/settings/bookkeeping',
    icon: BookOpen,
    title: 'Categories & QuickBooks',
    description: 'Manage expense categories and QB account mapping',
  },
  {
    href: '/settings/payments',
    icon: DollarSign,
    title: 'Payments & Booking',
    description: 'Stripe keys for BHPH online payments, customer booking page',
  },
]

const COMMUNICATION_LINKS: LinkCardDef[] = [
  {
    href: '/settings/automation',
    icon: Zap,
    title: 'Automation & Timings',
    description: 'SMS mode, response SLA, follow-up schedule, SMS & email templates',
  },
  {
    href: '/settings/sequences',
    icon: ListOrdered,
    title: 'Sequences',
    description: 'Build automated follow-up cadences for email and SMS leads',
  },
  {
    href: '/customers/segments',
    icon: Layers,
    title: 'Smart Segments',
    description: 'Save customer filters and bulk-enroll them into sequences',
  },
  {
    href: '/settings/pulse',
    icon: Heart,
    title: 'Post-Sale Outreach',
    description: 'Google review requests and satisfaction surveys after every sale',
  },
  {
    href: '/settings/webhooks',
    icon: Webhook,
    title: 'Webhooks',
    description: 'Send real-time events to your own systems when leads, stages, or appointments change',
  },
]

const GOALS_LINKS: LinkCardDef[] = [
  {
    href: '/settings/goals',
    icon: Target,
    title: 'Performance Goals',
    description: 'Set daily, weekly, monthly & annual targets',
  },
]

const VIDEO_LINKS: LinkCardDef[] = [
  {
    href: '/settings/video',
    icon: Video,
    title: 'Video Settings',
    description: 'Auto-post preferences, voice, default template',
  },
  {
    href: '/settings/social',
    icon: Share2,
    title: 'Social Media Accounts',
    description: 'Connect Facebook, Instagram, TikTok, YouTube for auto-posting',
  },
]

const INVENTORY_LINKS: LinkCardDef[] = [
  {
    href: '/settings/recon-template',
    icon: ClipboardList,
    title: 'Recon Checklist Template',
    description: 'Customize the default reconditioning checklist for new vehicles',
  },
]

const REPORTS_LINKS: LinkCardDef[] = [
  {
    href: '/analytics',
    icon: BarChart2,
    title: 'Deal Pipeline & Analytics',
    description: 'Inventory value, lead funnel, source breakdown',
  },
]

const APPEARANCE_LINKS: LinkCardDef[] = [
  {
    href: '/settings/appearance',
    icon: Palette,
    title: 'Theme & Colors',
    description: 'Personalize your dealership colors and font style',
  },
]

// ── Helper ────────────────────────────────────────────────────────────────────

function LinkGroup({ links }: { links: LinkCardDef[] }) {
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {links.map((link, i) => (
        <SettingsLinkCard key={link.href} divider={i > 0} {...link} />
      ))}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function SettingsPage() {
  const profile = await requireProfile()
  const supabase = await createClientForRequest()

  const { data: orgSettings } = await supabase
    .from('org_settings')
    .select('feed_cg_last_synced_at, feed_cg_last_count, feed_cg_last_error, feed_fb_last_synced_at, feed_fb_last_count, feed_fb_last_error, telegram_chat_id')
    .eq('org_id', profile.org_id)
    .maybeSingle()

  const feedStats = orgSettings

  return (
    <div>
      <TopBar title="Settings" />
      <div className="px-4 py-4 space-y-8">

        {/* Admin-only sections */}
        {profile.role === 'admin' && (
          <>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dealership Settings</p>

            <section>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Billing</p>
              <LinkGroup links={BILLING_LINKS} />
            </section>

            <section>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Appearance</p>
              <LinkGroup links={APPEARANCE_LINKS} />
            </section>

            <section>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Organization</p>
              <LinkGroup links={ORG_LINKS} />
            </section>

            <section>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Finance</p>
              <LinkGroup links={FINANCE_LINKS} />
            </section>

            <section>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Communication</p>
              <LinkGroup links={COMMUNICATION_LINKS} />
            </section>

            <section>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Notifications</p>
              {/* Telegram — instant lead alerts + AI chat via bot */}
              <TelegramConnect
                initialConnected={!!orgSettings?.telegram_chat_id}
                botUsername={process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? 'ApolloTim_bot'}
              />
            </section>

            <section>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">AI Dealer Brief</p>
              <LinkGroup links={GOALS_LINKS} />
            </section>

            <section>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Vehicle Documents</p>
              <StorageWidget />
            </section>

            <section>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Video &amp; Social</p>
              <LinkGroup links={VIDEO_LINKS} />
            </section>

            <section>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Inventory</p>
              <LinkGroup links={INVENTORY_LINKS} />
            </section>

            <section>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Reports</p>
              <LinkGroup links={REPORTS_LINKS} />
              <div className="mt-2">
                <ExportDataButton />
              </div>
            </section>
          </>
        )}

        {/* Display */}
        <section>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Display</p>
          <div className="p-4 rounded-lg border bg-card">
            <p className="font-medium text-sm mb-1">Text Size</p>
            <p className="text-xs text-muted-foreground mb-3">Adjust for comfortable reading on your device</p>
            <FontSizeSetting />
          </div>
        </section>

        {/* Integrations */}
        {profile.role === 'admin' && (
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Integrations</p>
            <div className="space-y-2">
              <div className="p-4 rounded-lg border bg-card">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-medium text-sm">Gmail IMAP Sync</p>
                  <span className="text-xs bg-green-500/10 text-green-600 px-2 py-0.5 rounded-full font-medium">Active</span>
                </div>
                <p className="text-xs text-muted-foreground">Auto-imports CarGurus, AutoTrader leads every 15 min via cron-job.org.</p>
              </div>
              <div className="p-4 rounded-lg border bg-card">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-medium text-sm">Twilio SMS</p>
                  <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-medium">Optional</span>
                </div>
                <p className="text-xs text-muted-foreground">Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, NEXT_PUBLIC_TWILIO_ENABLED=true to Vercel.</p>
              </div>
              <div className="p-4 rounded-lg border bg-card space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-sm">Inventory Feed Sync</p>
                  <span className="text-xs bg-green-500/10 text-green-600 px-2 py-0.5 rounded-full font-medium">Daily 2 AM</span>
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div className="flex justify-between gap-2">
                    <span>CarGurus</span>
                    <span className={feedStats?.feed_cg_last_error ? 'text-destructive' : ''}>
                      {feedStats?.feed_cg_last_error
                        ? `Error: ${feedStats.feed_cg_last_error.slice(0, 50)}`
                        : feedStats?.feed_cg_last_synced_at
                          ? `${feedStats.feed_cg_last_count} vehicles · ${new Date(feedStats.feed_cg_last_synced_at).toLocaleDateString()}`
                          : 'Not yet synced'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span>Facebook Catalog</span>
                    <span className={feedStats?.feed_fb_last_error ? 'text-destructive' : ''}>
                      {feedStats?.feed_fb_last_error
                        ? `Error: ${feedStats.feed_fb_last_error.slice(0, 50)}`
                        : feedStats?.feed_fb_last_synced_at
                          ? `${feedStats.feed_fb_last_count} vehicles · ${new Date(feedStats.feed_fb_last_synced_at).toLocaleDateString()}`
                          : 'Not yet synced'}
                    </span>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground pt-1">
                  Feed URLs: <code className="bg-muted px-1 rounded">/api/inventory/cargurus-feed</code> · <code className="bg-muted px-1 rounded">/api/inventory/facebook-feed</code>
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Account */}
        <section>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Account</p>
          <div className="space-y-2">
            <ProfileEditForm displayName={profile.display_name} />
            <SignOutButton />
          </div>
        </section>

        {/* Support */}
        <section>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Help</p>
          <Link href="/support">
            <div className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent transition-colors">
              <div className="flex items-center gap-3">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <p className="font-medium text-sm">Support Tickets</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </Link>
        </section>

        {/* Legal */}
        <section>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Legal</p>
          <div className="space-y-2">
            <a href="/privacy.html">
              <div className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent transition-colors">
                <p className="font-medium text-sm">Privacy Policy</p>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </a>
            <a href="/terms.html">
              <div className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent transition-colors">
                <p className="font-medium text-sm">Terms of Service</p>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </a>
          </div>
        </section>

        {profile.role === 'admin' && (
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Quick Links</p>
            <div className="space-y-2">
              {[
                { label: 'Supabase Dashboard', href: 'https://supabase.com/dashboard' },
                { label: 'Vercel Dashboard', href: 'https://vercel.com/dashboard' },
              ].map(({ label, href }) => (
                <a key={href} href={href} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent transition-colors">
                  <span className="text-sm">{label}</span>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                </a>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit --skipLibCheck 2>&1 | head -20
```

Expected: 0 errors.

- [ ] **Step 5: Smoke-check the page renders (dev server)**

```bash
npm run dev &
sleep 8
curl -s http://localhost:3000/settings | grep -c "Settings" && kill %1
```

Expected: returns a number > 0. Kill dev server after.

- [ ] **Step 6: Commit**

```bash
git add components/settings/SettingsLinkCard.tsx app/(app)/settings/page.tsx
git commit -m "refactor(settings): config-driven link cards via SettingsLinkCard component"
```

---

## Task 3: Remove `any` from `bhph/page.tsx`

**Files:**
- Modify: `app/(app)/bhph/page.tsx`

The file uses `(a: any)` in three filter/map callbacks on lines 48, 58, and 79. The `accounts` array comes from a Supabase select with a `*` spread plus two joined relations (`vehicle` and `customer`). TypeScript can't infer this shape automatically, so a local interface captures it explicitly.

- [ ] **Step 1: Add `BhphAccount` interface and remove the three `any` casts**

The only change is: add the interface after the imports (before `export default`), and replace the three `(a: any)` with `(a: BhphAccount)`.

In `app/(app)/bhph/page.tsx`, add this interface after the last import line (line 14):

```typescript
interface BhphAccount {
  id: string
  user_id: string
  status: string
  loan_amount: number | null
  down_payment: number | null
  total_paid: number | null
  payment_frequency: PaymentFrequency
  next_due_date: string
  vehicle: {
    id: string
    year: number | null
    make: string | null
    model: string | null
    stock_no: string | null
  } | null
  customer: {
    id: string
    name: string
    primary_phone: string | null
    sms_opted_out: boolean
  } | null
}
```

Then replace the three `any` casts:

**Line 48** — change:
```typescript
{accounts.filter((a: any) => {
```
to:
```typescript
{accounts.filter((a: BhphAccount) => {
```

**Line 58** — change:
```typescript
{accounts.filter((a: any) => {
```
to:
```typescript
{accounts.filter((a: BhphAccount) => {
```

**Line 79** — change:
```typescript
accounts.map((acct: any) => {
```
to:
```typescript
accounts.map((acct: BhphAccount) => {
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit --skipLibCheck 2>&1 | head -20
```

Expected: 0 errors (or errors unrelated to `bhph/page.tsx`).

- [ ] **Step 3: Commit**

```bash
git add app/\(app\)/bhph/page.tsx
git commit -m "fix(bhph): replace any casts with BhphAccount interface"
```

---

## Task 4: Write `docs/ARCHITECTURE.md`

**Files:**
- Create: `docs/ARCHITECTURE.md`

This document is the missing "where does X live?" reference for future developers (and future Claude sessions). It covers the five mental-model layers every new engineer needs: auth, route guards, business logic location, UI state patterns, and directory layout.

- [ ] **Step 1: Create `docs/ARCHITECTURE.md`**

Create at `apollo-crm/docs/ARCHITECTURE.md`:

```markdown
# DealerWyze — Architecture Reference

Last updated: 2026-04-25. Update this file whenever a structural pattern changes.

---

## 1. Authentication & Session

DealerWyze uses **Supabase Auth** (email/password + magic link).

| Concept | Where |
|---------|-------|
| Session management | `@supabase/ssr` in `lib/supabase/` |
| Server-side client | `lib/supabase/server.ts` → `createClient()` |
| Service client (bypasses RLS) | `lib/supabase/service.ts` → `createServiceClient()` |
| Request-scoped client (SSR) | `lib/supabase/forRequest.ts` → `createClientForRequest()` |
| Profile fetch + auth guard | `lib/auth/profile.ts` → `requireProfile()` |
| Staff impersonation cookie | `lib/auth/staffSession.ts` |

**Rule:** All API routes call `requireProfile()` as the first line. This verifies the session, checks `deactivated_at`, and guarantees a non-null `org_id`. Do not skip it.

---

## 2. Route Guards (Middleware)

All route protection runs in `proxy.ts` (the Next.js middleware entry point).

Five layers in execution order:

1. **Impersonation block** — `isImpersonationBlocked()` — blocks mutations for read-only staff sessions
2. **Rate limiting** — `isRateLimited()` — sliding window on webhook/API routes; in-process Map (not shared across instances)
3. **Public path pass-through** — `isPublic()` — `/login`, `/signup`, `/lp/*`, `/_next/*`, dealer inventory pages, etc.
4. **Auth redirect** — unauthenticated users → `/login`; authenticated users on `/login` → `/today`
5. **Subscription gate** — `isAppRoute()` — canceled/trial-expired → `/settings/billing`; suspended → `/suspended`

**Role helpers** live in `lib/auth/dealerRoles.ts`:
- `isDealerAdmin(role)` — `dealer_admin` only
- `canAccessBhph(role)`, `canAccessLedger(role)`, `canAccessReports(role)`, etc.

**Platform admin helpers** live in `lib/auth/platform.ts`:
- `requirePlatformSuperAdmin(userId)` — returns a 403 response or null
- `requirePlatformArea(userId, area)` — granular platform permissions

Never check raw role strings like `profile.role === 'admin'`. Always use the helpers.

---

## 3. Business Logic Location

| Domain | Directory |
|--------|-----------|
| Cron job logic (one file per job) | `lib/cron/jobs/` |
| Cron auth validation | `lib/cron/validateCronAuth.ts` |
| Sequence enrollment + delivery | `lib/sequences/` |
| Retention / birthday / post-sale | `lib/retention/` |
| BHPH payment tokens + schedules | `lib/bhph/` |
| Pulse surveys (delivery, questions) | `lib/pulse/` |
| Theme system (presets, CSS vars) | `lib/theme/` |
| Video rendering + R2 upload | `lib/video/` |
| Social OAuth + posting | `lib/social/` |
| Webhook dispatch | `lib/webhooks/dispatch.ts` |
| Phone formatting | `lib/utils/phone.ts` |
| Relative time formatting | `lib/utils/relativeTime.ts` |
| API response helpers | `lib/api/respond.ts` → `apiError()`, `apiOk()` |
| Pulse score color | `lib/pulse/scoreColor.ts` |
| Lead parsers (CarGurus, AutoTrader) | `lib/leads/` |

**Rule:** Before writing a new utility function, grep `lib/` for it. Duplicates have caused full audit sessions to clean up.

---

## 4. API Route Patterns

### Standard org-scoped route

```typescript
import { requireProfile } from '@/lib/auth/profile'
import { apiError, apiOk } from '@/lib/api/respond'

export async function GET() {
  const profile = await requireProfile()
  // profile.org_id is guaranteed non-null
  // ...
  return apiOk({ data })
}
```

### Platform admin route

```typescript
const profile = await requireProfile()
const denied = await requirePlatformSuperAdmin(profile.id)
if (denied) return denied
// proceed with platform-level access
```

### org_settings write (never use upsert)

```typescript
// RLS blocks INSERT — always use .update()
await supabase.from('org_settings').update(payload).eq('org_id', profile.org_id)
```

### customers / activities table quirks

- `customers` has **no `org_id` column** — scoped via `user_id = profile.org_id`
- `activities` has **no `org_id` column** — insert only: `user_id`, `customer_id`, `vehicle_id`, `type`, `direction`, `body`, etc.
- Including `org_id` in either table's queries causes silent failure.

---

## 5. UI State Patterns

| Pattern | Where used |
|---------|-----------|
| Server Components (default) | All page.tsx files; no `'use client'` |
| Client islands | `*Client.tsx` suffix — e.g. `BhphRecordPayment`, `AutoresponderCard` |
| Loading skeletons | `loading.tsx` next to each page.tsx |
| Optimistic UI | Direct state mutation + SWR/fetch revalidation (no shared store) |
| Theme CSS vars | Injected server-side in `app/(app)/layout.tsx` via `<style>` tag |
| Font styles | CSS classes in `globals.css`: `.font-style-classic`, `.font-style-bold` |
| Analytics | `AnalyticsProvider` (client) in `app/layout.tsx` — fires `page_view` on route change |

---

## 6. Directory Layout

```
apollo-crm/
├── app/
│   ├── (app)/          ← Authenticated dealer app (all routes behind proxy.ts)
│   ├── (auth)/         ← Login, signup, password reset
│   ├── (public)/       ← Landing pages, inventory pages, pulse survey
│   ├── api/            ← All API routes
│   ├── lp/             ← Ad landing pages (/lp/dealerwyze-os, etc.)
│   └── layout.tsx      ← Root layout: fonts, gtag, ThemeProvider, AnalyticsProvider
├── components/
│   ├── layout/         ← TopBar, Sidebar, BottomNav
│   ├── providers/      ← AnalyticsProvider, FontSizeProvider
│   ├── settings/       ← Settings section components
│   ├── sequences/      ← AutoresponderCard, SequenceEditor, EnrollSheet
│   ├── landing/        ← All landing page section components
│   └── ui/             ← shadcn/ui primitives (do not edit directly)
├── lib/
│   ├── auth/           ← requireProfile, role helpers, staffSession
│   ├── supabase/       ← Client factories (server, service, forRequest)
│   ├── cron/           ← validateCronAuth + jobs/
│   ├── analytics/      ← gtag.ts (UTM capture, conversion, page_view)
│   └── ...             ← Domain logic (see table in section 3)
├── supabase/
│   └── migrations/     ← SQL migrations applied manually in Supabase dashboard
├── docs/
│   ├── ARCHITECTURE.md ← This file
│   └── superpowers/    ← Plans and specs (not production code)
├── proxy.ts            ← Next.js middleware (rate limiting, auth, subscription gate)
└── .env.example        ← All ~60 env vars with descriptions
```

---

## 7. Multi-tenant Isolation Rules

Every query must be scoped to `profile.org_id`. Never trust `org_id` from request body or URL params.

| Table | Scope column | Notes |
|-------|-------------|-------|
| vehicles, receipts, tasks, templates, etc. | `user_id = profile.org_id` | Standard |
| customers | `user_id = profile.org_id` | No `org_id` column |
| activities | `user_id = profile.org_id` | No `org_id` column |
| org_settings | `org_id = profile.org_id` | Always `.update()`, never `.upsert()` |
| profiles | `id = user.id` | Own profile only (except superadmin) |

Sentinel org UUID `00000000-0000-0000-0000-000000000001` is the platform staff home org. Never use it in dealer queries.

---

## 8. Deployment

```bash
# Staging
./deploy-staging.sh   # → apollo-crm.vercel.app

# Production
./deploy-prod.sh      # → dealerwyze.com (NO GitHub auto-deploy on prod)
```

Migrations are applied **manually** by Tim in the Supabase SQL editor. There is no migration runner in CI/CD.

Tests: `npm test` (Vitest, ~20 tests). Must pass before deploying.
```

- [ ] **Step 2: Commit**

```bash
git add docs/ARCHITECTURE.md
git commit -m "docs: add ARCHITECTURE.md — auth, guards, business logic, UI patterns, directory layout"
```

---

## Task 5: Named policy sections in `proxy.ts`

**Files:**
- Modify: `proxy.ts`

`proxy.ts` already has 5 distinct responsibilities packed into 258 lines. The current comments partially label them. This task adds clear section banners with one-line summaries so any engineer can jump to the right section without reading the whole file. No logic changes — pure comment restructuring + one extracted helper predicate.

The goal: each section starts with a banner comment that names the policy and states its invariant. Also extract `isTrialExpired()` and `isSuspended()` as named predicates — they're currently inline conditions inside the subscription gate, and naming them makes the gate readable at a glance.

- [ ] **Step 1: Read `proxy.ts` to confirm current state**

Lines 1-258 of `proxy.ts` (already read — confirms the structure below).

- [ ] **Step 2: Apply the changes to `proxy.ts`**

The changes are four targeted edits — no reordering, no logic change:

**Edit A** — improve the rate-limiting section header (line 4). Replace:
```typescript
// ── Rate limiting (formerly middleware.ts) ────────────────────────────────────
// In-process sliding window — good enough for <10 dealers on Vercel.
```
with:
```typescript
// ── POLICY 1: Rate Limiting ────────────────────────────────────────────────────
// In-process sliding window per IP. Covers webhook endpoints + auth brute-force.
// NOTE: Not shared across Vercel instances — replace with Upstash Redis before scaling.
```

**Edit B** — improve the impersonation section header (line 53). Replace:
```typescript
// ── Staff impersonation: block mutations (read-only mode only) ────────────────
```
with:
```typescript
// ── POLICY 2: Staff Impersonation Guard ───────────────────────────────────────
// Reads HMAC-signed cookie. Blocks all state-mutating methods (POST/PUT/PATCH/DELETE)
// when the session is read-only (writeMode=0). Write-mode sessions (writeMode=1) pass through.
// Cookie: dealerwyze_staff_org_id | Secret: STAFF_SESSION_SECRET
```

**Edit C** — improve the auth + subscription section header (line 98). Replace:
```typescript
// ── Auth + subscription gating (original proxy.ts) ───────────────────────────
```
with:
```typescript
// ── POLICY 3: Public Path Detection ──────────────────────────────────────────
// Determines whether a path needs auth. Extend PUBLIC_PATHS / PUBLIC_PREFIXES as needed.
// isDealerPublicPath() matches /{slug}/inventory/* — safe because no app route uses 'inventory' as segment[1].
```

**Edit D** — add named predicates + improve the proxy() function's subscription block.

After the closing brace of `isAppRoute()` (line 131), add these two helpers:

```typescript
function isTrialExpired(subscriptionStatus: string, trialEndsAt: string | null): boolean {
  return subscriptionStatus === 'trialing' && !!trialEndsAt && new Date(trialEndsAt) < new Date()
}

function isSuspended(suspendedAt: string | null | undefined): boolean {
  return !!suspendedAt
}
```

Then inside `proxy()`, replace the subscription gate block (lines ~222-242):
```typescript
      if (org) {
        const { subscription_status, trial_ends_at, suspended_at } = org as typeof org & { suspended_at?: string | null }
        const trialExpired =
          subscription_status === 'trialing' &&
          trial_ends_at &&
          new Date(trial_ends_at) < new Date()

        // Suspended accounts — redirect to suspension page (except the page itself)
        if (suspended_at && !pathname.startsWith('/suspended')) {
          const url = request.nextUrl.clone()
          url.pathname = '/suspended'
          return NextResponse.redirect(url)
        }

        if (subscription_status === 'canceled' || trialExpired) {
          const url = request.nextUrl.clone()
          url.pathname = '/settings/billing'
          return NextResponse.redirect(url)
        }
      }
```
with:
```typescript
      if (org) {
        const { subscription_status, trial_ends_at, suspended_at } = org as typeof org & { suspended_at?: string | null }

        // Suspended accounts — redirect to suspension page (except the page itself)
        if (isSuspended(suspended_at) && !pathname.startsWith('/suspended')) {
          const url = request.nextUrl.clone()
          url.pathname = '/suspended'
          return NextResponse.redirect(url)
        }

        if (subscription_status === 'canceled' || isTrialExpired(subscription_status, trial_ends_at ?? null)) {
          const url = request.nextUrl.clone()
          url.pathname = '/settings/billing'
          return NextResponse.redirect(url)
        }
      }
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit --skipLibCheck 2>&1 | head -20
```

Expected: 0 errors.

- [ ] **Step 4: Verify the middleware config export is unchanged**

```bash
grep -n "export const config" proxy.ts
```

Expected: line number printed, confirming export still present.

- [ ] **Step 5: Commit**

```bash
git add proxy.ts
git commit -m "refactor(proxy): named policy sections + isTrialExpired/isSuspended predicates"
```

---

## Self-Review

**Spec coverage:**
- Task 1: VS Code search.exclude ✅
- Task 2: Settings config-driven cards ✅
- Task 3: Remove `any` from bhph ✅
- Task 4: ARCHITECTURE.md ✅
- Task 5: proxy.ts readable sections ✅

**Deferred (Tier 3 — separate sessions):**
- CustomerDetailClient.tsx split (>400 lines)
- onboarding/page.tsx split

**Placeholder scan:** None found. All code blocks are complete and pasteable.

**Type consistency:** `BhphAccount.payment_frequency` uses `PaymentFrequency` imported from `lib/bhph/schedule` — matches the existing import on line 14 of `bhph/page.tsx`. `SettingsLinkCard` uses `LucideIcon` from `lucide-react` — standard pattern across the codebase. `isTrialExpired` signature matches the call site exactly.

**Rollback:** Each task is one commit. `git revert <sha>` undoes any single task cleanly. No migrations. No env var changes.
