# RealtyWyze System Audit - Complete Navigation & Button Map

**Purpose:** Verify every navigation item, button, and action in the system before writing help articles.
**Status:** IN PROGRESS - Verification in progress, help articles to be written after completion.
**Last Updated:** 2026-05-29

---

## LEFT SIDEBAR NAVIGATION

### Base Navigation (All Users)
| Label | URL | Icon | Notes |
|-------|-----|------|-------|
| Dashboard | `/dashboard` | LayoutDashboard | Overview of org stats |
| Today | `/today` | Home | Today's activities |
| Leads | `/customers` | Users | Lead/client list (main CRM page) |
| Web Leads | `/leads/web` | Inbox | Inquiries from public website, has badge |
| Inventory | `/vehicles` | Car | Vehicle inventory (or Listings for RE) |
| Contacts | `/contacts` | BookUser | Contact directory |

### Real Estate Only (`vertical === 'real_estate'`)
| Label | URL | Icon | Notes |
|-------|-----|------|-------|
| Showings | `/showings` | CalendarDays | Schedule & manage showings |
| Commissions | `/commissions` | DollarSign | Track commissions |

### Role-Based Navigation (Appears if user has role)
| Label | URL | Icon | Required Role | Feature Flag |
|-------|-----|------|---------------|--------------|
| BHPH | `/bhph` | CreditCard | Not dealer_rep | bhph |
| Leases | `/leases` | FileSignature | Not dealer_rep | leaseManagement |
| Security Audit | `/admin/security-audit` | ShieldCheck | dealer_admin, dealer_manager, admin | — |
| Analytics | `/analytics` | BarChart2 | dealer_admin, dealer_manager, admin | — |
| Pulse | `/pulse` | Heart | dealer_admin, dealer_manager, admin | — |
| Fax | `/fax` | Printer | All | fax |
| Messages | `/messages` | MessageCircle | All | — |
| Support | `/support` | HeadphonesIcon | All | — |
| Website | `/settings/website` | Globe | dealer_admin, admin | — |
| Settings | `/settings` | Settings | All | — |
| Admin Panel | `/admin` | ShieldCheck | Platform staff only | — |

---

## PAGE-BY-PAGE BUTTON AUDIT

### 1. LEADS PAGE (`/customers`)

**Page Title:** "Leads (N)" where N = count of active leads

**Top Right Buttons:**
- **Primary:** "Add Lead" button (Plus icon + text)
  - Click opens dropdown menu with 4 options:
    1. "Add manually" → Navigate to `/customers/new`
    2. "Scan lead" → Opens scan dialog
    3. "Paste lead" → Opens paste dialog
    4. "Import CSV" → Opens import dialog

**Sub-navigation Tabs:**
- "List" → Default view, shows leads as list
- "Pipeline" → Shows leads by sales stage/pipeline
- "Segments" → Shows lead groups/segments
- "Archived" → Shows archived leads (appears when viewing archived)
- When archived: "Active" button → Back to active leads

**Empty State:**
- When no leads: Shows "Add First Lead" action button → `/customers/new`

**Verified:** ✅ Add Lead menu structure confirmed in AddLeadMenu.tsx

---

### 2. INVENTORY PAGE (`/vehicles`)

**Page Title:** "Inventory" (dealers) or "Listings" (RE)

**Top Right Buttons:**
- **"Add Inventory"** button (dealers) → Opens VehicleIntakeSheet or goes to `/vehicles/new`
- **"Add Listing"** button (RE) → Goes to `/vehicles/new`
- **"Sync Inventory"** button → SyncInventoryButton component
- **"Run Market Intelligence"** button (admin dealers only) → RunMarketIntelligenceButton

**Filter/Sort Section:**
- Chips for filtering by status: All, Available, Pending, Sold, Staging
- Sort dropdown: Newest, Price Asc, Price Desc, Year Desc, Oldest

**Verified:** ✅ Buttons confirmed in VehicleIntakeButton.tsx

---

### 3. CONTACTS PAGE (`/contacts`)

**Page Title:** "Contacts"

