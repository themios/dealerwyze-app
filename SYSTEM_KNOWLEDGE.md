# RealtyWyze System Knowledge Base

**This document describes the real, verified UI structure of RealtyWyze for use in AI-grounded help responses.**

Last verified: 2026-05-29

---

## Navigation Structure (Left Sidebar)

The left sidebar appears on all pages in RealtyWyze (when not in admin mode). It displays a vertical menu of navigation links.

**Main Navigation Items (in order):**
1. **Dashboard** → `/dashboard`
2. **Today** → `/today`
3. **Leads** → `/customers` (Note: labeled "Leads" in the sidebar but routes to /customers)
4. **Web Leads** → `/leads/web` (Shows count badge of new web inquiries)
5. **Inventory** → `/vehicles`
6. **Contacts** → `/contacts`
7. **Showings** → `/showings` (Real Estate only)
8. **Commissions** → `/commissions` (Real Estate only)
9. **Messages** → `/messages` (Shows inbox count badge)
10. **Support** → `/support`
11. **Settings** → `/settings`

**Visual Notes:**
- Active page highlighted in orange (#F07018)
- Dark blue background (#0D2B55)
- Icons precede labels
- Some items show count badges (new messages, web leads, etc.)

---

## Leads Page (`/customers`)

**Page Title:** "Leads (N)" where N is the count of active leads

**Top Right Controls:**
- When NOT viewing archived: A **Plus (+) icon button** (size: sm, variant: ghost) with title "Add lead"
- When viewing archived: "Active" button to return to active leads view

**Sub-navigation Tabs (below TopBar):**
- **List** (default view) → shows leads as a list
- **Pipeline** → shows leads organized by sales stage
- **Segments** → shows filtered lead groups
- **Archived** → shows archived leads

**Add Lead Menu (Plus button dropdown):**
Clicking the Plus button opens a dropdown menu with four options:
1. **Add manually** (icon: UserPlus)
   - Label: "Add manually"
   - Action: Opens form at `/customers/new`
   - Allows entering lead details by hand

2. **Scan lead** (icon: ScanLine)
   - Label: "Scan lead"
   - Action: Opens dialog with camera/OCR
   - Extracts lead info from business card or document photo

3. **Paste lead** (icon: ClipboardPaste)
   - Label: "Paste lead"
   - Action: Opens paste dialog
   - Extracts lead info from copied text

4. **Import CSV** (icon: FileSpreadsheet)
   - Label: "Import CSV"
   - Action: Opens import dialog
   - Bulk-uploads leads from spreadsheet

**Empty State:**
When no leads exist, page shows:
- Icon: UserX
- Title: "No leads yet"
- Description: "Add your first lead to get started"
- Action button: "Add First Lead" → `/customers/new`

---

## Add Lead Manually (`/customers/new`)

**How to add a lead:**
1. Navigate to **Leads** page (left sidebar)
2. Click the **+** (Plus) icon button in the top right
3. From the dropdown menu, select **Add manually**
4. Fill in the lead details:
   - **Name** (required)
   - **Phone** (required)
   - **Email** (optional, add later)
   - **Address** (optional, add later)
   - **Notes** (optional)
5. Click **Save**
6. Lead appears immediately in your Leads list

**Alternative Add Methods (from + button dropdown):**
- **Scan lead** — Take a photo of a business card or document (OCR extracts details)
- **Paste lead** — Paste text copied from email, website, or other source
- **Import CSV** — Bulk upload multiple leads from a spreadsheet

**Form Fields:**
(To be documented after exploring EditCustomerForm component)

---

## Listings Page

**Status:** No main listings page yet in codebase. Routes to individual listing detail pages (`/listings/[id]`) exist but not the browse/list view.

**Note for Help:** Cannot provide accurate help for "add a listing" or "view all listings" yet as pages are in development.

---

## Showings Page (`/showings`)

(To be documented after exploring ShowingsDashboard component)

---

## Commissions Page (`/commissions`)

(To be documented after exploring page component)

---

## Settings Page (`/settings`)

(To be documented after exploring settings structure)

---

## Key UI Patterns

### Buttons
- **Plus (+) buttons:** Open dropdown menus with related actions
- **Button sizes:** "sm" (small) for inline actions, larger for primary CTAs
- **Button variants:** "ghost" for secondary/subtle actions
- **Button styles:** White text on dark blue background, orange highlight when active

### Menus
- **Dropdown menus:** Positioned absolutely, appear below/beside trigger button
- **Menu items:** Have icon, label, hover background
- **Menu width:** Typically 200px+

### Top Bar
- **Title:** Page heading on left
- **Right controls:** Buttons/menu controls on right side
- **Sticky:** Often sticky to top of page for easy access

### Modals/Dialogs
- **Import/Paste dialogs:** Controlled via `open` prop, hide with `onOpenChange`
- **Scanner dialog:** Full modal with header and scrollable content

---

## URL Structure

**Base:** https://localhost:3000 (dev) or https://realtywyze.us (production)

**Main Pages:**
- `/dashboard` — Dashboard
- `/today` — Today's activities
- `/customers` — Leads list
- `/customers/new` — Add lead form
- `/customers/[id]` — Lead detail view
- `/leads/web` — Web inquiries from public site
- `/vehicles` — Inventory (dealer) / used for test data in RE
- `/contacts` — Contact directory
- `/showings` — Scheduled showings/appointments
- `/commissions` — Commission tracking
- `/messages` — Messaging center
- `/support` — Support page
- `/settings` — Organization settings
- `/admin` — Admin panel (platform staff only)

---

## Data Entities

### Lead/Customer
- **Database table:** `customers`
- **Key fields:** id, name, phone, email, location_id, assigned_to, created_at, archived
- **Org scoping:** Via `user_id` (org UUID), not `org_id`
- **Multi-location:** Can be restricted to specific dealer_location via location_id

### Web Lead/Inquiry
- **Database table:** `inventory_inquiries`
- **Source:** From public website form
- **Status:** new, contacted, archived
- **Related to:** Vehicle (dealer) or will map to Listing (RE) in future

### Activity
- **Database table:** `activities`
- **Types:** call, email, text, note, viewing, etc.
- **Linked to:** customer_id, no org_id column
- **User can:** Create, view in customer timeline

---

## Environment Notes

### Localhost (Development)
- URL: http://localhost:3000
- User must log in
- Uses local Supabase (if configured)

### Production (RealtyWyze)
- URL: https://realtywyze.us
- Same UI/UX as localhost
- Live Supabase DB

### Multi-Tenancy
- All pages respect `org_id` via authenticated profile
- Left sidebar shows org name below RealtyWyze logo
- Admin panel (`/admin`) visible only to platform staff and above

---

## Access Control Notes

- **Leads:** Visible to all authenticated users in org
- **Leads by role:**
  - Admins: See all org leads
  - Managers: See assigned leads + team leads
  - Sales reps: See only personally assigned leads
- **Add Lead:** Available to admins and managers (reps cannot create)
- **Web Leads:** Visible to admins only by default

---

## Help Article Foundation

This document provides the foundation for all help articles. Help responses should reference:
- Exact page URLs
- Exact button labels and positions ("Plus button in top right")
- Exact menu item names
- Actual workflow steps confirmed in code
- Do NOT invent UI elements not listed here
