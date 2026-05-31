# Responsive Design Patterns for DealerWyze Mobile

**Last Updated:** 2026-05-31  
**Target Devices:** iPhone SE (375px), iPhone 13 (390px), iPad (768px+)  
**Base Breakpoints:** `sm: 640px` | `md: 768px` | `lg: 1024px`

---

## Core Principles

- **Mobile-First Design:** All layouts must be readable and usable at 375px viewport width
- **Tap Targets:** Minimum 44px height/width for interactive elements on mobile
- **Typography:** Base font size 16px (no smaller) on mobile; scale up with `sm:` and `md:` classes
- **No Horizontal Scroll:** Layout must stack vertically on mobile; no overflow-x
- **Paddings & Margins:** Mobile: `px-4` base → `sm:px-6` on tablet+
- **Buttons on Mobile:** Stack vertically when space is tight; use `w-full` on mobile, `sm:w-auto` on desktop
- **Flex Wrapping:** Use `flex-col sm:flex-row` for responsive direction changes

---

## Pattern 1: Responsive Card/List Items

**Problem:** Card items with multiple fields per row (name, email, phone, time) overflow on mobile.

**Solution:** Stack information vertically on mobile, arrange horizontally on desktop.

```tsx
// Mobile: Column layout
// Desktop: Flex row with space-between

<div className={`px-4 py-3.5 sm:px-6 sm:py-4 transition-colors`}>
  <div className="flex items-start gap-3">
    <StatusDot /> {/* small icon */}
    
    <div className="flex-1 min-w-0 space-y-1.5 sm:space-y-2">
      {/* Row 1: Name + contact — stack on mobile */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-2">
        <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-1 sm:gap-x-2 sm:gap-y-0.5 min-w-0">
          <span className="text-sm sm:text-base font-semibold">Name</span>
          <a href="tel:..." className="text-sm text-primary hover:underline underline sm:no-underline sm:text-muted-foreground">
            +1 234 567 8900
          </a>
          <a href="mailto:..." className="text-xs text-primary hover:underline underline sm:no-underline sm:text-muted-foreground truncate sm:max-w-[200px]">
            email@example.com
          </a>
        </div>
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground/60 whitespace-nowrap">
          <Clock className="h-3 w-3" />
          2h ago
        </span>
      </div>
      
      {/* Row 2: Message — stays full-width */}
      <div className="rounded-md bg-muted/40 px-3 py-2 text-sm">
        Message text here...
      </div>
    </div>
  </div>
</div>
```

**Key Points:**
- `px-4 py-3.5 sm:px-6 sm:py-4` — Responsive padding
- `text-sm sm:text-base` — Readable font size on mobile (16px base)
- `flex-col sm:flex-row` — Stack → Side-by-side
- `text-primary` links on mobile (blue, tappable); `text-muted-foreground` on desktop (faded)
- `underline` on mobile for clarity; `hover:underline` on desktop

---

## Pattern 2: Responsive Buttons (Full-Width Mobile)

**Problem:** Small buttons in rows are hard to tap on mobile (< 44px).

**Solution:** Full-width buttons on mobile, inline on desktop.

```tsx
// Mobile: Stack vertically, 44px height
// Desktop: Inline row, smaller

<div className="flex flex-col sm:flex-wrap items-start sm:items-center gap-2 pt-0.5">
  {/* Primary action */}
  <button className="w-full sm:w-auto inline-flex items-center justify-center sm:justify-start gap-1.5 h-10 sm:h-8 px-3 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
    <Plus className="h-3.5 w-3.5" />
    Import as Lead
  </button>
  
  {/* Secondary action */}
  <button className="w-full sm:w-auto inline-flex items-center justify-center sm:justify-start gap-1.5 h-10 sm:h-8 px-3 rounded-md text-xs border border-border bg-background hover:bg-muted transition-colors">
    <Archive className="h-3.5 w-3.5" />
    Archive
  </button>
  
  {/* Destructive action (confirmation flow) */}
  {confirmDelete ? (
    <div className="w-full sm:w-auto flex flex-col sm:flex-row sm:items-center gap-2">
      <span className="text-xs text-destructive font-medium">Delete?</span>
      <button className="w-full sm:w-auto inline-flex items-center justify-center sm:justify-start h-10 sm:h-8 px-3 rounded-md text-xs font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors">
        Confirm
      </button>
      <button className="w-full sm:w-auto inline-flex items-center justify-center sm:justify-start h-10 sm:h-8 px-3 rounded-md text-xs border border-border bg-background hover:bg-muted transition-colors">
        Cancel
      </button>
    </div>
  ) : (
    <button className="w-full sm:w-auto inline-flex items-center justify-center sm:justify-start gap-1.5 h-10 sm:h-8 px-3 rounded-md text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
      <Trash2 className="h-3.5 w-3.5" />
      Delete
    </button>
  )}
</div>
```

