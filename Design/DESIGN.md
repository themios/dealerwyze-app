# DealerWyze Design System

> Pass this file to Claude Design (claude.ai/design) or any AI agent building UI for this project.
> Every screen, component, and copy decision should follow this file.

---

## 1. Visual Theme & Atmosphere

**Product:** DealerWyze — SaaS CRM for independent and used-car dealerships  
**Audience:** Small dealer owners and their staff (not enterprise, not tech-native)  
**Mood:** Warm, trustworthy, professional — like a well-run dealership office, not a cold fintech dashboard  

Light mode is the default. Dark mode inverts to a deep navy canvas with orange as the primary accent.

- **Light:** Warm off-white base (`#F8F4EE`), white cards, navy headings, orange CTAs
- **Dark:** Deep navy-black base (`#07131F`), dark card surfaces, orange primary, amber accents
- **Density:** Medium — enough breathing room for mobile-first use, but data-dense enough for desktop power users
- **Motion:** Subtle. Page transitions fade+slide 6px over 250ms. Card hover lifts 1px. No bouncing, no dramatic reveals.

---

## 2. Color Palette & Roles

### Light Mode

| Token | Hex | Role |
|-------|-----|------|
| `--background` | `#F8F4EE` | Page background — warm off-white |
| `--foreground` | `#0A1628` | Body text — deep navy |
| `--card` | `#FFFFFF` | Card/panel surfaces |
| `--card-foreground` | `#0A1628` | Text on cards |
| `--primary` | `#0D2B55` | Primary action color — deep navy blue |
| `--primary-foreground` | `#FFFFFF` | Text on primary buttons |
| `--secondary` | `#EDE8E0` | Secondary button backgrounds, tags |
| `--secondary-foreground` | `#0D2B55` | Text on secondary elements |
| `--muted` | `#EDE8E0` | Muted backgrounds, skeleton loaders |
| `--muted-foreground` | `#6B6355` | Placeholder text, labels, metadata |
| `--accent` | `#FEF3E2` | Accent backgrounds (orange tint) |
| `--accent-foreground` | `#92560A` | Text on accent backgrounds |
| `--destructive` | `#E03A1E` | Errors, delete actions, alerts |
| `--border` | `#DDD8CF` | All borders, dividers |
| `--input` | `#DDD8CF` | Input field borders |
| `--ring` | `#0D2B55` | Focus rings |
| `--brand-orange` | `#F07018` | Primary brand accent — CTAs, badges, highlights |
| `--brand-amber` | `#F5A623` | Secondary warm accent — warnings, stars |
| `--brand-green` | `#2A6B1A` | Success states, sold badges |
| `--brand-coral` | `#E03A1E` | Destructive / hot lead indicators |

### Dark Mode

| Token | Hex | Role |
|-------|-----|------|
| `--background` | `#07131F` | Page background — deep navy black |
| `--foreground` | `#F0EBE3` | Body text — warm white |
| `--card` | `#0D1F33` | Card surfaces |
| `--primary` | `#F07018` | Primary action — orange (navy → orange flip) |
| `--secondary` | `#122A44` | Secondary surfaces |
| `--muted` | `#122A44` | Muted backgrounds |
| `--muted-foreground` | `#8A8070` | Placeholder / metadata text |
| `--accent` | `#1C3A5C` | Accent backgrounds |
| `--accent-foreground` | `#F5A623` | Amber text on dark accents |
| `--destructive` | `#FF5436` | Errors |
| `--border` | `rgba(255,255,255,0.10)` | Borders |
| `--sidebar` | `#0D1F33` | Sidebar panel |

### Semantic Color Usage Rules

- **Orange (`--brand-orange`)** — the primary CTA color in dark mode, and the highlight/badge color in light mode. Use for: primary buttons in dark, status badges, notification dots, the DW logo mark.
- **Navy (`--primary` light)** — use for primary buttons in light mode, active nav items, headings on cards.
- **Never use pure black or pure white for text** — always use the foreground/card-foreground tokens.
- **Destructive red** — delete buttons, error toasts, overdue task indicators, and hot lead alerts only.
- **Green** — sold/won status badges, success toasts, positive trend arrows.
- **Amber** — warnings, pending states, star ratings, sequence step indicators.

---

## 3. Typography

### Fonts

| Role | Family | Weights | Variable |
|------|--------|---------|----------|
| Display (headings, hero) | Barlow Semi Condensed | 600, 700, 800 | `--font-display` |
| Body (UI copy, labels) | Archivo | 400, 500, 600 | `--font-body` |
| Mono (VINs, codes, IDs) | Geist Mono | 400 | `--font-mono` |

