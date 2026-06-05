# Property Document Summarizer

Upload and analyze property documents (inspection reports, appraisals, disclosures) with AI-powered summaries.

## Components

### DocumentUploadModal
- File picker with drag-and-drop support
- Supports JPEG, PNG, WebP, PDF formats
- Shows progress indicator while document is analyzed
- Max file size: 5MB
- Calls `/api/documents/analyze` to upload and summarize

### DocumentCard
- Displays document metadata (filename, upload date)
- Shows 3-5 bullet summary with collapsible bullets
- Delete button with confirmation
- Mobile-responsive design

### DocumentList
- Container for multiple documents
- Shows empty state when no documents exist
- Handles document deletion with optimistic updates
- Calls `DELETE /api/documents/[id]` to remove

## Type Definitions

```typescript
interface PropertyDocument {
  id: string
  property_id: string
  org_id: string
  filename: string
  mime_type: string
  storage_key: string
  summary: string | null
  created_at: string
  updated_at: string
}
```

## API Routes

### POST /api/documents/analyze
Upload and analyze a property document.

**Request:**
```json
{
  "property_id": "uuid",
  "filename": "inspection_report.pdf",
  "mime_type": "application/pdf",
  "file_base64": "base64-encoded-file"
}
```

**Response:**
```json
{
  "id": "uuid",
  "property_id": "uuid",
  "org_id": "uuid",
  "filename": "inspection_report.pdf",
  "mime_type": "application/pdf",
  "storage_key": "org-id/property-id/doc_timestamp_random.pdf",
  "summary": "- Roof in good condition with ~10 years remaining life\n- HVAC system updated 2020\n- Minor cosmetic repairs needed in master bath",
  "created_at": "2026-06-04T12:00:00Z",
  "updated_at": "2026-06-04T12:00:00Z"
}
```

### DELETE /api/documents/[id]
Delete a property document and its storage file.

**Response:**
```json
{
  "success": true
}
```

## Integration

### In a Property Detail Page

```tsx
import { useState } from 'react'
import DocumentList from '@/components/documents/DocumentList'
import DocumentUploadModal from '@/components/documents/DocumentUploadModal'
import { Button } from '@/components/ui/button'
import type { PropertyDocument } from '@/components/documents/types'

export default function PropertyDocuments({ propertyId }: { propertyId: string }) {
  const [documents, setDocuments] = useState<PropertyDocument[]>([])
  const [uploadOpen, setUploadOpen] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Documents</h3>
        <Button onClick={() => setUploadOpen(true)}>Upload Document</Button>
      </div>

      <DocumentList
        propertyId={propertyId}
        documents={documents}
        onDocumentsChange={setDocuments}
      />

      <DocumentUploadModal
        propertyId={propertyId}
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUploadSuccess={doc => setDocuments(prev => [doc, ...prev])}
      />
    </div>
  )
}
```

## Dependencies

- `@/components/ui/button` - shadcn Button
- `@/components/ui/dialog` - shadcn Dialog
- `@/lib/documents/summarizePropertyDoc` - Claude vision summarization
- Supabase Storage (bucket: `property-documents`)
- Supabase Postgres (table: `property_documents`)

## Database Migration Required

Create `property_documents` table with org-scoped RLS:

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

-- RLS policies
ALTER TABLE property_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org documents"
  ON property_documents FOR SELECT
  USING (org_id = auth.jwt() ->> 'org_id'::text);

CREATE POLICY "Users can insert org documents"
  ON property_documents FOR INSERT
  WITH CHECK (org_id = auth.jwt() ->> 'org_id'::text);

CREATE POLICY "Users can delete org documents"
  ON property_documents FOR DELETE
  USING (org_id = auth.jwt() ->> 'org_id'::text);
```

## Supported File Types

- JPEG (image/jpeg)
- PNG (image/png)
- WebP (image/webp)
- PDF (application/pdf)

Maximum file size: 5MB

## Error Handling

- Unsupported file types: returns user-friendly error
- File too large: shows size limit message
- Upload failure: graceful error display with retry option
- Analysis failure: document stored without summary (nullable field)

## Performance Notes

- Documents analyzed at upload time with 60s timeout
- Analysis failure is non-blocking (returns null summary)
- Storage files organized by org_id and property_id for logical grouping
- Lazy-load document list on property detail page for better performance
