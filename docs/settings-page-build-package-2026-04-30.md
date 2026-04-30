# Settings Page Build Package

Date: 2026-04-30
Depends on: [settings-page-redesign-proposal-2026-04-30.md](/home/tim/Applications/ApolloCRM/apollo-crm/docs/settings-page-redesign-proposal-2026-04-30.md)
Purpose: Convert the settings redesign strategy into a concrete implementation package

This document contains:

- target sitemap
- navigation and shell component spec
- page migration map
- phased engineering tickets
- QA and rollout checklist

## Build Goals

The implementation should deliver:

1. a settings experience that feels like an enterprise admin console
2. clear separation between org settings, personal settings, and operational tooling
3. consistent shells and navigation patterns
4. stronger permissions consistency
5. lower cognitive load and better discoverability

## Target Sitemap

### Root

- `/settings`

Desktop:
- grouped left sidebar
- search
- status panel
- selected-group content area

Mobile:
- grouped accordion navigation
- search
- compact rows

### Group 1: Business

- `/settings/organization`
- `/settings/users`
- `/settings/pipeline`
- `/settings/website`

Organization internal subsections:
- Profile
- Channels
- Integrations
- Advanced

### Group 2: Sales & Communication

- `/settings/automation`
- `/settings/sequences`
- `/settings/templates` or embedded templates subpage
- `/settings/webhooks`
- `/settings/goals`

Not included:
- `Smart Segments`

### Group 3: Inventory & Merchandising

- `/settings/recon-template`
- `/settings/video`
- `/settings/social`

Optional future subpage:
- `/settings/status/feeds` if feed operations become large enough

### Group 4: Customer Experience

- `/settings/booking`
- `/settings/customer-payments`
- `/settings/pulse`
- `/settings/reviews`
- `/settings/retention`

Notes:
- split the current combined payments/booking surface
- keep reviews visibly connected to pulse/post-sale outreach

### Group 5: Compliance & Finance

- `/settings/billing`
- `/settings/bookkeeping`
- `/settings/audit`
- `/settings/transfer`
- danger zone can stay inside organization initially, but should be surfaced here in nav if broken out later

### Group 6: Personal & Support

- `/settings/account`
- `/settings/display`
- `/settings/notifications`
- `/support`
- `/privacy.html`
- `/terms.html`

### Optional System Status

One of:

- top-level root status panel only
- `/settings/status`

Recommended status domains:
- Gmail lead sync
- Google Calendar
- Google Business Profile
- Twilio
- inventory feeds
- Telegram
- Stripe
- webhooks

## Current-to-Target Mapping

| Current Surface | Target Destination | Action |
|---|---|---|
| `/settings` | `/settings` | Redesign root hub |
| `/settings/organization` | Business | Keep, internally restructure |
| `/settings/users` | Business | Keep, re-shell |
| `/settings/pipeline` | Business | Keep, re-shell |
| `/settings/website` | Business | Add to root hub |
| `/settings/automation` | Sales & Communication | Keep, split internal concerns |
| `/settings/sequences` | Sales & Communication | Keep, re-shell |
| templates inside automation | Sales & Communication | Extract or formalize as subpage |
| `/settings/webhooks` | Sales & Communication | Keep, re-shell |
| `/settings/goals` | Sales & Communication | Keep, relabel from “AI Dealer Brief” |
| `/settings/recon-template` | Inventory & Merchandising | Keep |
| `/settings/video` | Inventory & Merchandising | Keep |
| `/settings/social` | Inventory & Merchandising | Keep |
| `/settings/payments` | split | Replace with booking + customer payments |
| booking config in payments | Customer Experience | Move to `/settings/booking` |
| payments config in payments | Customer Experience | Move to `/settings/customer-payments` |
| `/settings/pulse` | Customer Experience | Keep |
| `/settings/reviews` | Customer Experience | Clarify ownership and route behavior |
| `/settings/retention` | Customer Experience | Add to root hub |
| `/settings/billing` | Compliance & Finance | Keep |
| `/settings/bookkeeping` | Compliance & Finance | Keep |
| `/settings/audit` | Compliance & Finance | Keep |
| `/settings/transfer` | Compliance & Finance | Add to root hub and re-shell |
| Text Size block in root | Personal & Support | Move to dedicated `/settings/display` or inline personal section |
| ProfileEditForm in root | Personal & Support | Move to dedicated `/settings/account` or personal section |
| Telegram connect in root | Personal & Support or Status | Move out of generic Notifications section |
| Smart Segments link in root | remove from Settings | Keep under Customers |
| `/analytics` link in root settings | remove from Settings | Keep in analytics nav, not settings |
| Quick Links to Vercel/Supabase | Advanced Ops only | Remove from default settings root |

