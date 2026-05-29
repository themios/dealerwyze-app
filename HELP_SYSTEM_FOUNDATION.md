# Help System Foundation

**A complete, verified framework for writing accurate help articles.**

Created: 2026-05-29

---

## What We've Built

### 1. **NAVIGATION_TREE.md** ✅
A live reference document showing:
- Complete left sidebar navigation
- All buttons with exact labels
- What each button does
- Where each button routes to
- Dealer vs. RealtyWyze context differences
- Verified ✅ vs. pending ⏳ sections

**Use this to write help articles.** Example:
- Page: "Leads" in NAVIGATION_TREE.md
- Button: "Add Lead" 
- Action: "Click the **Add Lead** button in the top right. Choose **Add manually** from the menu, then enter their name and phone..."

### 2. **SYSTEM_KNOWLEDGE.md** ✅
Foundation document with:
- Verified sidebar navigation structure
- Real page URLs and titles
- Context-aware help text (dealer vs RE)
- Multi-tenancy and RLS rules

### 3. **COMPLETE_SYSTEM_MAP.md** ✅
High-level overview showing:
- Vertical-aware UI differences (dealer vs RealtyWyze)
- What's identical between verticals
- What's unique to each vertical
- Quick reference table of key differences

### 4. **SYSTEM_AUDIT.md** ⏳
Detailed audit checklist tracking:
- What's verified ✅
- What needs verification ⏳
- Page-by-page breakdowns
- Verified buttons with component references

### 5. **extract-ui-structure.js** 🔧
Automated script to:
- Extract all page titles and routes
- Find button labels in components
- Map navigation structure
- Generate reports of all UI elements

**Usage:** `node extract-ui-structure.js > ui-report.txt`

---

## Workflow for Writing Help Articles

### Step 1: Check NAVIGATION_TREE.md
Find the page (e.g., "LEADS PAGE") and look at button structure:

```
LEADS PAGE (/customers)
├─ "Add Lead" button
│  └─ Sub-menu options:
│     ├─ "Add manually" → /customers/new
│     ├─ "Scan lead" → Opens dialog
│     ├─ "Paste lead" → Opens dialog
│     └─ "Import CSV" → Opens dialog
```

### Step 2: Write the Help Article
Use the exact information from the tree:

**Question:** "How do I add a new lead?"

**Answer:** 
"Go to **Leads** in the left menu, click the **Add Lead** button in the top right, then choose from the menu:
- **Add manually** — Fill in form with name, phone, email, etc.
- **Scan lead** — Use camera to scan a business card
- **Paste lead** — Paste contact information from text
- **Import CSV** — Upload a spreadsheet file

Once added, the lead appears in your Leads list."

### Step 3: Verify Against Code
Before finalizing, verify the button exists:
- Check SYSTEM_AUDIT.md for verification status
- If marked ✅, button is confirmed in code
- If marked ⏳, needs code verification before publishing

---

## Current Status

### Verified & Ready ✅
- Left sidebar navigation (all items)
- Leads page (`/customers`) - all buttons
- Inventory page (`/vehicles`) - dealer & RealtyWyze versions
- Contacts page (`/contacts`) - all buttons
- Top-right action buttons (Add Lead, Add Inventory, Add Listing, Add Contact, Scan Card)

**Can write help articles for these pages now.**

### Pending Verification ⏳
- Messages page (`/messages`)
- Settings subsections
  - `/settings` main
  - `/settings/team`
  - `/settings/billing`
  - `/settings/website`
  - `/settings/account`
  - Others
- Dashboard (`/dashboard`)
- Today (`/today`)
- Web Leads (`/leads/web`)
- RealtyWyze-specific pages
  - Showings (`/showings`)
  - Commissions (`/commissions`)
- Admin pages
- Optional pages (BHPH, Leases, Fax)

**Need to verify these before writing articles about them.**

---

## How to Keep This Current

### When UI Changes
1. Update NAVIGATION_TREE.md directly with the change
2. Run extraction script: `node extract-ui-structure.js`
3. Compare output against manual verification
4. Update SYSTEM_AUDIT.md if verification status changes
5. Update help articles that reference the changed button

### Adding New Pages
1. Once page is live, add entry to NAVIGATION_TREE.md
2. Document all buttons and actions
3. Mark as ✅ VERIFIED once code is reviewed
4. Write corresponding help article

### Automation
Run the extraction script monthly to audit for any missed pages or buttons:
```bash
node extract-ui-structure.js > /tmp/ui-report-$(date +%Y-%m-%d).txt
```

---

## Integration with Help System API

The `/api/help/ask` endpoint now uses:
1. **First:** Search help_articles table for direct match
2. **Second (if no match):** Use SYSTEM_KNOWLEDGE.md as RAG context for AI
3. **Never:** Hallucinate UI elements not in these documents

This ensures:
- **Accurate:** Only references verified buttons and pages
- **Methodical:** Step-by-step instructions from actual UI
- **Factual:** No invented menus or imaginary buttons
- **Maintainable:** Single source of truth in NAVIGATION_TREE.md

---

## Files to Maintain

| File | Purpose | Update Frequency |
|------|---------|-------------------|
| NAVIGATION_TREE.md | Live button/action reference | When UI changes |
| SYSTEM_KNOWLEDGE.md | Verified system facts | When nav changes |
| COMPLETE_SYSTEM_MAP.md | Vertical-aware overview | When UI changes |
| SYSTEM_AUDIT.md | Verification status tracker | Monthly |
| extract-ui-structure.js | Automated extraction | No changes needed |
| Help articles | User-facing guides | As pages are verified |

---

## Next Steps

1. **Immediate:** Use NAVIGATION_TREE.md to write help articles for verified pages
2. **This week:** Complete verification of Settings subsections
3. **This week:** Verify Messages, Dashboard, Today pages
4. **This week:** Verify RealtyWyze-specific pages (Showings, Commissions)
5. **Ongoing:** Update documents as UI evolves

---

## Example: Writing a Help Article Now

**Topic:** "How do I add a team member?"

**Process:**
1. Check NAVIGATION_TREE.md for Settings/Team section
   - Status: ⏳ Pending verification
   - Buttons: "Add Team Member" or similar - TBD

**Wait:** Don't write this article yet. Need to verify the actual button label.

**Process after verification:**
1. Update NAVIGATION_TREE.md with verified button
2. Write article:

   "Go to **Settings** in the left menu, click **Team** in the settings options, then click **Add Team Member**. Enter their email, choose their role (admin, manager, agent, viewer), and click Send. They'll receive an email invite..."

---

## Quality Gate

Before publishing any help article:
- ☑️ Button exists in code (marked ✅ in SYSTEM_AUDIT.md)
- ☑️ Button label is exact (from NAVIGATION_TREE.md)
- ☑️ Route/action is correct (verified in component)
- ☑️ Instructions are step-by-step (not vague)
- ☑️ Context-aware (dealer vs RE noted if applicable)
- ☑️ No invented UI elements