### Type Scale

| Element | Size | Weight | Family | Notes |
|---------|------|--------|--------|-------|
| Page title (h1) | 28–32px | 700 | Display | Section titles like "Customers", "Today" |
| Section heading (h2) | 20–24px | 600 | Display | Card headers, panel titles |
| Sub-heading (h3) | 16–18px | 600 | Body | Within cards |
| Body text | 14–16px | 400 | Body | Default UI copy |
| Label / caption | 12px | 500 | Body | Form labels, table headers, metadata |
| Badge / tag | 11–12px | 600 | Body | Uppercase OK for status badges |
| Mono (VIN, ID) | 13px | 400 | Mono | Always monospace for VINs, phone numbers in data tables |

### Rules
- No em-dashes (—) anywhere in user-facing copy. Use a hyphen or rewrite the sentence. Em-dashes are an AI tell.
- Sentence case for all UI labels and buttons ("Add customer", not "Add Customer")
- Headings may be title case only in marketing/landing contexts

---

## 4. Component Styling

### Buttons

```
Primary (light):   bg-[#0D2B55]  text-white  hover:bg-[#0A2347]
Primary (dark):    bg-[#F07018]  text-white  hover:bg-[#D85F10]
Secondary:         bg-[#EDE8E0]  text-[#0D2B55]  hover:bg-[#DDD8CF]
Destructive:       bg-[#E03A1E]  text-white  hover:bg-[#C03318]
Ghost:             bg-transparent  hover:bg-muted
Height:            36px (default), 32px (sm), 40px (lg)
Border radius:     0.625rem (10px)
Font:              14px / 500 / Archivo
Padding:           px-4 py-2
```

### Cards

```
Background:  white (light) / #0D1F33 (dark)
Border:      1px solid --border
Border radius: 0.625rem (10px)
Padding:     16px
Shadow:      0 1px 3px rgba(0,0,0,0.06) — light; none in dark
Hover state: translateY(-1px), shadow 0 4px 12px rgba(13,43,85,0.12)
Transition:  0.15s ease
```

### Inputs & Form Fields

```
Border:        1px solid --input (#DDD8CF light / rgba white 12% dark)
Border radius: 0.625rem
Height:        36px (default)
Padding:       px-3 py-2
Font:          14px / 400 / Archivo
Focus:         ring-2 ring-[--ring]/30 — never full ring, always 30% opacity
Background:    white (light) / transparent (dark)
Placeholder:   --muted-foreground
```

### Badges / Status Tags

```
Shape:    rounded-full or rounded-md (never square)
Padding:  px-2 py-0.5
Size:     text-[11px] font-semibold

Status colors:
  new/active:   bg-[#FEF3E2] text-[#92560A]     (amber tint)
  sold/won:     bg-green-100 text-green-800
  hot lead:     bg-red-100 text-red-700 (+ flame icon)
  pending:      bg-[#EDE8E0] text-[#6B6355]
  sequence:     bg-blue-50 text-blue-700
```

### Navigation / Sidebar

```
Width:          64px (collapsed icon-only) / 220px (expanded)
Background:     white (light) / #0D1F33 (dark)
Active item:    bg-[#FEF3E2] text-[#92560A] (light) / bg-[#1C3A5C] text-[#F5A623] (dark)
Icon size:      20px (Lucide icons)
Item padding:   px-3 py-2
Border right:   1px solid --border
Font:           13px / 500 / Archivo
```

### Tables / Lists

```
Row height:    48px (comfortable touch target)
Divider:       border-b border-[--border]
Hover:         bg-[--muted] transition 100ms
Header:        text-[11px] font-semibold uppercase tracking-wider text-[--muted-foreground]
Cell text:     14px / 400
Sticky header: yes on scrollable tables
```

### Toasts / Notifications

```
Position:  bottom-right (desktop) / bottom-center (mobile)
Duration:  3000ms success / 5000ms error
Success:   green-50 border-green-200 text-green-800
Error:     red-50 border-red-200 text-red-800
Warning:   amber-50 border-amber-200 text-amber-800
Info:      blue-50 border-blue-200 text-blue-800
```

---

## 5. Layout Principles

### Spacing Scale (4px base grid)

```
4px   — micro gap (icon-to-label, tight badge padding)
8px   — small gap (related elements within a card)
12px  — default gap (between form fields, list items)
16px  — card padding, section dividers
24px  — between cards, major section spacing
32px  — page-level vertical rhythm
48px  — large section breaks
```

### Page Layout