**Top Right Buttons (when in List view):**
- **"Add Contact"** button (Plus icon + text) → Opens manual entry form
- **"Scan Card"** button (ScanLine icon + text) → Opens camera for OCR scanning

**Form Views:**
- Manual entry form
- Scanning form
- Confirm/review form

**Verified:** ✅ Buttons confirmed in contacts/page.tsx

---

### 4. MESSAGES PAGE (`/messages`)

**Page Title:** "Messages"

**Layout:** Two-pane desktop / single-pane mobile

**Left Pane (Thread List):**
- Title: "Messages" with subtitle "Your conversations with DealerWyze"
- Search box: Filters threads by subject/content
- Thread list: Each thread is a clickable button
  - Shows: Type badge, status badge, subject, last message time, message count with unread indicator

**Right Pane (When thread selected):**
- Back button (mobile only)
- Thread header: subject + type badge + status badge
- Channel tabs (2 buttons):
  - "Messages" tab (MessageSquare icon) → shows in_app messages
  - "Emails" tab (Mail icon) → shows email messages
  - Each tab shows total count and unread count
- Message list (scrollable): messages, attachments, timestamps
- Composer (fixed bottom):
  - Textarea for message/email
  - Attachment button (Paperclip icon) → opens file picker
  - Send button: text changes to "Send Message" or "Send Email"
  - Pending file list with remove buttons (X)

**Keyboard Shortcuts:**
- Cmd/Ctrl+Enter: Send message/email

**No top-right buttons** - all controls within thread detail pane.

**Verified:** ✅ Code confirmed in `/messages/MessagesClient.tsx`

---

### 5. SETTINGS PAGE (`/settings`)

**Page Behavior:** Main `/settings` redirects to `/settings/organization`

**Navigation Structure:**
- Left sidebar with search box ("Search settings…")
- 6 grouped categories of settings items
- Each item is a clickable link to its subsection

**Settings Groups & Items (25 total items):**

**Business (5 items):**
- Organization (/settings/organization) [dealer_admin]
- Locations (/settings/locations) [dealer_admin]
- Users (/settings/users) [dealer_admin]
- Pipeline (/settings/pipeline) [dealer_admin]
- Website (/settings/website) [dealer_admin, title: "Listing Site" for RE]

**Sales & Communication (4 items):**
- Automation (/settings/automation) [dealer_admin]
- Sequences (/settings/sequences) [all roles]
- Webhooks (/settings/webhooks) [dealer_admin]
- Goals (/settings/goals) [dealer_admin]

**Inventory & Merchandising (3 items):**
- Recon Checklist Template (/settings/recon-template) [dealer_admin, dealer only]
- Video Settings (/settings/video) [dealer_admin]
- Social Accounts (/settings/social) [dealer_admin]

**Customer Experience (4 items):**
- Payments & Booking (/settings/payments) [dealer_admin]
- Post-Sale Outreach (/settings/pulse) [dealer_admin]
- Reviews (/settings/reviews) [dealer_admin]
- Retention (/settings/retention) [dealer_admin]

**Compliance & Finance (5 items):**
- Commission Plans (/settings/commission-plans) [dealer_admin, real_estate only]
- Billing (/settings/billing) [dealer_admin]
- Bookkeeping (/settings/bookkeeping) [all roles, dealer only]
- Audit Log (/settings/audit) [dealer_admin]
- Business Transfer (/settings/transfer) [dealer_admin]

**Personal & Support (1 item):**
- Appearance (/settings/appearance) [all roles]

**Access Control:**
- dealer_admin: Full access to all dealer org settings
- dealer_rep: Limited to sequences, appearance, bookkeeping
- all roles: sequences, appearance
- Real Estate: Commission Plans visible instead of dealer-specific items

**Search Feature:**
- Live filter across all settings items by title, description, keywords

**Verified:** ✅ Code confirmed in `/settings/config.ts` (all groups and items defined)

---

### 6. DASHBOARD (`/dashboard`)

**Page Title:** "DealerWyze" (or "RealtyWyze.US" for RE vertical)

**Top Right Area:**
- "Web Leads" button (Inbox icon) → /leads/web
  - Badge: Shows count of web inquiries from last 7 days
- "Search" button (Search icon) → /search