## Shared Component Spec

### 1. `SettingsPageShell`

Purpose:
- standard page shell for every settings page

Suggested API:

```tsx
interface SettingsPageShellProps {
  title: string
  description?: string
  backHref?: string
  type?: 'form' | 'ops' | 'critical'
  headerActions?: React.ReactNode
  children: React.ReactNode
}
```

Behavior:
- renders shared TopBar pattern
- normalizes page width based on `type`
- provides consistent title + description area
- supports optional actions in header

Width rules:
- `form` → `max-w-3xl` or `max-w-4xl`
- `ops` → `max-w-6xl`
- `critical` → `max-w-xl`

Acceptance criteria:
- no settings page owns its own page-level nav chrome outside this shell
- back navigation is always left-aligned and consistent

### 2. `SettingsNav`

Purpose:
- root settings navigation system used by both desktop sidebar and mobile grouped navigation

Suggested API:

```tsx
interface SettingsNavItem {
  id: string
  title: string
  description?: string
  href?: string
  keywords?: string[]
  status?: 'connected' | 'error' | 'pending' | 'optional' | 'healthy'
  access?: 'personal' | 'admin' | 'manager' | 'staff'
  summary?: string
}

interface SettingsNavGroup {
  id: string
  title: string
  description?: string
  statusSummary?: string
  items: SettingsNavItem[]
}
```

Behavior:
- desktop: render grouped sidebar
- mobile: render accordion groups
- supports search filtering
- supports role filtering
- supports active state

Acceptance criteria:
- same manifest drives both desktop and mobile rendering
- same manifest drives search results

### 3. `SettingsAccordionGroup`

Purpose:
- mobile grouped settings navigation and optional intra-page section grouping

Features:
- title
- description
- item count
- optional summary chip
- persisted open/closed state

### 4. `SettingsLinkCard` v2

Purpose:
- compact settings row component

Add props:

```tsx
interface SettingsLinkCardProps {
  href: string
  icon: LucideIcon
  title: string
  description: string
  divider?: boolean
  status?: 'connected' | 'error' | 'pending' | 'optional' | 'healthy'
  summary?: string
  accessBadge?: string
}
```

Behavior:
- compact row layout
- status chip on right or secondary line
- summary text optional
- access label optional

### 5. `StatusChip`

Purpose:
- consistent status presentation across settings and future admin areas

States:
- connected
- healthy
- optional
- pending
- error
- needs_attention

Acceptance criteria:
- replaces bespoke pills in settings root
- reusable in root status panel and page-level summaries

### 6. `SettingsFormSection`

Purpose:
- normalize section blocks inside form-heavy settings pages

Suggested API:

```tsx
interface SettingsFormSectionProps {
  title: string
  description?: string
  tone?: 'default' | 'critical' | 'muted'
  children: React.ReactNode
}
```

Usage:
- organization subsections
- payments / booking groups
- retention sections
- automation sections

### 7. `CriticalActionDialog`

Purpose:
- replace `confirm()` in high-risk settings flows

Usage:
- transfer cancellation
- danger zone operations
- billing-risk actions if added later

Requirements:
- title
- consequence summary
- explicit confirm button
- optional typed confirmation for destructive actions

