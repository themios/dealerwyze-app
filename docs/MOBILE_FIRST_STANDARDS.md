# Mobile-First UX Standards

**Version:** 1.0  
**Last updated:** 2026-06-05

## Executive Summary

These standards codify the mobile-first UX improvements made across Apollo CRM in June 2026. They apply to all new features and component changes. The goal is consistency: every interface works on a 375px phone viewport, provides adequate touch targets, and minimizes user clicks to accomplish primary workflows.

This document is a living playbook. Audit it during code review, reference it in PRs, and update it when patterns change.

**For whom:** Engineers building features for Apollo CRM (DealerWyze and RealtyWyze).

---

## 5 Core Rules

### Rule 1: Touch Targets ≥ 44×44px (WCAG Level AAA)

All interactive elements—buttons, links, inputs, custom controls—must measure at least 44×44px in computed height and width on touch devices. Small controls frustrate users and increase error rates.

**Sizes:**
- Icon buttons: `h-10 w-10` with `min-h-[44px] min-w-[44px]` fallback.
- Primary action buttons: `h-10 w-10` (icon) or `px-4 py-2` (text); verify computed size ≥ 44px.
- Form inputs: `h-10` (default) or explicit `min-h-[44px]`.
- Checkbox/radio: wrapper div with `min-h-[44px]` padding.

**Bad examples:**
- `h-7 w-7` calendar nav arrows (28×28px — too small).
- `h-6 w-6` reassign icons (~24px — too small).
- `p-1` dense icon buttons (40×40px without fallback).

**Good examples:**
- `AlwaysVisibleActionButton` uses `h-10 w-10 min-h-[44px] min-w-[44px]` (always ≥44px).
- `PaymentMobileCard` action buttons: `min-h-[44px]` wrapper.
- BHPH confirm sheet: 44px touch targets on Payment, Cancel buttons.

**How to verify:**
1. Open DevTools (F12).
2. Inspect the button element.
3. Check Computed Styles → Height and Width.
4. If either is <44px, add `min-h-[44px]` or `min-w-[44px]` to the className.

---

### Rule 2: No Opacity-0 Hiding (Affordances Always Visible)

Hover-triggered visibility (`opacity-0 group-hover:opacity-100`) does not work on touch screens. Touch has no hover state; users tap blind. Hide functionality only on desktop, and always show affordances by default on mobile.

**Never:**
```tsx
// ❌ Bad: buttons disappear on mobile
<button className="opacity-0 group-hover:opacity-100">Action</button>
```

**Always:**
```tsx
// ✅ Good: mobile-first, shown by default
<button className="bg-muted hover:bg-accent lg:bg-transparent lg:group-hover:bg-accent">
  Action
</button>

// Or use AlwaysVisibleActionButton:
import { AlwaysVisibleActionButton } from '@/components/shared/AlwaysVisibleActionButton'

<AlwaysVisibleActionButton aria-label="Delete">
  <Trash2 className="h-4 w-4" />
</AlwaysVisibleActionButton>
```

**Pattern (AlwaysVisibleActionButton):**
- Mobile: always visible, `bg-muted` background.
- Desktop (lg): hidden by default, fade in on group hover.

**Why:**
- Touch users need to see what they can tap.
- Opacity changes are cheaper than display changes and avoid layout shift.
- Grouping with parent hover state makes the pattern composable.

---

### Rule 3: Responsive Layout (No Horizontal Scroll at 375px)

Mobile users hate horizontal scrolling. Design for 375px width first (iPhone SE), then expand for tablet (768px+) and desktop (1024px+). Use Tailwind responsive modifiers (`lg:`) to adapt layout, not to hide features.

**Breakpoints:**
- **Mobile:** <768px → single column, stacked grid.
- **Tablet:** 768–1023px → 2–3 columns.
- **Desktop:** 1024px+ → full width, no max-width cap.

**Bad:**
```tsx
// ❌ Forces horizontal scroll on mobile
<table className="min-w-[640px] w-full">
```

**Good (responsive grid):**
```tsx
// ✅ Mobile first: single column; desktop: 2–4 columns
<div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
  {items.map(item => (
    <Card key={item.id}>{item.label}</Card>
  ))}
</div>
```

