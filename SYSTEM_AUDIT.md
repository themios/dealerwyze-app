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

### 7. SHOWINGS PAGE (`/showings`) - REALTYWYZE ONLY

**Vertical Gate:** Real Estate only. Dealer orgs receive 404.

**Page Title:** "Upcoming Showings"

**Status Filter Tabs (5 buttons):**
- "All" tab → shows all showings
- "Scheduled" tab → shows scheduled showings
- "Completed" tab → shows completed showings
- "Cancelled" tab → shows cancelled showings
- "No-show" tab → shows no-show showings
- Each tab shows count of showings in that status

**Each Showing Card displays:**
1. **Header:** Scheduled date/time + Listing address (link to `/listings/{id}`) + Status badge
2. **Info:** Contact name + Agent name
3. **Status badge** (color-coded):
   - Scheduled: blue
   - Completed: green
   - Cancelled: gray
   - No-show: red
4. **Action buttons:** For each status != current status, "Mark [Status]" button
   - Click → PATCH `/api/showings/{id}` with new status
5. **View link:** "View listing →" link to `/listings/{id}`

**Scope:** Next 30 days, up to 500 showings, ordered by soonest first

**Verified:** ✅ Code confirmed in `/showings/page.tsx` + `/showings/ShowingsDashboard.tsx`

---

### 8. COMMISSIONS PAGE (`/commissions`) - REALTYWYZE ONLY

**Vertical Gate:** Real Estate only. Dealer orgs redirected to `/today`.

**Page Title:** "Commissions"

**Header Section:**
- Title: "Commissions"
- Subtitle: "All agents — closed deal commission summary." (if admin) OR "Your closed deal commission summary." (if agent)
- Year selector dropdown: current year, -1 year, -2 year

**Content (role-aware):**
- YTD Summary Card: shows YTD total amount, year, total deal count
- Admin Only: "Agent Breakdown" section with per-agent YTD totals + deal counts
- "Closed Transactions" section: table of all closed deals with commission details

**Loading state:** Skeleton placeholders
**Error state:** Error message + retry

**API:** GET `/api/transactions/summary?year={year}`

**Access Control:**
- dealer_admin: sees all agents summary + org-wide transaction table
- agent: sees only own deals and YTD total

**Verified:** ✅ Code confirmed in `/commissions/page.tsx`

---

### 8.5. BHPH PAGE (`/bhph`) - DEALER ONLY (Optional Feature)

**Visibility:** Dealer only. Hidden if feature disabled or role is dealer_rep. RealtyWyze shows as "Lease Accounts".

**Page Title:** "BHPH Accounts" (dealer) or "Lease Accounts" (RE)

**Summary Statistics (3 cards, when accounts exist):**
- Active count (primary color card)
- Overdue count (red card)
- Due Soon (next 3 days) count (amber card)

**Each BHPH Account Card displays:**
1. **Header row:** Customer name (link to `/bhph/{account_id}`) + Payment frequency (Weekly/Bi-weekly/Monthly) + Status badge (red=overdue, amber=due today, green=upcoming)
2. **Vehicle info:** Year Make Model Stock#
3. **Loan summary (3 columns):** Total loan amount | Amount paid (green) | Balance remaining (orange)
4. **Payment progress bar:** % of loan paid
5. **Next due date** + Call button (tel: link if customer has phone)
6. **Reminder consent badges:**
   - SMS status (on/off/opted out) - MessageSquare icon
   - Email status (on/off) - Mail icon
   - Last reminder type (if any)
7. **"Record Payment" action (BhphRecordPayment component):**
   - Input field for payment amount (default: monthly payment)
   - "Record Payment" button → PATCH updates total_paid, next_due_date, status

**Empty state:** Emoji + message: "No active BHPH accounts" with explanation

**Data scope:** Active accounts only, ordered by next_due_date ascending

**Verified:** ✅ Code confirmed in `/bhph/page.tsx` + `/bhph/BhphRecordPayment.tsx`

---

### 9. TODAY PAGE (`/today`)

**Page Title:** "Today"

**Layout:** Desktop 3-column + KPI strip + top bar

