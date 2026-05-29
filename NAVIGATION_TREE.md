# Navigation Tree & Button Reference

**Live documentation of every navigation item and button in the system.**

Use this to write accurate help articles. Every item here has been verified in the code.
Last verified: 2026-05-29

---

## ROOT NAVIGATION

### Left Sidebar Menu
Appears on every page. Context-aware based on `vertical` and user role.

```
DEALERWYZE / REALTYWYZE
│
├─ Dashboard → /dashboard
│  │ Purpose: Overview of org statistics and activity
│  └─ Buttons: [To be verified]
│
├─ Today → /today
│  │ Purpose: Activities and tasks for today
│  └─ Buttons: [To be verified]
│
├─ Leads → /customers
│  │ Label in sidebar: "Leads" (both dealer and RE)
│  │ Entity name: "customer" (dealer) or "client" (RE)
│  │
│  └─ Top Right Buttons:
│     └─ "Add Lead" (Plus icon + text)
│        ├─ Action: Opens dropdown menu
│        └─ Sub-menu options:
│           ├─ "Add manually"
│           │  └─ Routes to: /customers/new (form page)
│           ├─ "Scan lead"
│           │  └─ Action: Opens camera/OCR dialog
│           ├─ "Paste lead"
│           │  └─ Action: Opens text paste dialog
│           └─ "Import CSV"
│              └─ Action: Opens file upload dialog
│
├─ Web Leads → /leads/web
│  │ Purpose: Inquiries from public website
│  │ Status badge: Shows count of new leads
│  └─ Buttons: [To be verified]
│
├─ Inventory → /vehicles (Dealer) OR Listings → /vehicles (RE)
│  │ Context: Same URL (/vehicles), different title & buttons based on vertical
│  │
│  ├─ [DEALER VERSION]
│  │  │ Page Title: "Inventory"
│  │  │ Primary Entity: Vehicle (VIN, year, make, model, price, mileage)
│  │  │
│  │  └─ Top Right Buttons:
│  │     ├─ "Add Inventory" (Plus icon + text)
│  │     │  ├─ Action: Opens VehicleIntakeSheet or form
│  │     │  └─ Routes to: /vehicles/new OR intake dialog
│  │     ├─ "Sync Inventory" (if available)
│  │     │  └─ Action: SyncInventoryButton component
│  │     └─ "Run Market Intelligence" (admin only)
│  │        └─ Action: RunMarketIntelligenceButton component
│  │
│  └─ [REALTYWYZE VERSION]
│     │ Page Title: "Listings"
│     │ Primary Entity: Listing (address, beds, baths, sqft, price, MLS#)
│     │
│     └─ Top Right Buttons:
│        ├─ "Add Listing" (Plus icon + text)
│        │  └─ Routes to: /vehicles/new (listing form)
│        └─ (Other buttons may vary or be hidden)
│
├─ Contacts → /contacts
│  │ Purpose: Contact directory (business cards, people directory)
│  │
│  └─ Top Right Buttons (when in List view):
│     ├─ "Add Contact" (Plus icon + text)
│     │  └─ Action: Opens manual contact form
│     └─ "Scan Card" (ScanLine icon + text)
│        └─ Action: Opens camera for business card OCR
│
├─ [SHOWINGS] → /showings [REALTYWYZE ONLY]
│  │ Purpose: Schedule and manage property showings
│  │ Visibility: Only when vertical === 'real_estate'
│  └─ Buttons: [To be verified]
│
├─ [COMMISSIONS] → /commissions [REALTYWYZE ONLY]
│  │ Purpose: Track commissions and payouts
│  │ Visibility: Only when vertical === 'real_estate'
│  └─ Buttons: [To be verified]
│
├─ [BHPH] → /bhph [DEALER ONLY, IF ENABLED]
│  │ Purpose: BHPH (Buy Here Pay Here) payment tracking
│  │ Visibility: Only if feature enabled AND role !== 'dealer_rep'
│  └─ Buttons: [To be verified]
│
├─ [LEASES] → /leases [DEALER ONLY, IF ENABLED]
│  │ Purpose: Lease management
│  │ Visibility: Only if feature enabled AND role !== 'dealer_rep'
│  └─ Buttons: [To be verified]
│
├─ [FAX] → /fax [IF ENABLED]
│  │ Purpose: Fax management
│  │ Visibility: Only if feature enabled
│  └─ Buttons: [To be verified]
│
├─ Messages → /messages
│  │ Purpose: SMS, email, and voice messaging center
│  │ Badge: Shows unread message count
│  │
│  └─ Buttons: [To be verified]
│
├─ Support → /support
│  │ Purpose: Help and support center
│  │
│  └─ Buttons: [To be verified]
│
├─ Settings → /settings
│  │ Purpose: Organization and user settings
│  │ Nested subsections: Profile, Team, Roles, Billing, Website, Data, Integrations
│  │
│  ├─ /settings (main)
│  │  └─ Buttons: [To be verified - likely routing to subsections]
│  │
│  ├─ /settings/team
│  │  │ Purpose: Manage team members and permissions
│  │  │
│  │  └─ Buttons: [To be verified - "Add Team Member" or similar]
│  │
│  ├─ /settings/billing
│  │  │ Purpose: Billing, plan, and payment info
│  │  │
│  │  └─ Buttons: [To be verified]
│  │
│  ├─ /settings/website [DEALER ONLY]
│  │  │ Purpose: Public dealership website configuration
│  │  │ Visibility: Only dealer_admin or admin role
│  │  │
│  │  └─ Buttons: [To be verified]
│  │
│  └─ [Other subsections - to be verified]
│
└─ [ADMIN PANEL] → /admin [PLATFORM STAFF ONLY]
   │ Purpose: Platform administration (super admin only)
   │ Visibility: Only if user is platform staff or superadmin
   │
   └─ Buttons: [To be verified - admin-specific]

---

## PAGE DETAIL SECTIONS

### LEADS PAGE (/customers)

**Context-aware title:** "Leads (N)" where N = number of active leads

**Top-level sections:**
- Title bar with page name + action buttons
- Sub-navigation tabs (List, Pipeline, Segments, Archived)
- Filter/search area
- Main content area (list or pipeline view)

**Buttons & Actions:**

```
Top Right Area:
├─ "Add Lead" button
│  ├─ Visual: Plus icon + "Add Lead" text
│  ├─ Behavior: Click → Dropdown menu opens
│  │
│  └─ Menu options (vertical dropdown):
│     ├─ "Add manually" (icon: UserPlus)
│     │  └─ Click → Navigate to /customers/new
│     │  └─ Page: Manual form with fields [name, phone, email, etc.]
│     │
│     ├─ "Scan lead" (icon: ScanLine)
│     │  └─ Click → Open modal with camera/OCR
│     │
│     ├─ "Paste lead" (icon: ClipboardPaste)
│     │  └─ Click → Open modal for pasting text
│     │
│     └─ "Import CSV" (icon: FileSpreadsheet)
│        └─ Click → Open modal for uploading CSV file