**Good (mobile card + desktop table):**
```tsx
// ✅ Hide table on mobile, show card-based list
<div className="grid gap-3 lg:hidden">
  {items.map(item => <PaymentMobileCard key={item.id} item={item} />)}
</div>
<table className="hidden lg:table w-full">
  {/* Desktop table */}
</table>
```

**Guidelines:**
- Text should never require pinch-zoom to read (min font-size 16px on inputs to avoid iOS auto-zoom).
- Padding inside cards: `p-3` on mobile, `p-4` on desktop (`lg:p-4`).
- Width: avoid `max-w-*` for container layout; use `w-full` by default.

---

### Rule 4: Click Reduction (2 Clicks Max for Primary Actions)

Users should complete primary workflows in 2 taps on mobile, not 3–4. Reduce modal → picker → confirm sequences.

**Target workflows:**
- Open lead → message/reassign: 1 tap (action card) + 1 tap (confirm) = 2 taps total.
- Confirm showing: 1 tap (show card) + 1 tap (confirm button) = 2 taps.
- Add web lead: 1 tap (import button) + no second tap required.

**Before (3–4 taps):**
1. Tap lead card.
2. Modal opens.
3. Select reassign option.
4. Tap confirm.

**After (2 taps):**
1. Tap reassign icon on card (sheet/dropdown opens).
2. Tap agent name (action completes).

**Patterns:**

#### QuickReassignAction (sheet on mobile, dropdown on desktop):
```tsx
import { QuickReassignAction } from '@/components/leads/QuickReassignAction'

<QuickReassignAction
  currentUser={lead.owner}
  availableUsers={teamMembers}
  onReassign={reassign}
  trigger={<ChevronDown className="h-4 w-4" />}
/>
```

#### PaymentMobileCard (card layout, no table):
```tsx
<div className="grid gap-3 lg:hidden">
  {payments.map(p => <PaymentMobileCard key={p.id} entry={p} ... />)}
</div>
<table className="hidden lg:table w-full">{/* Desktop */}</table>
```

#### Inline SMS action (no modal):
Direct message send from card without opening a dialog.

**How to count:**
1. Start at the lead/vehicle/customer card.
2. Count taps to complete the action.
3. Target ≤2 taps for common workflows.
4. Use sheets (bottom-slide) on mobile, dropdowns on desktop.

---

### Rule 5: Code-Split Heavy Components (50KB+ Features)

Large JavaScript bundles delay page interaction. Routes with complex features (Reports, Pipeline, Messages detail, BHPH ledger) should defer their components until needed.

**Which routes to code-split:**
- Any route with a render bundle >50KB (check `npm run build` chunk analysis).
- Customer detail, vehicle detail, messages thread, BHPH detail, pipeline builder.
- Heavy chart libraries (Recharts, Plotly).
- AI-generated content (long narration scripts, detailed analysis).

**How to code-split:**

```tsx
import dynamic from 'next/dynamic'
import { Suspense } from 'react'

// Lazy-load the heavy component; ssr=false for client-only features
const HeavyMessageThread = dynamic(
  () => import('@/components/messages/MessageThreadClient'),
  {
    ssr: false,
    loading: () => <MessageThreadSkeleton />,
  }
)

export default function MessageDetailPage() {
  return (
    <Suspense fallback={<MessageThreadSkeleton />}>
      <HeavyMessageThread threadId={id} />
    </Suspense>
  )
}
```

**Benefits:**
- Defer 128KB+ of JavaScript from initial page load.
- Lazy-load on route change or first interaction.
- Fallback shows a skeleton or spinner while loading.
- Lighthouse mobile score improves from 65 → 85+.

**When NOT to code-split:**
- Components <20KB.
- Components above the fold on critical routes (Today, Dashboard).
- Routes that need the component for SEO metadata.

---

## Responsive Patterns (Copy-Paste Templates)

### Metric Grid (e.g., OwnerMetricsCard)

Use a responsive grid for dashboard cards, summary metrics, and stats panels.