**Top Bar:**
- Left: SyncGmailButton (compact mode)
- Right: Calendar link (`/calendar`), Receipts link (`/receipts`)

**KPI Strip (5 metric cards):**
- New Leads count
- Appointments count
- Voice Calls count
- Waiting count
- Overdue Tasks count

**Left Column (Intelligence):**
- DealerBriefClient: dealer score card
- ReviewsSection: GBP reviews (last 30 days, up to 10)
- OnboardingChecklist: 5 progress items
- PulseScoreWidget: org pulse score

**Center Column (Activity Feed - TodayContent):**
1. **Filter Chips (7 filters):** Hot, Warm, Repeat, Appointment, Phone, Silent7, No Automation
2. **Bulk Action Bar (when selected):** Park, Work Now, Low ROI, Archive
3. **Activity Queue (multiple card types):**
   - NewLeadCard: inbound email activities
     - Call (tel: link)
     - Text (sms: link)
     - Schedule Appointment (POST `/api/activities`)
     - Done (PATCH `addressed_at`)
     - Follow up dropdown (Tomorrow/3d/1w/2w + calendar checkbox)
     - Dismiss (PATCH `completed_at`, outcome=no_response)
     - Sequence controls (Pause/Resume/Stop)
   - TaskItem: open tasks due today
   - WaitingItem: outbound awaiting response
   - VoiceLeadCard: completed voice calls today
   - VehicleMatchCard: want-list matches
   - AppointmentRequestCard: inbound appointment requests
   - EmailFollowUpItem: pending email follow-ups
   - IntelligenceAlerts: takeover signals, at-risk leads

**Right Column (Tasks & To-Dos - TodoSection):**
- Task list (open tasks, max 50, sorted by priority DESC, due_at ASC)
- Snooze dropdown (pre-defined intervals)
- Complete button

**Focus Mode (overlay):**
- FocusSession (when ?focus=N in URL)

**Data Scope:**
- New leads: inbound email, pending, not addressed, not snoozed (DESC by created_at)
- Tasks: open tasks due today or earlier (priority DESC, due_at ASC)
- Waiting: outbound calls/SMS/email >24h old, not completed
- Appointments: next 30 hours, up to 12
- GBP reviews: last 30 days, up to 10
- Voice leads: completed calls from today
- At-risk: detected via lead score algorithms

**Activity Queue Logic:**
- Sorting: lead intent tier (HOT/WARM), urgency, sequence status, takeover signals
- Deduplication: one card per customer (most recent activity)
- Auto-hiding: addressed items hidden until next day or follow-up due

**Verified:** ✅ Code: `/today/page.tsx` + `/today/TodayContent.tsx` + `NewLeadCard.tsx`

---

### 9.5. LEASES PAGE (`/leases`) - DEALER ONLY (Optional Feature)

**Page Title:** "Leases"

**Status Filter Buttons (6 filters):**
- All (all leases)
- Application (application status)
- Approved (approved status)
- Lease Signed (lease_signed status)
- Active (active status)
- Expired (expired status)

**Each Lease Card displays:**
1. **Header:** Property address (address_line1, city)
2. **Transaction ID:** Transaction number or first 8 chars of ID
3. **Status badge** (color-coded):
   - Application: yellow
   - Approved: blue
   - Lease Signed: purple
   - Active: green
   - Expired: gray
   - Cancelled: red
4. **Details row:**
   - Monthly rent amount (if set)
   - Lease term in months (if set)
   - Move-in date (if set)
   - Tenant/Buyer name (if set)
5. **Card action:** Click → /vehicles/{vehicle_id}#vehicle-detail-transactions

**Empty State:** "No leases found" + helper text

**Loading State:** 3 skeleton cards

**Error State:** Error message + network error fallback

**Data Source:** GET `/api/transactions?transaction_type=lease`

**Data Scope:** All lease transactions for org, fetched client-side, filtered in-browser

**Verified:** ✅ Code: `/leases/page.tsx`

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

### 10.5. FAX PAGE (`/fax`) - OPTIONAL FEATURE

**Page Title:** "Fax"