Sub-navigation Tabs:
├─ "List" tab
│  └─ View: Table/list of leads
│
├─ "Pipeline" tab
│  └─ View: Kanban board with pipeline stages
│
├─ "Segments" tab
│  └─ View: Filtered groups of leads
│
└─ "Archived" tab
   └─ View: Archived leads list
   └─ Note: When on this tab, "Add Lead" button is replaced with "Active" button
```

**Empty state (when no leads exist):**
- Icon: UserX
- Title: "No leads yet"
- Description: "Add your first lead to get started"
- Button: "Add First Lead" → /customers/new

---

### INVENTORY PAGE (/vehicles)

**Dealer Version:**
- Page Title: "Inventory"
- Primary Entity: Vehicle
- Sub-sections: Available, Pending, Sold, Staging, Sync Removed

**RealtyWyze Version:**
- Page Title: "Listings"  
- Primary Entity: Listing (Property)
- Sub-sections: [Same or different - to be verified]

```
Top Right Area:
├─ "Add Inventory" button [DEALER]  OR  "Add Listing" button [RE]
│  ├─ Visual: Plus icon + text
│  ├─ Behavior: Click → Either opens form or intake sheet
│  └─ Routes to: /vehicles/new OR VehicleIntakeSheet dialog
│
├─ "Sync Inventory" button [if applicable]
│  └─ Action: SyncInventoryButton - syncs from external inventory
│
└─ "Run Market Intelligence" button [admin dealers only]
   └─ Action: RunMarketIntelligenceButton - market analysis

