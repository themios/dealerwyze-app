# RealtyWyze Lead Parsers

This document describes the lead parsers for RealtyWyze, which automatically extract structured data from incoming lead emails.

## Overview

Lead parsers integrate into the Gmail polling infrastructure (`lib/gmail/processHistory.ts`) and automatically route parsed leads to the inbox with source attribution.

### Supported Sources

1. **Zillow Premier Agent** (`zillow`)
2. **Realtor.com** (`realtor.com`)
3. **Boomtown CRM Forwards** (`boomtown`)

## Parser Behavior

### Parsing Order

When an unknown sender email arrives, parsers are tried in order:

1. Zillow parser (if from `noreply@zillowgroup.com` or contains "lead interest")
2. Realtor.com parser (if from `notifications@realtor.com` or contains "inquiry")
3. Boomtown parser (lenient match for CRM forwards)
4. Generic parser (fallback)

Each parser returns `null` if it doesn't match, allowing the next parser to try.

### Field Extraction

All parsers use flexible field extraction to handle email format variations:

```
Patterns supported:
- "Field: value"
- "Field\nvalue"
- "Field = value" (Boomtown only)
```

### Extracted Fields

Each parser extracts these fields (maps to `ParsedLead` interface):

| Field | Source | Required |
|-------|--------|----------|
| `name` | Buyer name, agent name, or derived from email | At least one of: name, email, phone |
| `email` | Contact email address | Optional |
| `phone` | Contact phone (normalized to 10 digits) | Optional |
| `zip` | ZIP code extracted from property address | Optional |
| `vehicle` | Property address | Optional |
| `comments` | Buyer message or inquiry text | Optional |
| `source` | `'zillow'`, `'realtor.com'`, or `'boomtown'` | Always set |
| `is_hot` | Boolean flag (always `true` for lead emails) | Always `true` |

## Parser Details

### Zillow Lead Parser

**File:** `lib/leads/parseZillow.ts`

**Email indicators:**
- From: `noreply@zillowgroup.com` or contains "zillow"
- Subject/body contains "lead interest", "inquiry", or "premier agent"

**Expected fields:**
- Buyer / Name
- Email
- Phone / Mobile
- Property / Address
- Message / Comments

**Example email:**
```
From: noreply@zillowgroup.com
Subject: New lead interest: 123 Main St, Pasadena CA 91101

Buyer: John Smith
Email: john.smith@example.com
Phone: (555) 123-4567
Property: 123 Main St, Pasadena CA 91101
Message: Very interested in this property. Can you tell me more about the HOA?
```

### Realtor.com Lead Parser

**File:** `lib/leads/parseRealtorCom.ts`

**Email indicators:**
- From: `notifications@realtor.com` or contains "realtor"
- Subject/body contains "inquiry", "lead", or "buyer"

**Expected fields:**
- Buyer / Agent / Contact / Name
- Email
- Phone / Contact Phone
- Property Address / Address
- Message / Comments

**Example email:**
```
From: notifications@realtor.com
Subject: New buyer inquiry: 456 Oak Ave, Los Angeles CA 90210

Buyer: Jane Doe
Email: jane@example.com
Phone: (555) 987-6543
Property Address: 456 Oak Ave, Los Angeles CA 90210
Message: Interested in scheduling a showing this weekend
```

### Boomtown CRM Parser

**File:** `lib/leads/parseBoomtown.ts`

**Email indicators:**
- Lenient matching (looks for "boomtown", "crm", "lead", "inquiry", "buyer", or "property")

**Expected fields:**
- Buyer / Prospect / Contact / Name
- Email / Buyer Email / Contact Email
- Phone / Mobile / Contact Phone
- Property / Address / Listing
- Message / Comments / Notes
- Agent / Agent Name (optional)

**Why lenient?**
Boomtown and other CRM forwards use inconsistent formats. This parser uses more flexible matching to handle variations.

**Example email:**
```
From: agent@mybrokerage.com
Subject: CRM Forward - New Lead

Agent: John Davis
Prospect Name: Mike Johnson
Email: mike.j@example.com
Phone: 555-222-5555
Property: 789 Pine St, San Diego CA 92101
Notes: Hot lead - qualified buyer, looking to close in 30 days
```

