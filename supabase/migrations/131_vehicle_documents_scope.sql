-- Split vehicle files: dealer-private (inventory) vs customer-visible website reports (Carfax, etc.).

ALTER TABLE public.vehicle_documents
  ADD COLUMN IF NOT EXISTS document_scope text NOT NULL DEFAULT 'website';

ALTER TABLE public.vehicle_documents
  DROP CONSTRAINT IF EXISTS vehicle_documents_document_scope_check;

ALTER TABLE public.vehicle_documents
  ADD CONSTRAINT vehicle_documents_document_scope_check
  CHECK (document_scope IN ('inventory', 'website'));

COMMENT ON COLUMN public.vehicle_documents.document_scope IS
  'inventory = dealer-only (BOS, smog, mechanic receipts); website = shopper-visible on VDP + included in AI overview context.';