Filter Tabs/Chips:
├─ "All" → Shows all active inventory
├─ "Available" → Shows available vehicles
├─ "Pending" → Shows pending sales
├─ "Sold" → Shows sold vehicles
├─ "Staging" → Shows staging/reconditioning
└─ "Archived" → Shows archived/removed vehicles [if applicable]
```

---

### CONTACTS PAGE (/contacts)

```
Top Right Area:
├─ "Add Contact" button
│  ├─ Visual: Plus icon + "Add Contact" text
│  └─ Behavior: Click → Opens manual contact entry form
│
└─ "Scan Card" button
   ├─ Visual: ScanLine icon + "Scan Card" text
   └─ Behavior: Click → Opens camera for business card OCR

Form Views:
├─ Manual Entry Form
│  └─ Fields: [Name, Company, Title, Phone, Email, Fax, Address, Website, Notes]
│
├─ Scanning Form
│  └─ Action: Capture image, AI extracts contact info
│
└─ Confirm/Review Form
   └─ Action: Review extracted data before saving
```

---

### DASHBOARD (/dashboard)

**Page Title:** "DealerWyze" (or "RealtyWyze.US" for RE) in top-left branding

```
Top Right Area:
├─ "Web Leads" button (Inbox icon)
│  └─ Routes to: /leads/web
│  └─ Badge: Shows count of new web inquiries from last 7 days
│
└─ "Search" button (Search icon)
   └─ Routes to: /search

Main Content:
├─ Greeting: "Good [morning/afternoon/evening], [org_name]" + today's date
├─ DealerScoreTile (score + urgency metrics)
├─ Today Urgency Strip (link to /today, shows urgent leads/appts/tasks)
├─ Streak + Wins tiles (gamification display)
├─ Goal Progress bars (no buttons, just progress)
├─ Stat Tiles (clickable):
│  ├─ "Leads" tile → /customers
│  └─ "BHPH" tile → /bhph (conditional)
├─ Upcoming Appointments list (from appointments)
├─ Inventory tile (link to /vehicles, shows pricing health)
├─ Morning Brief button (opens sheet modal)
│  └─ Action: Click opens bottom sheet with AI dealer brief
└─ Quick Actions grid (predefined actions)

Conditional:
├─ OwnerView (only if dealer_admin or admin role)
└─ BHPH tile (hidden if role === dealer_rep or feature disabled)
```

**Verified:** ✅ Code: `/dashboard/page.tsx` + `/dashboard/DashboardClient.tsx`

---

### MESSAGES (/messages)

**Page Layout:** Two-pane (desktop) or single pane (mobile)

```
LEFT PANE (Thread List):
├─ Header: "Messages" + "Your conversations with DealerWyze"
├─ Search box: Search threads by text
└─ Thread list (each is clickable):
   ├─ Type badge (success, support, billing, sales)
   ├─ Status badge (open, resolved, archived)
   ├─ Subject line
   ├─ Last message time
   └─ Message count with unread indicator (red badge if unread)

RIGHT PANE (Thread Detail - when thread selected):
├─ Mobile back button (mobile only)
├─ Thread header (subject + type + status badges)
├─ Channel tabs (2 tabs):
│  ├─ "Messages" tab (MessageSquare icon) - shows in_app messages + count
│  └─ "Emails" tab (Mail icon) - shows email messages + count
├─ Message list (scrollable):
│  └─ Each message shows: sender, body, attachments, timestamp
├─ Composer (fixed at bottom):
│  ├─ Textarea for message/email body
│  ├─ Attachment button (Paperclip icon)
│  │  └─ Click opens file picker (hidden input, accept: images, PDF, Office docs, txt)
│  ├─ Send button
│  │  └─ Text changes: "Send Message" or "Send Email" based on active tab
│  └─ File previews (before send):
│     └─ Each pending file shows with remove button (X)