**Key Points:**
- `w-full sm:w-auto` — Full width on mobile, auto on desktop
- `h-10 sm:h-8` — Tall on mobile (44px min), normal on desktop
- `justify-center sm:justify-start` — Center text on mobile, left-align on desktop
- `flex-col sm:flex-row` — Stack → Row
- Always `inline-flex` for predictable widths

---

## Pattern 3: Responsive Tabs/Chips

**Problem:** Tab labels wrap or overflow on mobile.

**Solution:** Smaller text, reduced padding on mobile.

```tsx
// Mobile: Compact with smaller text
// Desktop: Standard size

<div className="flex items-center gap-1 sm:gap-2 px-4 sm:px-6 py-2 sm:py-3 border-b border-border overflow-x-auto">
  {TABS.map(tab => (
    <button
      key={tab.key}
      onClick={() => setActiveTab(tab.key)}
      className={`inline-flex items-center gap-1.5 h-10 sm:h-8 px-2 sm:px-3 rounded-md text-xs sm:text-sm font-medium whitespace-nowrap transition-colors ${
        activeTab === tab.key
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
      }`}
    >
      {tab.label}
      {counts[tab.key] > 0 && (
        <span className={`text-[10px] sm:text-[11px] rounded-full px-1 sm:px-1.5 py-px leading-none font-semibold ${
          activeTab === tab.key
            ? 'bg-primary-foreground/20 text-primary-foreground'
            : 'bg-muted text-muted-foreground'
        }`}>
          {counts[tab.key]}
        </span>
      )}
    </button>
  ))}
</div>
```

**Key Points:**
- `gap-1 sm:gap-2` — Tighter spacing on mobile
- `px-2 sm:px-3` — Reduced padding on mobile
- `text-xs sm:text-sm` — Smaller text on mobile (still readable 16px actual)
- `h-10 sm:h-8` — Taller on mobile for easier tapping
- `overflow-x-auto` — Allow horizontal scroll if tabs don't fit

---

## Pattern 4: Responsive Grids (Cards)

**Problem:** Multi-column grids break on small screens.

**Solution:** Single column on mobile, multi-column on tablet+.

```tsx
// Mobile: 1 column
// Tablet: 2–3 columns
// Desktop: 3–4 columns

<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
  {items.map(item => (
    <Card key={item.id} data={item} />
  ))}
</div>
```

**Common Breakpoints:**
- `gap-2 sm:gap-3 md:gap-4` — Responsive gap between items
- `grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3` — Column scaling
- `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` — Skip one tier (useful for content cards)

---

## Pattern 5: Responsive Forms (Stacked Fields)

**Problem:** Form fields in rows are cramped on mobile.

**Solution:** Full-width fields on mobile, split columns on desktop.

```tsx
// Mobile: Stacked
// Desktop: 2-col or 3-col grid

<div className="space-y-4 sm:grid sm:grid-cols-2 sm:gap-4 sm:space-y-0">
  <div>
    <Label htmlFor="first-name">First Name</Label>
    <Input id="first-name" placeholder="..." />
  </div>
  
  <div>
    <Label htmlFor="last-name">Last Name</Label>
    <Input id="last-name" placeholder="..." />
  </div>
  
  <div className="sm:col-span-2">
    <Label htmlFor="email">Email</Label>
    <Input id="email" type="email" placeholder="..." />
  </div>
</div>
```

**Key Points:**
- Default: `space-y-4` (stacked)
- `sm:grid sm:grid-cols-2 sm:gap-4 sm:space-y-0` — Grid on tablet+
- `sm:col-span-2` — Full width on 2-col grid
- Use `sm:col-span-3` on 3-col grids, etc.

---

## Pattern 6: Responsive Tables (Horizontal Scroll on Mobile)

**Problem:** Tables don't fit on mobile screens.

**Solution:** Wrap table in horizontal scroll container.

```tsx
// Mobile: Scrollable table
// Desktop: Normal width

<div className="w-full overflow-x-auto">
  <table className="w-full text-sm border-collapse">
    <thead>
      <tr className="border-b border-border">
        <th className="text-left px-3 py-2 sm:px-4 sm:py-3 font-semibold">Name</th>
        <th className="text-left px-3 py-2 sm:px-4 sm:py-3 font-semibold">Status</th>
        <th className="text-right px-3 py-2 sm:px-4 sm:py-3 font-semibold">Amount</th>
      </tr>
    </thead>
    <tbody>
      {rows.map(row => (
        <tr key={row.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
          <td className="px-3 py-2 sm:px-4 sm:py-3 text-sm">{row.name}</td>
          <td className="px-3 py-2 sm:px-4 sm:py-3 text-xs text-muted-foreground">{row.status}</td>
          <td className="px-3 py-2 sm:px-4 sm:py-3 text-right font-mono">${row.amount}</td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

**Key Points:**
- Parent `overflow-x-auto` allows horizontal scroll
- Table width can be wider than viewport (min-width: 100%)
- Reduce padding on mobile (`px-3 py-2`), normal on desktop (`sm:px-4 sm:py-3`)

---

## Pattern 7: Responsive Modals/Sheets

**Problem:** Bottom sheets (Sheet components) should be full-height on mobile, sized on desktop.

**Solution:** Use native Sheet behavior; configure `side="bottom"`.

```tsx
// Already built-in to shadcn/ui Sheet component
// Mobile: Full height from bottom
// Desktop: Centered modal