## Integration

### Gmail Processing

When a new email arrives via Gmail Pub/Sub:

1. Email is fetched and parsed by `simpleParser`
2. `processHistory()` checks if sender is a known customer (existing reply)
3. If unknown sender and matches `lead_source_email_matchers`:
   - Try parsers in order (Zillow → Realtor → Boomtown → generic)
   - If parser returns a `ParsedLead`, call `ingestLead()`
   - Lead is created in RealtyWyze inbox with source attribution

### Lead Ingestion

Parsed leads are routed to:

- **Customer creation:** Leads may create new customers (if email not already in DB)
- **Activity logging:** Email details are stored as inbound email activity
- **Lead inbox:** Lead appears with source badge ("Zillow", "Realtor.com", etc.)
- **Location detection:** Address is analyzed for geographic context
- **Scoring:** Lead receives intent score for prioritization

## Testing

### Manual Test: Zillow Email

Send an email to your RealtyWyze Gmail account from `test@noreply.zillowgroup.com`:

```
Subject: New lead interest: Test Property

Buyer: Test Buyer
Email: test.buyer@example.com
Phone: (555) 000-1111
Property: 123 Test St, Pasadena CA 91101
Message: This is a test Zillow inquiry
```

Expected: Lead appears in inbox with source = "Zillow"

### Manual Test: Realtor.com Email

```
Subject: New buyer inquiry: Another Test

Buyer Name: Realtor Test
Email: realtor.test@example.com
Phone: 555-222-3333
Property Address: 456 Test Ave, LA CA 90210
Message: Testing Realtor.com parser
```

Expected: Lead appears in inbox with source = "Realtor.com"

### Manual Test: Boomtown Forward

```
Subject: CRM Forward - Lead

Prospect Name: CRM Test Prospect
Email: crm.test@example.com
Phone: 555-333-4444
Property: 789 Test Ln, San Diego CA 92101
Agent: Test Agent
Notes: This is a test Boomtown forward
```

Expected: Lead appears in inbox with source = "Boomtown"

## Edge Cases & Handling

### Missing Email / Phone

If email AND phone are missing, but name is present, lead may be created with minimal contact info.

### ZIP Code Extraction

ZIP is extracted from property address using regex `\b(\d{5})\b`. Supports:
- 5-digit: "90210"
- ZIP+4: "90210-1234"

### Phone Normalization

Phones are normalized to 10 digits (last 10 digits of the input). Supports:
- Formatted: "(555) 123-4567"
- Dots: "555.123.4567"
- Hyphens: "555-123-4567"
- Raw: "5551234567"

### Name Extraction from Email

If name not found, email address is used:
- "john.doe@example.com" → "John Doe"
- "jane_smith@example.com" → "Jane Smith"

## Adding New Parsers

To add a new lead source:

1. Create `lib/leads/parse[Source].ts` following the pattern
2. Export a function: `export function parse[Source]Lead(subject: string, textBody: string, fromEmail: string): ParsedLead | null`
3. Return `null` if email doesn't match, or return a `ParsedLead` object
4. Add source to `LeadSource` type in `lib/leads/parser.ts`
5. Import and add to parsing chain in `lib/gmail/processHistory.ts`

## Performance Notes

- Parsers use simple regex patterns (no heavy NLP)
- Field extraction is O(1) per email (single pass)
- Duplicate detection uses unique index on `(org_id, gmail_message_id)`
- No external API calls required

## Troubleshooting

### Leads not appearing

1. Check email source matches a parser (or `lead_source_email_matchers`)
2. Verify email contains at least name OR email OR phone
3. Check Gmail integration is active (`email_accounts` exists + valid refresh token)
4. Look at cron logs for `processHistory` errors

### Wrong lead source attribution

1. Check `lead_source_email_matchers` configuration (might override with custom rules)
2. Verify `fromEmail` is being passed correctly
3. Check parser order in `processHistory.ts`

### Fields missing from parsed lead

1. Review email format (ensure fields match expected patterns)
2. Check regex patterns in parser (may need adjustment for custom formats)
3. Fall back to manual entry if email format is non-standard

---

**Last updated:** 2026-05-31