**Send Section (Compose Card):**
- Fax number input (tel type, placeholder: "Fax number e.g. 818-555-1234")
- File picker (dashed border, accepts: .pdf, .jpeg, .png, .tiff)
  - No file: Upload icon + "Tap to attach PDF or image"
  - With file: FileText icon + file name + X remove button
- Error message display (red text)
- Success message (green text with CheckCircle, 4-sec timeout): "Fax queued — delivery usually takes 1–3 minutes."
- Send Fax button (primary, disabled until to + file)

**History Section:**
- Header: "HISTORY" + "Updating…" spinner (if polling)
- Each fax card:
  - FileText icon
  - To number (recipient)
  - File name + page count ("doc.pdf · 3p")
  - Error message (if failed, red text)
  - Status badge (color-coded):
    - Queued: yellow, Clock
    - Processing: blue, spinning Loader
    - Sending: blue, spinning Loader
    - Delivered: green, CheckCircle
    - No Answer: orange, AlertCircle
    - Busy: orange, AlertCircle
    - Failed: red, AlertCircle
    - Canceled: gray, X
  - Time ago (relative)

**States:**
- Empty: "No faxes sent yet."
- Loading: "Loading…"

**Validation:**
- Fax number: ≥10 digits
- File: required, PDF or image

**API:**
- Send: POST `/api/fax/send` (FormData: file, to)
- History: GET `/api/fax`

**Polling:** every 15s while in-progress (queued/processing/sending)

**Verified:** ✅ Code: `/fax/page.tsx`

---

### 10.6. ADMIN PANEL (`/admin`) - PLATFORM STAFF ONLY

**Access Control:**
- Required: `platform_superuser` role
- Non-superuser redirects:
  - `platform_sales_manager` → /admin/sales
  - `platform_staff_manager` → /admin/staff
  - Others → /admin/tickets

**Page Title:** "DealerWyze Admin" (dealer) or "RealtyWyze Admin" (RE)

**Vertical Scoping:** Orgs filtered by `x-vertical` (dealer vs real_estate)

**Alert Banner (conditional):**
- If alertCount > 0: Red banner, text: "{count} platform alert(s) need attention", links to /admin/alerts

**Revenue Summary Strip (6 metric cards):**
- Total Dealers/Agencies (approved count)
- Active (subscription_status=active)
- Trialing (subscription_status=trialing)
- Past Due (red bg if > 0)
- Est. MRR ($total from active tier 1/2 plans)
- Pending Approval (orange bg if > 0)
- Suspended (orange card if > 0)

**Metric Cards Grid (6 desktop / 2 mobile):**

1. **Retention Card** → /admin/retention
   - Icon: TrendingDown (purple)
   - Avg health score /100 (green ≥65, yellow ≥35, red <35)
   - Tier bar (3-section stacked):
     - Red: Critical count
     - Yellow: At-risk count
     - Green: Healthy count
   - Details: never logged in count, dormant 30d+

2. **Support Card** → /admin/tickets
   - Icon: TicketCheck (blue)
   - Open tickets count (large)
   - Urgent/High count (if any)
   - Unassigned count (if any)

3-6. **Additional cards:** organization, cron, revenue, transfers

**Additional Components:**
- PendingApprovalQueue (orgs awaiting approval)
- PendingTransferQueue (business transfers)
- Weekly signups trend (8 weeks)
- Plan distribution (tier breakdown by MRR)
- Cron job health (check-tasks, sync-leads, poll-reviews)

**Key Metrics:**
- Health score: subscription status, last active, onboarding, SMS usage %
- Tier distribution: Critical (<35), At-risk (35-65), Healthy (>65)
- MRR: from active tier 1/2 subscriptions
- Attrition signals: never logged in, dormant 30d+

**Data Queries (service-role, multi-org):**
- Organizations (approved, vertical-filtered)
- Pending approvals
- Business transfers
- Admin alerts (unresolved)
- Cron runs (last 30)
- Support tickets (open)
- Platform staff count
- Email accounts (attrition)
- Profiles + auth.users (last_sign_in_at)

**Verified:** ✅ Code: `/admin/page.tsx`

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