<Sheet open={isOpen} onOpenChange={setOpen}>
  <SheetContent side="bottom" className="h-[50vh] sm:h-auto rounded-t-2xl sm:rounded-lg flex flex-col">
    <SheetHeader className="flex-shrink-0 mb-4">
      <SheetTitle>Dialog Title</SheetTitle>
    </SheetHeader>
    
    <div className="flex-1 overflow-y-auto space-y-4 px-4 sm:px-6">
      {/* Content */}
    </div>
    
    <SheetFooter className="px-0 flex-col gap-2 sm:flex-row sm:justify-end mt-4 flex-shrink-0">
      <Button variant="outline">Cancel</Button>
      <Button>Save</Button>
    </SheetFooter>
  </SheetContent>
</Sheet>
```

**Key Points:**
- `side="bottom"` for mobile sheets
- `h-[50vh]` on mobile, auto on desktop
- `rounded-t-2xl sm:rounded-lg` — Top-round on mobile, normal on desktop
- `flex-col sm:flex-row` footer buttons
- Content area: `flex-1 overflow-y-auto` for scrolling

---

## Responsive Typography Scale

Keep text readable at 375px—base font size must be **16px or larger**.

| Element        | Mobile (375px) | Tablet (640px+) | Desktop (1024px+) |
|---|---|---|---|
| `text-xs`      | 12px           | 12px            | 12px              |
| `text-sm`      | 14px           | 14px            | 14px              |
| `text-base`    | 16px (default) | 16px            | 16px              |
| `text-lg`      | 18px           | 18px            | 18px              |
| `text-xl`      | 20px           | 20px            | 20px              |
| `text-2xl`     | 24px           | 28px            | 30px              |

**Mobile Recommendation:** Never use text smaller than 14px; use `sm:text-xs` for secondary info.

---

## Common Pitfalls & Fixes

| Problem | Bad | Good |
|---|---|---|
| Text too small on mobile | `text-xs` always | `text-xs sm:text-sm` |
| Buttons too small | `h-6 px-2` | `h-10 sm:h-8 px-3` |
| No gap between items | `gap-0` | `gap-2 sm:gap-3` |
| Horizontal scroll | `whitespace-nowrap` in list | Use cards or `overflow-x-auto` |
| Links not tappable | 30px height button | `h-10 sm:h-8` (10 = 40px on mobile) |
| Padding too tight | `px-2` | `px-4 sm:px-6` |
| Badge text wraps | No width limit | `max-w-[150px] truncate` |
| Modals overflow viewport | Fixed height | `max-h-[90vh] overflow-y-auto` |

---

## Testing Checklist

Before committing responsive changes:

- [ ] No horizontal scroll at 375px viewport
- [ ] Text readable (16px base minimum)
- [ ] All buttons 44px min (height + width)
- [ ] Links/CTAs underlined or colored on mobile
- [ ] Forms stack vertically on mobile
- [ ] Tabs fit without wrapping (or allow overflow-x-auto scroll)
- [ ] Images scale down proportionally
- [ ] Modals and sheets don't overflow
- [ ] Touch targets spaced 8px+ apart
- [ ] Console has no layout warnings

---

## Implementation Guide

**When building a new page or component:**

1. **Check the mobile-first layout first** — Design for 375px, then enhance with `sm:`, `md:` classes
2. **Use responsive utilities** — `flex-col sm:flex-row`, `w-full sm:w-auto`, `text-sm sm:text-base`
3. **Test early** — Chrome DevTools: Set device to iPhone SE (375×667), rotate to landscape
4. **Group responsive classes** — `className="px-4 sm:px-6 py-3 sm:py-4"` is clearer than scattered classes
5. **Document your patterns** — Add a comment if the responsive logic is non-obvious

---

## Related Files

- Tailwind config: `tailwind.config.ts`
- Component library: `components/ui/` (Button, Input, Sheet, etc.)
- Example pages with good responsive patterns:
  - `app/(app)/leads/web/WebLeadsClient.tsx` — Responsive card list
  - `app/(app)/settings/sequences/SequencesClient.tsx` — Responsive tabs + list
  - `components/content/ContentDraftsClient.tsx` — Responsive grid

---

**Last Updated:** 2026-05-31  
**Responsible:** Tim (Product)  
**Questions?** Check existing pages or ask Tim about responsive patterns.