```
Mobile:   full-width, bottom nav bar, 16px horizontal padding
Tablet:   sidebar visible, main content flex-1
Desktop:  sidebar 220px + main content, max-width 1280px centered
```

### Grid

```
Dashboard cards:  2-col mobile / 3-col tablet / 4-col desktop
Form layouts:     1-col mobile / 2-col desktop
List views:       always single column (data density over grid)
```

---

## 6. Motion & Animation

```
Page enter:    opacity 0→1 + translateY 6px→0, 250ms, cubic-bezier(0.16, 1, 0.3, 1)
Card hover:    translateY -1px, 150ms ease
List stagger:  40ms delay per item (framer-motion)
Skeleton:      pulse opacity 0.4→0.8, 1.2s ease-in-out infinite, staggered 100ms

Rule: motion communicates state change only. No decorative spinning, no attention-seeking.
Rule: respect prefers-reduced-motion — wrap all framer-motion in useReducedMotion check.
```

---

## 7. Iconography

```
Library:    Lucide React (exclusively — no mixing icon libraries)
Size:       16px (inline/label), 20px (nav/action), 24px (hero/feature callout)
Stroke:     1.5px (default Lucide)
Color:      inherit from text color — never hardcode icon colors
```

---

## 8. Voice & Copy Rules

- **Plain English only.** No jargon. Say "texting" not "SMS", "picture messages" not "MMS".
- **State what happened + next step.** Every error message tells the user what broke AND what to do next.
- **No em-dashes.** Use a hyphen or rewrite the sentence.
- **Sentence case** on all UI labels, button text, and toast messages.
- **Dealer-first framing.** "Your customers", "your leads", "your inventory" — this is their business.
- **Numbers in context.** "47 customers" not "47 records". "3 unread" not "3 items".

---

## 9. DealerWyze-Specific Patterns

### The Today Queue (main daily driver screen)
- Cards are the primary unit. Full-width on mobile.
- Lead cards: customer name (large, 16px/600), vehicle interest, source badge, time elapsed
- Action buttons always at bottom of card: Call, Text, Dismiss — minimum 44px touch target
- Addressed (dismissed) cards slide out with opacity transition, never jump

### Vehicle Cards (inventory list)
- Photo on left (64x64 thumbnail), specs on right
- Year/Make/Model in 15px/600, price in brand-orange, mileage in muted
- Status badge top-right: Available / Sold / Pending / Recon

### Customer Profile
- Header: name (24px display), phone + email as tappable links
- Activity timeline: newest first, icon per type (call/text/email/note), timestamp relative
- Quick action bar sticky at bottom on mobile

### BHPH / Finance
- Payment amounts always in brand-orange (due) or green (paid)
- Overdue indicators in brand-coral with alert icon
- Never show raw SQL-style IDs to users — always show customer name + last 4 VIN

### Sequence / Autoresponder
- Step pills: numbered circles, connected by a thin line
- Active step: filled navy (light) / orange (dark)
- Completed: filled green with checkmark
- Upcoming: outline only, muted

---

## CSS Variables (copy-paste ready)

```css
:root {
  --radius: 0.625rem;
  --background: #F8F4EE;
  --foreground: #0A1628;
  --card: #FFFFFF;
  --card-foreground: #0A1628;
  --primary: #0D2B55;
  --primary-foreground: #FFFFFF;
  --secondary: #EDE8E0;
  --secondary-foreground: #0D2B55;
  --muted: #EDE8E0;
  --muted-foreground: #6B6355;
  --accent: #FEF3E2;
  --accent-foreground: #92560A;
  --destructive: #E03A1E;
  --border: #DDD8CF;
  --input: #DDD8CF;
  --ring: #0D2B55;
  --brand-orange: #F07018;
  --brand-amber: #F5A623;
  --brand-green: #2A6B1A;
  --brand-coral: #E03A1E;
}

.dark {
  --background: #07131F;
  --foreground: #F0EBE3;
  --card: #0D1F33;
  --primary: #F07018;
  --primary-foreground: #FFFFFF;
  --secondary: #122A44;
  --secondary-foreground: #D6CFC5;
  --muted: #122A44;
  --muted-foreground: #8A8070;
  --accent: #1C3A5C;
  --accent-foreground: #F5A623;
  --destructive: #FF5436;
  --border: rgba(255, 255, 255, 0.10);
  --input: rgba(255, 255, 255, 0.12);
  --ring: #F07018;
  --brand-orange: #F07018;
  --brand-amber: #F5A623;
  --brand-green: #3D9926;
  --brand-coral: #FF5436;
}
```