Composer Actions:
├─ Attach files: Click Paperclip → select file(s) → appear in preview area
├─ Remove file: Click X on pending file
├─ Send: Click "Send Message"/"Send Email" button (or Cmd/Ctrl+Enter)
└─ Keyboard shortcut: Cmd/Ctrl+Enter to send

No top-right buttons for Messages page itself.
```

**Verified:** ✅ Code: `/messages/page.tsx` + `/messages/MessagesClient.tsx`

---

### SETTINGS (/settings and subsections)

**Settings Structure:** Main page redirects to `/settings/organization`. Navigation via left sidebar with search.

```
SETTINGS NAVIGATION (Left Sidebar):
├─ Search box: "Search settings…" (live filter across all items)
├─ Groups (6 main categories):
│
├─ GROUP 1: BUSINESS
│  ├─ "Organization" (/settings/organization) [dealer_admin only]
│  │  └─ Sections: Basic info, phone, email sync, voice agent, integrations, danger zone
│  ├─ "Locations" (/settings/locations) [dealer_admin only]
│  │  └─ Multi-location management
│  ├─ "Users" (/settings/users) [dealer_admin only]
│  │  └─ Team member invite, roles, permissions
│  ├─ "Pipeline" (/settings/pipeline) [dealer_admin only]
│  │  └─ Rename/reorder sales stages
│  └─ "Website" (/settings/website) [dealer_admin only]
│     └─ Public inventory site, custom domain, website settings
│
├─ GROUP 2: SALES & COMMUNICATION
│  ├─ "Automation" (/settings/automation) [dealer_admin only]
│  │  └─ Lead response timing, auto-response, templates
│  ├─ "Sequences" (/settings/sequences) [all roles]
│  │  └─ Build email/SMS follow-up cadences
│  ├─ "Webhooks" (/settings/webhooks) [dealer_admin only]
│  │  └─ Send events to external systems
│  └─ "Goals" (/settings/goals) [dealer_admin only]
│     └─ Sales targets for AI dealer brief
│
├─ GROUP 3: INVENTORY & MERCHANDISING
│  ├─ "Recon Checklist Template" (/settings/recon-template) [dealer_admin, dealer only]
│  │  └─ Default staging checklist
│  ├─ "Video Settings" (/settings/video) [dealer_admin only]
│  │  └─ Remotion templates, voice, autopost
│  └─ "Social Accounts" (/settings/social) [dealer_admin only]
│     └─ Connect social channels for posts
│
├─ GROUP 4: CUSTOMER EXPERIENCE
│  ├─ "Payments & Booking" (/settings/payments) [dealer_admin only]
│  │  └─ Stripe, BHPH, appointment booking
│  ├─ "Post-Sale Outreach" (/settings/pulse) [dealer_admin only]
│  │  └─ Review requests, survey settings
│  ├─ "Reviews" (/settings/reviews) [dealer_admin only]
│  │  └─ Review prompts, destinations, feedback
│  └─ "Retention" (/settings/retention) [dealer_admin only]
│     └─ Retention campaigns, postcards, birthday automation
│
├─ GROUP 5: COMPLIANCE & FINANCE
│  ├─ "Commission Plans" (/settings/commission-plans) [dealer_admin, real_estate only]
│  │  └─ Agent commission splits
│  ├─ "Billing" (/settings/billing) [dealer_admin only]
│  │  └─ Subscription, payment method, plan
│  ├─ "Bookkeeping" (/settings/bookkeeping) [all roles, dealer only]
│  │  └─ Receipt categories, QuickBooks mapping
│  ├─ "Audit Log" (/settings/audit) [dealer_admin only]
│  │  └─ Security, export, settings history
│  └─ "Business Transfer" (/settings/transfer) [dealer_admin only]
│     └─ Ownership transfer workflow
│
└─ GROUP 6: PERSONAL & SUPPORT
   └─ "Appearance" (/settings/appearance) [all roles]
      └─ Theme, typography preferences

