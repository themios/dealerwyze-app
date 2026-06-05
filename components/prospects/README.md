# RE Prospect Extraction

Extract property prospect information from text, images, or PDFs using Claude vision and Groq synthesis.

## Components

### ProspectExtractionModal
Master modal with 3 input methods:
1. **Text Tab** - Paste prospect inquiry, email, referral notes
2. **Image Tab** - Upload screenshot of form or listing inquiry
3. **PDF Tab** - Upload email or document PDF

Features:
- Tabs for easy switching between input methods
- File upload with validation (max 5MB)
- Error handling with user-friendly messages
- Routes extraction to appropriate handler based on method
- Shows result in nested `ExtractionResultModal`

### ExtractionResultModal
Preview extracted fields before import:
- Displays 15+ fields organized by category
- Shows confidence badge for each field
- Overall confidence summary
- Two action buttons:
  - "Import as New Lead" - Creates new lead from extraction
  - "Merge with Existing" - (Stub for future implementation)
- Scrollable content for large results

### ConfidenceBadge
Reusable confidence indicator:
- Color-coded: green (high), amber (medium), red (low)
- Compact inline display
- Dark mode support

## Type Definitions

```typescript
interface ProspectExtractionResult {
  first_name: ScanField
  last_name: ScanField
  phone: ScanField
  phone2: ScanField
  email: ScanField
  city: ScanField
  state: ScanField
  zip: ScanField
  property_type: ScanField
  property_address: ScanField
  property_city: ScanField
  budget: ScanField<number>
  prospect_intent: ScanField
  lead_source: ScanField
  notes: ScanField
  urgency: ScanField
  overall_confidence: Confidence
}

type ExtractionMethod = 'text' | 'image' | 'pdf'
```

## API Route

### POST /api/prospects/extract

Extract prospect information from text, image, or PDF.

**Request (Text):**
```json
{
  "method": "text",
  "text": "Maria Garcia is interested in buying a 3-bed home in Pasadena for around $600k. Phone: 714-555-0000, Email: maria@gmail.com"
}
```

**Request (Image/PDF):**
```json
{
  "method": "image|pdf",
  "mime_type": "image/png|application/pdf",
  "file_base64": "base64-encoded-file"
}
```

**Response:**
```json
{
  "first_name": { "value": "Maria", "confidence": "high" },
  "last_name": { "value": "Garcia", "confidence": "high" },
  "phone": { "value": "7145550000", "confidence": "high" },
  "email": { "value": "maria@gmail.com", "confidence": "high" },
  "city": { "value": "Pasadena", "confidence": "high" },
  "state": { "value": "CA", "confidence": "medium" },
  "property_type": { "value": "single_family", "confidence": "medium" },
  "budget": { "value": 600000, "confidence": "high" },
  "prospect_intent": { "value": "buy", "confidence": "high" },
  "urgency": { "value": "normal", "confidence": "medium" },
  "overall_confidence": "high"
}
```

## Integration

### In a CRM Prospects Page

```tsx
import { useState } from 'react'
import ProspectExtractionModal from '@/components/prospects/ProspectExtractionModal'
import { Button } from '@/components/ui/button'

export default function ProspectsPage() {
  const [extractionOpen, setExtractionOpen] = useState(false)

  const handleImportSuccess = async (prospect) => {
    // Call your lead creation API
    const res = await fetch('/api/leads', {
      method: 'POST',
      body: JSON.stringify({
        first_name: prospect.first_name.value,
        last_name: prospect.last_name.value,
        phone: prospect.phone.value,
        email: prospect.email.value,
        city: prospect.city.value,
        state: prospect.state.value,
        // ... other fields
      }),
    })
    // Refresh prospects list
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Prospects</h1>
        <Button onClick={() => setExtractionOpen(true)}>
          Extract Prospect
        </Button>
      </div>

      <ProspectExtractionModal
        open={extractionOpen}
        onOpenChange={setExtractionOpen}
        onImportSuccess={handleImportSuccess}
      />

      {/* Prospects list below */}
    </div>
  )
}
```

## Extraction Methods

### Text Extraction (`scanProspectText`)
- Handles raw text pasted from various sources
- Supports: form submissions, emails, text notes, referrals
- Extracts: name, contact, location, property intent, budget
- Language support: English, Spanish, mixed

### Image Extraction (`scanProspectImage`)
- Analyzes screenshots of listing inquiries or forms
- Supports: JPEG, PNG, WebP, GIF
- OCR + extraction from visual form layouts
- Handles: Zillow forms, Realtor.com inquiries, agent websites

### PDF Extraction (`scanProspectPdf`)
- Processes email PDFs and document scans
- Supports: application/pdf
- Extracts contact info from email headers and body
- Handles: forwarded emails, submission confirmations

## Data Quality Rules

### Contact Information
- Strips field labels (e.g., "First Name: John" → "John")
- Normalizes casing: "JOHN SMITH" → "John" / "Smith"
- Validates 10-digit US phone numbers
- Requires name + phone OR email for high confidence

### Property Intent
- Recognizes intent: buy, sell, rent, refinance
- Extracts budget from prices or budget statements
- Parses property type from descriptions
- Gets urgency from keywords: ASAP, this week, etc.

### Deduplication
- Non-lead emails filtered out (digests, system emails)
- Agent/broker info separated from prospect info
- Email header addresses excluded (only prospect email)
- Placeholder values (N/A, Unknown) treated as null

## Supported Confidence Levels

- **High** - Name + (phone OR personal email)
- **Medium** - Partial contact info or some educated guessing
- **Low** - Minimal contact details or uncertain extraction

## Error Handling

- Invalid file type: returns user-friendly error message
- File too large (>5MB): shows size limit warning
- Extraction failure: returns error describing what went wrong
- Network errors: retry with exponential backoff

## Performance Notes

- Text extraction: ~2-3 seconds
- Image/PDF extraction: ~5-10 seconds (includes vision API call)
- Max file size: 5MB base64 string (~3.75MB decoded)
- 60 second timeout for API route

## Limitations

- MLS field does not include database validation (future work)
- Merge with existing prospect is stubbed (select lead UI needed)
- No duplicate detection across extracted prospects
- Limited to English language text (Spanish supported in prompt but not tested)

## Future Enhancements

1. Fetch MLS comparables for budget validation
2. Implement merge UI for duplicate handling
3. Add extracted prospect deduplication
4. Support additional languages (French, Portuguese)
5. Store extraction confidence for trending
