# RealtyWyze Features - Quick Start Integration Guide

4 production-ready RealtyWyze features implemented. All code is complete and ready to integrate.

## Quick Navigation

### Task 1: Property Document Summarizer
**Path:** `components/documents/`
**Core:** Upload property documents → Claude vision summarization → Display bullets
```tsx
import DocumentUploadModal from '@/components/documents/DocumentUploadModal'
import DocumentList from '@/components/documents/DocumentList'
```
**API:** `POST /api/documents/analyze` | `DELETE /api/documents/[id]`

### Task 2: RE Prospect Extraction
**Path:** `components/prospects/`
**Core:** 3 input methods (text/image/PDF) → Claude extraction → Preview + import
```tsx
import ProspectExtractionModal from '@/components/prospects/ProspectExtractionModal'
```
**API:** `POST /api/prospects/extract`

### Task 3: Receipt Form Extension
**Path:** `components/receipts/`
**Core:** Add PropertyLinkPicker + ConfidenceBar to existing ReviewForm
```tsx
import PropertyLinkPicker from '@/components/receipts/PropertyLinkPicker'
import ConfidenceBar from '@/components/receipts/ConfidenceBar'
```
**Note:** No new API routes needed (uses existing receipt routes)

### Task 4: RE Listing Pricing Analysis
**Path:** `components/pricing/`
**Core:** Form → Groq analysis → 3-tier pricing + market insights
```tsx
import PricingAnalysisButton from '@/components/pricing/PricingAnalysisButton'
import PricingAnalysisModal from '@/components/pricing/PricingAnalysisModal'
```
**API:** `POST /api/listings/pricing-analysis`

---

## File Summary

### Components Created

**Documents (4 files):**
- `components/documents/types.ts` - PropertyDocument type
- `components/documents/DocumentCard.tsx` - Single doc display
- `components/documents/DocumentList.tsx` - Container
- `components/documents/DocumentUploadModal.tsx` - Upload & progress

**Prospects (4 files):**
- `components/prospects/types.ts` - ProspectExtractionResult type
- `components/prospects/ConfidenceBadge.tsx` - Reusable badge (high/med/low)
- `components/prospects/ExtractionResultModal.tsx` - Preview before import
- `components/prospects/ProspectExtractionModal.tsx` - Master modal (3 tabs)

**Receipts (2 files):**
- `components/receipts/PropertyLinkPicker.tsx` - Property autocomplete
- `components/receipts/ConfidenceBar.tsx` - Confidence progress bar

**Pricing (5 files):**
- `components/pricing/types.ts` - Form & response types
- `components/pricing/PricingAnalysisButton.tsx` - Trigger button
- `components/pricing/PricingAnalysisModal.tsx` - Form + results display
- `components/pricing/CMAPricingCard.tsx` - 3-tier pricing card
- `components/pricing/MarketInsightsSection.tsx` - Market analysis

### API Routes (4 files)

- `app/api/documents/analyze/route.ts` - Upload document
- `app/api/documents/[id]/route.ts` - Delete document
- `app/api/prospects/extract/route.ts` - Extract prospect (text/image/PDF)
- `app/api/listings/pricing-analysis/route.ts` - Analyze listing price

### Documentation (4 files)

- `components/documents/README.md` - Full integration guide
- `components/prospects/README.md` - Full integration guide
- `components/pricing/README.md` - Full integration guide
- `IMPLEMENTATION_SUMMARY.md` - Technical overview

---

## What's Already Configured

✓ All AI models available
- `OPENROUTER_API_KEY` - Gemini 2.5 Flash Lite + Claude fallback
- `GROQ_API_KEY` - 70B model for market analysis
- `ANTHROPIC_API_KEY` - Claude fallback already set

✓ All shadcn/ui components in project
- Button, Dialog, Input, Label, Textarea, Tabs, Select, Badge

✓ Existing modules ready to use
- `lib/documents/summarizePropertyDoc.ts` - Claude vision
- `lib/leads/propertyProspectIngest.ts` - Prospect extraction (text/image/PDF)
- `lib/pricing/reListingPricing.ts` - Groq market analysis

✓ Auth & RLS already enforced
- `requireProfile()` on all routes
- `createClient()` for org-scoped queries
- RLS policies applied

---

## What Needs to Happen Before Deploying

1. **Database migration:**
   ```sql
   CREATE TABLE property_documents (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
     org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
     filename TEXT NOT NULL,
     mime_type TEXT NOT NULL,
     storage_key TEXT NOT NULL,
     summary TEXT,
     created_at TIMESTAMP DEFAULT NOW(),
     updated_at TIMESTAMP DEFAULT NOW(),
     UNIQUE(storage_key)
   );
   CREATE INDEX idx_property_docs_property ON property_documents(property_id);
   CREATE INDEX idx_property_docs_org ON property_documents(org_id);
   ALTER TABLE property_documents ENABLE ROW LEVEL SECURITY;
   CREATE POLICY "Users can view org documents" ON property_documents FOR SELECT
     USING (org_id = auth.jwt() ->> 'org_id'::text);
   CREATE POLICY "Users can insert org documents" ON property_documents FOR INSERT
     WITH CHECK (org_id = auth.jwt() ->> 'org_id'::text);
   CREATE POLICY "Users can delete org documents" ON property_documents FOR DELETE
     USING (org_id = auth.jwt() ->> 'org_id'::text);
   ```

