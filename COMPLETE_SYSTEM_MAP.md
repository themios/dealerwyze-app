# Complete DealerWyze/RealtyWyze System Map

**Vertical-Aware UI Documentation**
Shows exactly what users see in each vertical (dealer vs real_estate).

---

## QUICK REFERENCE: What's Different?

| Feature | DealerWyze (Dealers) | RealtyWyze (Real Estate Agents) |
|---------|----------------------|---------------------------------|
| **Main CRM item** | Customer (lead) | Client (lead) |
| **Inventory** | Vehicles | Listings |
| **Add Inventory Button** | "Add Inventory" | "Add Listing" |
| **Pipeline stages** | Lead → Interested → Test Drive → Negotiating → Sold | (Custom RE stages) |
| **RE-only nav items** | N/A | Showings, Commissions |
| **Page titles** | "Inventory" | "Listings" |
| **Messaging** | SMS/Email/Call from dealership | SMS/Email/Call from agency |

---

## LEFT SIDEBAR - CONTEXT AWARE

### Both Verticals (Identical)
```
Dashboard          → /dashboard
Today              → /today
Leads              → /customers      (Label shows "Leads" for both)
Web Leads          → /leads/web
Inventory          → /vehicles       (Dealers: "Inventory", RE: "Listings")
Contacts           → /contacts
[Role-based items]
Messages           → /messages
Support            → /support
Settings           → /settings
```

### DealerWyze Only
```
BHPH               → /bhph           (If enabled)
Leases             → /leases         (If enabled)
Fax                → /fax            (If enabled)
```

### RealtyWyze Only
```
Showings           → /showings       (Always visible)
Commissions        → /commissions    (Always visible)
```

### Admin-only (Both Verticals)
```
Admin Panel        → /admin          (Platform staff only)
```

---

## PAGE BY PAGE: DEALER VS REALTY

### PAGE 1: LEADS (`/customers`)

**BOTH VERTICALS - Same Page, Same Layout**

| Element | Dealer | RealtyWyze |
|---------|--------|-----------|
| **Page Title** | "Leads (N)" | "Leads (N)" |
| **Entity Name** | "customer" | "client" |
| **Add Button** | "Add Lead" → Menu with: Add manually, Scan lead, Paste lead, Import CSV | "Add Lead" → Menu with: Add manually, Scan lead, Paste lead, Import CSV |
| **View Tabs** | List, Pipeline, Segments, Archived | List, Pipeline, Segments, Archived |
| **Pipeline Stages** | Lead, Interested, Test Drive, Negotiating, Sold | (Custom stages per org) |
| **Empty State** | "No leads yet" → "Add First Lead" button | "No leads yet" → "Add First Lead" button |

**Verified:** ✅ Both verticals use same `/customers` page

---

### PAGE 2: INVENTORY (`/vehicles`)

**CONTEXT AWARE - Different Title, Different Actions**