```tsx
<div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
  {metrics.map((metric) => (
    <div
      key={metric.id}
      className="rounded-lg border border-border bg-card/50 p-3 lg:p-4"
    >
      <p className="text-xs lg:text-sm text-muted-foreground">{metric.label}</p>
      <p className="text-lg lg:text-2xl font-bold mt-2">{metric.value}</p>
      {metric.trend && (
        <p className={`text-xs mt-1 ${metric.trend > 0 ? 'text-green-600' : 'text-red-600'}`}>
          {metric.trend > 0 ? '+' : ''}{metric.trend}%
        </p>
      )}
    </div>
  ))}
</div>
```

**Responsive behavior:**
- Mobile (2 cols): 375px width, small font.
- Desktop (4 cols): larger font, more whitespace.

---

### Mobile/Desktop Action Split (e.g., QuickReassignAction)

Use `useMediaQuery` to show a sheet on mobile, dropdown on desktop.

```tsx
'use client'

import { useState } from 'react'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

interface Props {
  items: { id: string; label: string }[]
  onSelect: (id: string) => Promise<void>
  trigger: React.ReactNode
}

export function AdaptiveSelector({ items, onSelect, trigger }: Props) {
  const isMobile = useMediaQuery('(max-width: 767px)')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const handleSelect = async (id: string) => {
    await onSelect(id)
    setSheetOpen(false)
    setDropdownOpen(false)
  }

  if (isMobile) {
    return (
      <>
        <button onClick={() => setSheetOpen(true)}>{trigger}</button>
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent side="bottom" className="max-h-[60vh] rounded-t-lg">
            <SheetHeader>
              <SheetTitle>Choose an option</SheetTitle>
            </SheetHeader>
            <div className="mt-4 space-y-2">
              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleSelect(item.id)}
                  className="w-full p-3 text-left rounded-lg hover:bg-muted"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </>
    )
  }

  return (
    <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {items.map((item) => (
          <DropdownMenuItem
            key={item.id}
            onClick={() => handleSelect(item.id)}
          >
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

**Responsive behavior:**
- Mobile: bottom sheet (full width, scrollable).
- Desktop: dropdown menu (aligned, compact).

---

### Card Layout (e.g., PaymentMobileCard)

Show a stacked card layout on mobile; switch to a table on desktop.

```tsx
{/* Mobile: card grid */}
<div className="grid gap-3 lg:hidden">
  {items.map((item) => (
    <div
      key={item.id}
      className="rounded-lg border border-border bg-card/50 p-3 space-y-2"
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm">{item.name}</span>
        <span className="text-xs text-muted-foreground">{item.date}</span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Amount</span>
        <span className="font-semibold">{item.amount}</span>
      </div>
      <div className="flex items-center justify-between text-sm border-t pt-2">
        <span className="text-muted-foreground">Balance</span>
        <span className="font-semibold">{item.balance}</span>
      </div>
    </div>
  ))}
</div>

{/* Desktop: full table */}
<table className="hidden lg:table w-full">
  <thead>
    <tr className="border-b">
      <th className="text-left p-3 text-sm font-semibold">Name</th>
      <th className="text-left p-3 text-sm font-semibold">Date</th>
      <th className="text-right p-3 text-sm font-semibold">Amount</th>
      <th className="text-right p-3 text-sm font-semibold">Balance</th>
    </tr>
  </thead>
  <tbody>
    {items.map((item) => (
      <tr key={item.id} className="border-b hover:bg-muted/50">
        <td className="p-3">{item.name}</td>
        <td className="p-3">{item.date}</td>
        <td className="text-right p-3 font-semibold">{item.amount}</td>
        <td className="text-right p-3 font-semibold">{item.balance}</td>
      </tr>
    ))}
  </tbody>