### 8. `UnsavedChangesGuard`

Purpose:
- protect form-heavy settings pages from accidental navigation loss

Usage:
- automation
- retention
- payments / booking split pages
- organization if made editable inline across multiple sections

## Permissions / Access Model Spec

Create a single source of truth:

`lib/settings/access.ts`

Suggested shape:

```tsx
type SettingsAudience = 'dealer_admin' | 'dealer_manager' | 'dealer_finance' | 'dealer_staff' | 'dealer_rep' | 'personal'

interface SettingsAccessRule {
  route: string
  navVisibleTo: UserRole[]
  routeAccessibleTo: UserRole[]
  group: string
  personalOnly?: boolean
}
```

Use this to drive:
- root navigation visibility
- desktop sidebar visibility
- mobile accordion visibility
- server route guards
- UI access badges

Acceptance criteria:
- no direct ad hoc role checks inside the root settings manifest
- visibility and route access cannot silently drift

## Page-by-Page Migration Spec

### Root `/settings`

Current problems:
- too flat
- mixed scopes
- ad hoc status

Target:
- responsive nav model
- grouped sidebar on desktop
- accordion groups on mobile
- status panel at top
- personal/support separated from org config

### `/settings/organization`

Current problems:
- overloaded long page

Target internal structure:
- Profile
- Channels
- Integrations
- Advanced

Suggested implementation:
- same page route
- internal tabs or accordions
- all wrapped in `SettingsPageShell`

### `/settings/automation`

Current problems:
- rules and content authoring mixed together

Target:
- Automation Rules
- Auto-Response
- Messaging Content

Suggested path:
- keep one route initially
- stronger sectioning
- extract templates later if needed

### `/settings/payments`

Current problems:
- two unrelated domains merged

Target:
- route split
  - `/settings/customer-payments`
  - `/settings/booking`

### `/settings/transfer`

Current problems:
- client-first shell
- browser `confirm()`
- high-risk governance flow

Target:
- server shell
- `critical` page type
- structured confirmation dialog

### `/settings/website`, `/settings/retention`

Current problems:
- orphaned from root hub

Target:
- surfaced in correct group
- standardized page shell

## Phased Engineering Tickets

### Epic 1: Settings Stability

#### Ticket 1.1
Replace all `alert()` usage in settings flows with toasts or inline validation.

Files to inspect first:
- `app/(app)/settings/retention/RetentionSettingsClient.tsx`
- `app/(app)/settings/sequences/SequencesClient.tsx`
- `app/(app)/settings/payments/PaymentSettingsClient.tsx`

Acceptance:
- no browser alerts remain in settings flows

#### Ticket 1.2
Replace browser `confirm()` usage in high-risk settings flows with product dialogs.

Files to inspect first:
- `app/(app)/settings/transfer/page.tsx`
- any danger-zone controls

Acceptance:
- no browser confirm dialogs remain in critical settings flows

#### Ticket 1.3
Add missing root settings entry points for:
- website
- retention
- transfer

Acceptance:
- all three pages are reachable from the settings hub

#### Ticket 1.4
Remove duplicate Inventory section rendering logic from the root hub.

Acceptance:
- one source of truth for inventory-related hub rendering

#### Ticket 1.5
Add dirty-state protection to form-heavy settings flows.

Priority pages:
- automation
- retention
- payments / booking split pages

Acceptance:
- user is warned before accidental loss of edits

#### Ticket 1.6
Centralize settings permissions and access mapping.

Acceptance:
- root settings nav and route guards derive from one shared model

### Epic 2: Shared Settings Foundation

#### Ticket 2.1
Build `SettingsPageShell`.

Acceptance:
- shell supports `form`, `ops`, `critical`
- shell owns title, description, back nav

#### Ticket 2.2
Build `StatusChip`.

Acceptance:
- status styles unified

#### Ticket 2.3
Extend `SettingsLinkCard` to support status, summary, and access labels.