#### DealerWyze: Inventory Management
| Element | Value |
|---------|-------|
| **Page Title** | "Inventory" |
| **URL** | `/vehicles` |
| **Button 1** | "Add Inventory" → VehicleIntakeSheet (barcode scan or form) |
| **Button 2** | "Sync Inventory" → Syncs from external source |
| **Button 3** | "Run Market Intelligence" (admin only) → Market analysis |
| **Filter Tabs** | All, Available, Pending, Sold, Staging |
| **Entity** | Vehicle (year, make, model, price, mileage, stock#) |
| **Empty State** | "No inventory" → "Add First Vehicle" |

#### RealtyWyze: Listings Management
| Element | Value |
|---------|-------|
| **Page Title** | "Listings" |
| **URL** | `/vehicles` (SAME URL, different content based on `vertical`) |
| **Button 1** | "Add Listing" → Form for property details |
| **Button 2** | "Sync Inventory" → (Might be disabled or unavailable) |
| **Button 3** | "Run Market Intelligence" → (Might be unavailable) |
| **Filter Tabs** | All, Available, Pending, Sold, Staging (or custom) |
| **Entity** | Listing (address, beds, baths, sqft, price, MLS#) |
| **Empty State** | "No listings" → "Add First Listing" |

**Logic:** File: `VehicleIntakeButton.tsx` line 16-26:
```
if (vertical === 'real_estate') {
  return <Button>Add Listing</Button>
} else {
  return <Button>Add Inventory</Button>
}
```

**Verified:** ✅ VehicleIntakeButton.tsx confirms vertical-aware logic

---

### PAGE 3: CONTACTS (`/contacts`)

**BOTH VERTICALS - Identical**

| Element | Value |
|---------|-------|
| **Page Title** | "Contacts" |
| **URL** | `/contacts` |
| **Button 1** | "Add Contact" → Manual entry form |
| **Button 2** | "Scan Card" → Business card OCR scan |
| **Fields** | Name, Company, Title, Phone, Email, Fax, Address, Website, Notes |

**Verified:** ✅ contacts/page.tsx confirmed

---

### PAGE 4: MESSAGES (`/messages`)

**Status:** ⏳ NEEDS VERIFICATION

---

### PAGE 5: SETTINGS (`/settings`)

**Complex Nested Menu - Needs Full Audit**

**Rough Structure (needs verification):**
```
/settings
├─ Profile/Account
├─ Team
├─ Roles & Permissions
├─ Billing
├─ Website (dealers only)
├─ Data & Privacy
└─ Integrations
```

**Status:** ⏳ NEEDS VERIFICATION - Sub-pages and buttons unknown

---

### PAGE 6: SHOWINGS (`/showings`) - RealtyWyze Only

**Status:** ⏳ NEEDS VERIFICATION - Structure unknown

---

### PAGE 7: COMMISSIONS (`/commissions`) - RealtyWyze Only

**Status:** ⏳ NEEDS VERIFICATION - Structure unknown

---

### PAGE 8: DASHBOARD (`/dashboard`)

**Status:** ⏳ NEEDS VERIFICATION - What widgets? What actions?

---

### PAGE 9: TODAY (`/today`)

**Status:** ⏳ NEEDS VERIFICATION - What's displayed? What buttons?

---

### PAGE 10: WEB LEADS (`/leads/web`)

**Dealer-focused Page - RealtyWyze Behavior Unknown**

| Element | Value |
|---------|-------|
| **Page Title** | "Web Leads" |
| **URL** | `/leads/web` |
| **Source** | Inquiries from public website |
| **Status** | new, contacted, archived |
| **Status:** | ⏳ NEEDS VERIFICATION - Does RealtyWyze use this? |

---

## VERTICAL-AWARE API ROUTES

All routes respect `vertical` from `organizations.vertical`:

| Vertical | Routes Available |
|----------|-----------------|
| `'dealer'` | /customers, /vehicles, /leads/web, /bhph (optional), /leases (optional), /fax (optional) |
| `'real_estate'` | /customers (same as dealers), /vehicles (shows as "Listings"), /showings, /commissions |
| **Both** | /contacts, /messages, /settings, /dashboard, /today, /admin (platform staff) |

---

## COMPLETE AUDIT CHECKLIST

### Verified ✅
- [x] Left sidebar navigation structure
- [x] Leads page (`/customers`) - both verticals
- [x] Inventory page (`/vehicles`) - vertical-aware
- [x] Contacts page (`/contacts`)
- [x] Top-right button labels (Add Lead, Add Inventory, Add Listing, Add Contact, Scan Card)

### Pending ⏳
- [ ] Messages page (`/messages`) - all buttons, submenus
- [ ] Settings page (`/settings`) - all subsections, buttons, forms
- [ ] Showings page (`/showings`) - buttons, actions
- [ ] Commissions page (`/commissions`) - buttons, actions
- [ ] Dashboard (`/dashboard`) - widgets, actions
- [ ] Today page (`/today`) - content, buttons
- [ ] Web Leads page (`/leads/web`) - buttons, actions, RealtyWyze support
- [ ] Customer detail pages - what buttons appear?
- [ ] Inventory/Listing detail pages - what buttons appear?
- [ ] All modal/dialog forms - button labels, field names
- [ ] All API endpoints and their purposes

---

## NEXT STEPS

1. ✅ Map overall structure and vertical awareness
2. ✅ Verify main pages
3. ⏳ Complete audit of remaining pages
4. ⏳ Document all buttons, menus, and actions
5. ⏳ Finalize SYSTEM_KNOWLEDGE.md
6. ⏳ Write accurate, verified help articles