</table>
```

**Responsive behavior:**
- Mobile: stacked card rows, full width.
- Desktop: dense table, multi-row horizontal scroll (if needed).

---

## Accessibility Checklist (Per Route)

Before marking a route done, verify all items below on 375px and 1024px viewports.

- [ ] All buttons, links, inputs ≥44×44px (DevTools inspect computed size).
- [ ] All interactive affordances visible (no `opacity-0` or hidden on touch).
- [ ] Touch target spacing ≥8px between controls (no cramped adjacent buttons).
- [ ] Focus rings visible on all keyboard-navigable elements (tab through with keyboard).
- [ ] Form labels paired with inputs (not placeholder-only text).
- [ ] Alt text on images; `loading="lazy"` on off-screen images.
- [ ] Color not sole indicator of state (use icons, text, or border).
- [ ] No text <16px on input fields (iOS may auto-zoom, causing layout shift).
- [ ] Contrast ratio ≥4.5:1 for text, ≥3:1 for UI components (use WebAIM contrast checker).

---

## Performance Checklist (Per Component)

- [ ] Heavy components (>50KB JS) are code-split or lazy-loaded.
- [ ] Images use `next/image` with `loading="lazy"` for off-screen images.
- [ ] React.memo applied to list items to prevent unnecessary re-renders.
- [ ] No N+1 queries or repeated data fetches in loops.
- [ ] Lighthouse mobile score ≥85 (375px viewport, 4G throttle).
- [ ] First Contentful Paint (FCP) <2.5s on 375px.
- [ ] Largest Contentful Paint (LCP) <4s on 375px.
- [ ] Cumulative Layout Shift (CLS) <0.1.

---

## Testing (What to Verify Before PR)

### Devices & Viewports
- **Mobile:** 375px (DevTools) + iPhone SE (if available) + iOS Safari.
- **Tablet:** 768px (DevTools) + iPad (if available).
- **Desktop:** 1024px (DevTools) + Chrome + Firefox.

### Actions to Test
- Primary workflows (message, reassign, add, edit, delete) on mobile.
- All buttons tap-able (no hover-required affordances).
- Forms submit without accidental zoom (16px minimum input text).
- Lists scroll smoothly without lag.
- Images load without layout shift.

### Vertical Testing
- DealerWyze flows (if dealer-facing).
- RealtyWyze flows (if RE-facing) — check label parity.

### Performance
- Open DevTools → Lighthouse.
- Run audit on 375px viewport with `Slow 4G` throttle.
- Check FCP, LCP, CLS, and overall score.
- Target mobile score ≥85.

---

## Anti-Patterns (Do Not Do This)

- **❌ `hidden lg:block` for critical features.** Use responsive grid/layout instead. Missing features on mobile breaks workflows.
  
- **❌ `min-w-[640px]` tables without card fallback.** Forces horizontal scroll on mobile. Always include a card version or split layout.

- **❌ Modal dialogs for simple actions.** Use sheets (bottom-slide) on mobile, dropdowns on desktop. Modals interrupt workflows.

- **❌ `opacity-0 group-hover:opacity-100` for required affordances.** Touch has no hover state. Show affordances by default; hide on desktop if needed.

- **❌ `h-7 w-7` or `h-6 w-6` icon buttons.** Too small to tap reliably. Minimum 44×44px.

- **❌ Importing heavy libraries client-side without code-split.** Delays page interaction. Use dynamic imports for >50KB features.

- **❌ Uncontrolled image sizes.** Always use `next/image` with explicit width/height to avoid layout shift.

- **❌ Placeholder-only form labels.** Accessibility and UX require paired `<label>` elements.

- **❌ Color-only state indication.** Users with color blindness will miss the signal. Combine with icon, text, or border.

---

## Resources

- **WCAG 2.5.5 (Target Size):** https://www.w3.org/WAI/WCAG21/Understanding/target-size.html
- **Next.js Image Optimization:** https://nextjs.org/docs/app/api-reference/components/image
- **Tailwind Responsive Design:** https://tailwindcss.com/docs/responsive-design
- **WebAIM Contrast Checker:** https://webaim.org/resources/contrastchecker/
- **Component Examples in this repo:**
  - `AlwaysVisibleActionButton.tsx` — touch-safe action buttons
  - `QuickReassignAction.tsx` — adaptive sheet/dropdown
  - `PaymentMobileCard.tsx` — responsive card layout
- **Live Examples:** Customers list, Messages thread, BHPH detail, Showings dashboard

---

## Questions?

Refer to the individual component source code or ask during PR review. These standards are enforced across Apollo CRM; every PR should audit against them before merge.