Acceptance:
- row supports future hub design without further API churn

#### Ticket 2.4
Build `SettingsNav`.

Acceptance:
- same config renders desktop sidebar and mobile grouped nav

#### Ticket 2.5
Build `SettingsAccordionGroup`.

Acceptance:
- mobile-ready grouped navigation

#### Ticket 2.6
Build `SettingsFormSection`.

Acceptance:
- section UI consistent across form pages

#### Ticket 2.7
Build `CriticalActionDialog`.

Acceptance:
- reusable for transfer and future destructive settings flows

### Epic 3: Root Settings IA Redesign

#### Ticket 3.1
Create settings manifest with 6 groups.

Acceptance:
- every settings destination belongs to exactly one group

#### Ticket 3.2
Implement desktop grouped sidebar.

Acceptance:
- nav grouped by top-level categories
- search filters nav

#### Ticket 3.3
Implement mobile accordion navigation.

Acceptance:
- grouped sections collapse and expand

#### Ticket 3.4
Implement root status panel or status page.

Acceptance:
- admins can see connected / failing systems in one place

#### Ticket 3.5
Remove non-settings workflow links from the hub.

Includes:
- Smart Segments
- analytics links
- advanced ops links unless intentionally relocated

### Epic 4: Subpage Shell Migration

#### Ticket 4.1
Migrate Organization to `SettingsPageShell`.

#### Ticket 4.2
Migrate Automation to `SettingsPageShell`.

#### Ticket 4.3
Migrate Users to `SettingsPageShell`.

#### Ticket 4.4
Split and migrate Customer Payments and Booking.

#### Ticket 4.5
Migrate Retention, Video, Social, Webhooks.

#### Ticket 4.6
Migrate Billing, Bookkeeping, Audit, Transfer.

Acceptance for all:
- shared shell pattern
- consistent widths and navigation

### Epic 5: Internal Page Restructure

#### Ticket 5.1
Restructure Organization into internal groups.

#### Ticket 5.2
Restructure Automation into clearer operational sections.

#### Ticket 5.3
Clarify Customer Experience cluster: Pulse, Reviews, Retention, Booking, Customer Payments.

#### Ticket 5.4
Clarify Inventory & Merchandising cluster: Video, Social, Recon.

## QA Checklist

### Functional

- every settings route is reachable from the appropriate group
- no hidden-but-accessible mismatch for role visibility
- search finds major settings by common admin terms
- desktop and mobile nav both work
- deep links work

### UX

- no browser alerts or confirms
- consistent back navigation
- consistent header hierarchy
- long forms warn before data loss
- status chips are readable and meaningful

### Accessibility

- sidebar and accordion fully keyboard accessible
- switches use consistent semantics
- dialogs trap focus
- status chips are not color-only

### Reliability

- root settings renders even if one status domain fails
- status panel degrades gracefully when integrations are unconfigured
- search works with partial terms

### Maintainability

- one shared settings manifest
- one shared access model
- one shared shell
- no duplicated hub rendering blocks

## Rollout Plan

### Release 1

- Epic 1
- Epic 2

Goal:
stabilize and lay foundation without full IA shift

### Release 2

- Epic 3

Goal:
ship new root settings navigation

### Release 3

- Epic 4
- first half of Epic 5

Goal:
make major subpages feel coherent

### Release 4

- remaining Epic 5
- QA polish

Goal:
complete enterprise-grade settings experience

## Exit Criteria

This build package is complete when:

- engineering can implement without reinterpreting the IA
- design direction is specific enough to avoid ad hoc page-by-page solutions
- permissions, navigation, and status concerns are accounted for up front
- QA has concrete success conditions for rollout

## Recommended Next Step

Start with `Epic 1` and `Epic 2`.

That gives the best risk-adjusted path:
- remove UX debt first
- establish shared patterns second
- only then migrate the hub and subpages

That sequence is the most likely to produce a clean enterprise result without creating more inconsistency during the transition.