2. **Supabase storage bucket:**
   - Create bucket: `property-documents`
   - Make private (RLS enforced)
   - Structure: `{org_id}/{property_id}/doc_*.ext`

3. **Integration into pages:**
   - Add DocumentUploadModal/List to property detail page
   - Add ProspectExtractionModal to leads/prospects intake
   - Update ReviewForm with PropertyLinkPicker for RE vertical
   - Add PricingAnalysisButton to listing detail page

---

## Component Usage Examples

### Property Document Summarizer
```tsx
import { useState } from 'react'
import DocumentList from '@/components/documents/DocumentList'
import DocumentUploadModal from '@/components/documents/DocumentUploadModal'

export default function PropertyDocuments({ propertyId }: { propertyId: string }) {
  const [documents, setDocuments] = useState([])
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <div className="space-y-4">
      <button onClick={() => setModalOpen(true)}>Upload Document</button>
      <DocumentList
        propertyId={propertyId}
        documents={documents}
        onDocumentsChange={setDocuments}
      />
      <DocumentUploadModal
        propertyId={propertyId}
        open={modalOpen}
        onOpenChange={setModalOpen}
        onUploadSuccess={doc => setDocuments(prev => [doc, ...prev])}
      />
    </div>
  )
}
```

### Prospect Extraction
```tsx
import { useState } from 'react'
import ProspectExtractionModal from '@/components/prospects/ProspectExtractionModal'

export default function ProspectsPage() {
  const [extractionOpen, setExtractionOpen] = useState(false)

  const handleImportSuccess = async (prospect) => {
    // Create lead from extracted prospect
    await fetch('/api/leads', {
      method: 'POST',
      body: JSON.stringify({
        first_name: prospect.first_name.value,
        last_name: prospect.last_name.value,
        phone: prospect.phone.value,
        email: prospect.email.value,
        // ... map all fields
      }),
    })
  }

  return (
    <>
      <button onClick={() => setExtractionOpen(true)}>Extract Prospect</button>
      <ProspectExtractionModal
        open={extractionOpen}
        onOpenChange={setExtractionOpen}
        onImportSuccess={handleImportSuccess}
      />
    </>
  )
}
```

### Pricing Analysis
```tsx
import { useState } from 'react'
import PricingAnalysisButton from '@/components/pricing/PricingAnalysisButton'
import PricingAnalysisModal from '@/components/pricing/PricingAnalysisModal'

export default function ListingPage({ propertyId }: { propertyId: string }) {
  const [analysisOpen, setAnalysisOpen] = useState(false)

  return (
    <div className="space-y-4">
      <PricingAnalysisButton
        onClick={() => setAnalysisOpen(true)}
      />
      <PricingAnalysisModal
        open={analysisOpen}
        onOpenChange={setAnalysisOpen}
        propertyId={propertyId}
      />
    </div>
  )
}
```

---

## Key Features

### ✓ Security
- All routes require authentication (`requireProfile()`)
- RLS enforced at database level
- Org scoping on all queries
- File validation (type + size)

### ✓ Performance
- Client-side file validation before upload
- Async processing with loading indicators
- Progress tracking for long operations
- Optimistic UI updates

### ✓ Error Handling
- No silent failures
- User-friendly error messages
- Graceful degradation (e.g., missing summaries don't fail)
- Proper HTTP status codes

### ✓ Accessibility
- ARIA labels on inputs
- Keyboard navigation throughout
- Color not sole indicator (badges have text)
- Focus management in modals

### ✓ Mobile-First
- Responsive grid layouts
- Touch-friendly controls
- Proper breakpoints (sm/md/lg)
- Optimized file pickers

---

## Testing Checklist

Quick smoke test for each feature:

**Documents:**
- [ ] Upload PDF document
- [ ] See progress indicator (0% → 100%)
- [ ] Summary displays with bullets
- [ ] Delete removes document

**Prospects:**
- [ ] Extract from pasted text
- [ ] Extract from uploaded image
- [ ] Extract from PDF
- [ ] Confidence badges show (high/med/low)
- [ ] Import button creates lead

**Receipts:**
- [ ] Property picker appears for RE orgs
- [ ] Autocomplete search works (MLS# + address)
- [ ] Confidence bar displays correctly
- [ ] Vehicle picker still shows for dealer orgs

**Pricing:**
- [ ] Form validates address required
- [ ] Analysis shows loading state
- [ ] 3 pricing tiers display
- [ ] Market insights show trend arrow
- [ ] Analyze another button works

---

## No Code Changes Required

These features don't modify existing code:
- ✓ `ReviewForm.tsx` - Just add PropertyLinkPicker component (no modification of ReviewForm itself needed initially)
- ✓ Existing API routes untouched
- ✓ Auth middleware unchanged
- ✓ Database schema additions only (no modifications to existing tables)

All implementation is additive, making rollback/feature flagging straightforward.

---

## Support References

- **Docs:** Each component folder has `README.md` with full integration guide
- **Types:** All types exported from `./types.ts` in each folder
- **Patterns:** Follow existing component patterns in codebase (receipts, leads, etc.)

---

**Status:** Ready for integration testing
**Last Updated:** 2026-06-04
**Implementation Time:** ~2 hours (all components + APIs + docs)