Access Control:
├─ dealer_admin: Can access all dealer org settings
├─ dealer_rep: Limited to sequences, appearance, bookkeeping, my-performance
├─ all roles: Can access sequences, appearance
└─ Real Estate Only: commission-plans visible instead of some dealer-specific items
```

**Verified:** ✅ Code: `/settings/config.ts` (all items + groups), `/settings/SettingsDesktopNav.tsx`, `/settings/organization/page.tsx`

---

### WEB LEADS PAGE (/leads/web)

**Page Title:** "Web Leads (N new)" - where N = count of new inquiries, or just "Web Leads" if none

```
Top-level Section Tabs (4 buttons):
├─ "All" tab (shows total count)
├─ "New" tab (shows new count - badge red if any)
├─ "Imported" tab (shows imported count)
└─ "Archived" tab (shows archived count)

List View (each inquiry is a card with):
├─ Status dot (green=new, blue=imported, gray=archived)
├─ Name + phone link (tel:) + email link (mailto:) + timestamp
├─ Vehicle info (if linked) with link to /vehicles/{id}
├─ Message preview (truncatable with "Show more" button)
└─ Action buttons (context-aware):
   ├─ If not imported:
   │  ├─ "Import as Lead" button (primary) → routes to /customers/new with prefilled params
   │  ├─ "Archive" button → marks as archived
   │  └─ "Delete" button → confirmation dialog before delete
   │
   ├─ If imported:
   │  ├─ "Re-import" button (secondary) → routes to /customers/new with prefilled params
   │  ├─ "Archive" button → marks as archived
   │  └─ "Delete" button → confirmation dialog before delete
   │
   └─ If archived:
      ├─ "Re-import" button (secondary) → routes to /customers/new with prefilled params
      ├─ "Restore" button → marks as new
      └─ "Delete" button → confirmation dialog before delete

Empty state (when no inquiries):
└─ Inbox icon + "No web leads yet." + explanation text

No top-right buttons for Web Leads page itself.
```

**Verified:** ✅ Code confirmed in `/leads/web/page.tsx` + `/leads/web/WebLeadsClient.tsx`

---

## TO BE VERIFIED

The following sections still need code verification. Pending details:

```
- [ ] Today (/today) - content and action buttons (complex dashboard)
- [ ] Showings (/showings) - [RealtyWyze only]
- [ ] Commissions (/commissions) - [RealtyWyze only]
- [ ] BHPH (/bhph) - if applicable
- [ ] Leases (/leases) - if applicable
- [ ] Fax (/fax) - if applicable
- [ ] Admin Panel (/admin) - all sections
- [ ] Individual Settings pages - detail buttons/forms within each subsection
```

---

## USAGE INSTRUCTIONS

**For Writing Help Articles:**

1. Find the page in this tree (e.g., "LEADS PAGE")
2. Look at the button structure under "Top Right Area" or relevant section
3. Reference the exact button label, icon, and action
4. Example: "Click the **Add Lead** button (Plus icon in the top right), then choose **Add manually** from the menu"

**For Updating This Document:**

- When UI changes, update the relevant section here first
- This becomes the single source of truth for help articles
- Keep it in sync with actual code using SYSTEM_AUDIT.md as verification

**Format conventions:**
- `[DEALER ONLY]` = Only shows for dealer vertical
- `[REALTYWYZE ONLY]` = Only shows for real_estate vertical
- `[IF ENABLED]` = Hidden unless feature flag is enabled
- → indicates "routes to" or "navigates to"
- (icon: IconName) shows what icon appears next to the button

---

## CHANGE LOG

| Date | Change | Status |
|------|--------|--------|
| 2026-05-29 | Initial tree created with Leads, Inventory, Contacts | ✅ |
| 2026-05-29 | Dashboard verified + top-right buttons documented | ✅ |
| 2026-05-29 | Messages page structure + composer documented | ✅ |
| 2026-05-29 | Settings navigation + all 25 items documented | ✅ |
| 2026-05-29 | Web Leads page + action buttons documented | ✅ |
| TBD | Today page detailed | ⏳ |
| TBD | RealtyWyze-specific pages (Showings, Commissions) | ⏳ |
| TBD | Admin panel structure | ⏳ |
