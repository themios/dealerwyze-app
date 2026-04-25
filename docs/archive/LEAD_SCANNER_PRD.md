# DealerWyze — Visual Lead Scanner
## Product Requirements Document

**Version:** 1.0
**Date:** 2026-03-03
**Status:** Ready for implementation
**Related:** `LEAD_SCANNER_EXECUTION_PLAN.md`

---

## 1. Problem

The current lead ingestion system works by reading email inboxes and matching
text patterns for known sources (CarGurus, AutoTrader, OfferUp, Facebook). This
works well for those sources but has two limits:

1. **New sources require new parsers.** Every marketplace, submission form, or
   referral channel that doesn't send a recognized email pattern is invisible
   to the system.

2. **Non-email leads are manual.** Leads that arrive as screenshots, texts,
   handwritten apps, walk-in forms, PDF credit apps, or referrals from other
   dealers require the salesperson to manually type in all the info — or it
   doesn't get in at all.

The business card scanner already solves this problem for contact capture using
Haiku Vision. This feature applies the same approach to **lead capture**.

---

## 2. Solution

A **Visual Lead Scanner** — a camera/upload interface that accepts any image or
PDF containing lead information, extracts structured data using Claude Vision,
shows a confirmation/edit screen, and creates the customer record with one tap.

No new email patterns to maintain. If a human can read it, the scanner can read it.

---

## 3. Supported Input Types

| Input | Example |
|-------|---------|
| Screenshot | Facebook Messenger conversation with interested buyer |
| Photo of a screen | Laptop showing a form submission, text thread |
| Business card | Buyer's card handed to a salesperson |
| Handwritten form | Walk-in customer info sheet |
| Online application | Screenshot of a finance application |
| PDF | Printed credit application, buyer's order, digital form |
| Photo of a photo | Blurry or printed version of any of the above |

---

## 4. Extracted Fields

The scanner attempts to extract all of these. Any field not found stays blank
and can be filled in manually on the confirm screen.

**Customer identity:**
- First name, last name
- Primary phone
- Secondary phone (if present)
- Email address
- City / State / ZIP

**Vehicle of interest:**
- Year
- Make
- Model
- Trim (if present)
- Budget / price range
- VIN (if present)

**Lead context:**
- Lead source (auto-detected: Facebook, CarGurus, text/SMS, walk-in, referral, etc.)
- Customer message / notes
- Urgency signal (e.g., "ready to buy today", "just browsing")
- Trade-in mention (yes/no + description if present)

**Confidence:**
- The scanner returns a `confidence` value (high / medium / low) per field
- Low-confidence fields are highlighted on the confirm screen so the user
  knows to double-check

---

## 5. User Flow

```
[User opens "Scan Lead" → camera opens or file picker]
           │
           ├── Takes photo / selects image
           │         or
           └── Selects PDF from Files app
                      │
                      ▼
            [Uploading + scanning…  ~3–5 sec]
                      │
                      ▼
            [Confirm & Edit screen]
            ┌────────────────────────────────┐
            │ 👤 John Martinez               │
            │    (818) 555-1234  ✓           │
            │    john@gmail.com  ✓           │
            │                                │
            │ 🚗 2021 Toyota Camry           │
            │    Budget: ~$22,000  ⚠ review  │
            │                                │
            │ 📍 Source: Facebook Marketplace│
            │    Notes: "Is it still avail?" │
            │                                │
            │ ⚠ Possible duplicate:          │
            │   John Martinez (818) 555-1234 │
            │   [View existing] [Still add]  │
            │                                │
            │ [Edit any field]               │
            │                                │
            │ [Send intro text after saving] │
            │              ✓ checked by def. │
            │                                │
            │ [ Save Lead ]                  │
            └────────────────────────────────┘
                      │
                      ▼
            [Lead saved → Customer detail page]
            [Intro SMS sent if checked]
```

---

## 6. Confidence Indicators

Fields extracted with lower certainty are marked so the user knows to verify:

- **✓ green** — high confidence (clear text, unambiguous)
- **⚠ yellow** — medium confidence (partially visible, guessed from context)
- **✕ red** — could not extract (blank, user must fill in)

The overall confidence for the scan is shown as a banner at the top of the
confirm screen:

- **"Looks good"** — all key fields high confidence
- **"Please review highlighted fields"** — some fields need a look
- **"Partial scan — fill in what's missing"** — blurry or incomplete source

---

## 7. Duplicate Detection

Uses the same logic as the existing `ingestLead()` function:

1. Match on normalized phone number against existing customers in this org
2. Match on email address
3. If a match is found → show a "Possible duplicate" banner on the confirm
   screen with the existing customer's name, phone, and last activity date
4. User can:
   - **View existing record** — go to the existing customer (no new record)
   - **Still add** — creates a new record anyway (separate customer entry)
   - **Merge** *(v2 scope)* — merges new info into existing record

---

## 8. Lead Source Auto-Detection

The scanner identifies the source from visual context and includes it in the
extracted data:

| Visual cue detected | Mapped source |
|---------------------|--------------|
| Facebook / Messenger branding | `facebook` |
| CarGurus logo or URL | `cargurus` |
| AutoTrader logo or URL | `autotrader` |
| OfferUp branding | `offerup` |
| Handwritten / lined paper | `walk_in` |
| Generic web form / PDF | `web_form` |
| SMS / iMessage screenshot | `text_referral` |
| Business card | `referral` |
| None detected | `other` |

---

## 9. PDF Support

PDFs are accepted directly — no image conversion needed. The Anthropic API
accepts PDF documents as a native `document` content block (base64-encoded).
This supports:

- Multi-page credit applications
- Printed buyer's orders
- Digital intake forms
- Exported email threads

Page limit: first 10 pages processed. For longer documents, only the first
10 pages are sent to the model with a note that additional pages were truncated.

---

## 10. Where It Lives in the UI

### Primary entry point: Customers page (`/customers`)
- Add a **"Scan Lead"** button next to the existing "+" (new customer) button
- On mobile (PWA), this opens a bottom sheet with: Camera | Photos | Files

### Secondary entry points:
- Today page quick action card (optional, v2)
- Floating action button on Pipeline page (optional, v2)

### Mobile-first considerations
- Camera input uses `capture="environment"` (rear camera) by default
- File picker accepts `image/*,application/pdf`
- Bottom sheet UI identical to Contacts scanner pattern
- Full-screen confirm screen with large tap targets

---

## 11. What It Does NOT Do

- Does not replace email lead ingestion — both run in parallel
- Does not OCR vehicle VINs from physical cars (separate feature)
- Does not bulk-import from a CSV or spreadsheet (separate feature)
- Does not auto-merge duplicates (v2)
- Does not read QR codes (v2)

---

## 12. Success Metrics

| Metric | Target |
|--------|--------|
| Scan-to-saved rate | >80% of scans result in a saved lead |
| Time to save (tap scan → lead saved) | <30 seconds |
| Key field extraction accuracy (name + phone) | >95% on clear images |
| Duplicate detection catch rate | >90% |
| PDF support completeness | All standard credit apps readable |