**Main Content:**
- Greeting: "Good [morning/afternoon/evening], [org_name]" + today's date
- DealerScoreTile: Shows dealer score + urgent leads + tasks overdue
- Today Urgency Strip: Link to /today, shows urgent counts
- Streak + Wins tiles: Gamification display (no buttons)
- Goal Progress bars: Display only, no buttons
- Stat Tiles (clickable):
  - "Leads" tile → /customers
  - "BHPH" tile → /bhph (conditional on role/feature)
- Upcoming Appointments list
- Inventory tile (clickable) → /vehicles
  - Shows available count, pricing health visualization
- Morning Brief button (opens bottom sheet)
- Quick Actions grid

**Conditional Elements:**
- OwnerView: Only visible if role === dealer_admin or admin
- BHPH tile: Hidden if role === dealer_rep or feature disabled

**Verified:** ✅ Code confirmed in `/dashboard/page.tsx` + `/dashboard/DashboardClient.tsx`

---

### 7. SHOWINGS PAGE (`/showings`) - RE Only

**Status:** ⏳ NEEDS VERIFICATION

---

### 8. COMMISSIONS PAGE (`/commissions`) - RE Only

**Status:** ⏳ NEEDS VERIFICATION

---

### 9. TODAY PAGE (`/today`)

**Status:** ⏳ NEEDS VERIFICATION

---

### 10. WEB LEADS PAGE (`/leads/web`)

**Page Title:** "Web Leads (N new)" or "Web Leads" if no new inquiries

**Tab Buttons (4 filter tabs):**
- "All" tab → shows all inquiries
- "New" tab → shows new inquiries (red badge if any)
- "Imported" tab → shows imported inquiries
- "Archived" tab → shows archived inquiries
- Each tab shows count badge

**Each Inquiry Card displays:**
1. **Header row:** Status dot (green/blue/gray) + Name + Phone (tel: link) + Email (mailto: link) + Timestamp
2. **Vehicle row (if linked):** Car icon + Year Make Model with link to `/vehicles/{id}`
3. **Message row:** Quoted message with "Show more"/"Show less" button for long messages
4. **Action buttons** (context-aware by status):
   - If not imported: "Import as Lead" (primary) + "Archive" (secondary) + "Delete" (text)
   - If imported: "Re-import" (secondary) + "Archive" (secondary) + "Delete" (text)
   - If archived: "Re-import" (secondary) + "Restore" (secondary) + "Delete" (text)
   - Delete shows confirmation dialog before executing

**Import Action:**
- Click "Import as Lead" or "Re-import" → PATCH `/api/leads/web/{id}` status=imported → Navigate to `/customers/new?name=X&phone=Y&email=Z`

**Archive Action:**
- Click "Archive" → PATCH `/api/leads/web/{id}` status=archived

**Restore Action (if archived):**
- Click "Restore" → PATCH `/api/leads/web/{id}` status=new

**Delete Action:**
- Click "Delete" → Shows confirmation ("Delete?") → Confirm button → DELETE `/api/leads/web/{id}`

**Empty State:** Inbox icon + message (varies by tab)

**Verified:** ✅ Code confirmed in `/leads/web/page.tsx` + `/leads/web/WebLeadsClient.tsx`

---

## NEXT STEPS

1. ✅ Map left sidebar navigation
2. ✅ Audit Leads, Inventory, Contacts pages
3. ⏳ Audit remaining pages (Messages, Settings, Showings, Commissions, etc.)
4. ⏳ Document all action menus and sub-buttons
5. ⏳ Map API routes for each button action
6. ⏳ Update SYSTEM_KNOWLEDGE.md with complete verified information
7. ⏳ Rewrite help articles based on verified data only

---

## AUDIT METHODOLOGY

Each page audit includes:
- **Page Title** - Exact text shown
- **Top Right Buttons** - All action buttons and their exact labels
- **Menu Structure** - What happens when you click each button
- **Tabs/Sub-navigation** - View toggles and filters
- **Empty State** - What users see when no data exists
- **Verified** - Confirmation that buttons were found in actual code

Help articles will ONLY be written for items marked ✅ VERIFIED.
