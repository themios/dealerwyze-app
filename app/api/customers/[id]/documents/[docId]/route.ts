import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireProfile } from '@/lib/auth/profile'

const BUCKET = 'customer-docs'

// Storage: service role required — Supabase Storage ignores session-level RLS

// DELETE /api/customers/[id]/documents/[docId]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
): Promise<NextResponse> {
  const { id: customerId, docId } = await params

  const profile = await requireProfile()
  const supabase = await createClient()
  const storage = createServiceClient()

  // Fetch the document — verify ownership via RLS + explicit user_id check
  const { data: doc, error: fetchError } = await supabase
    .from('customer_documents')
    .select('id, file_key, user_id, customer_id')
    .eq('id', docId)
    .eq('customer_id', customerId)
    .eq('user_id', profile.org_id)
    .single()

  if (fetchError || !doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  // Delete from Storage via service client (bypasses storage RLS)
  // ✓ Security: Verify storage path includes org_id prefix to prevent cross-org file deletion
  const expectedPrefix = `${profile.org_id}/`
  if (!doc.file_key.startsWith(expectedPrefix)) {
    console.warn(
      '[documents DELETE] Rejected storage access: file_key does not belong to org',
      { fileKey: doc.file_key, orgId: profile.org_id }
    )
    return NextResponse.json({ error: 'Unauthorized: invalid file path' }, { status: 403 })
  }

  const { error: storageError } = await storage.storage
    .from(BUCKET)
    .remove([doc.file_key])

  if (storageError) {
    console.error('[documents DELETE] storage error:', storageError.message)
    return NextResponse.json({ error: 'Failed to delete file from storage' }, { status: 500 })
  }

  // Delete DB record
  const { error: dbError } = await supabase
    .from('customer_documents')
    .delete()
    .eq('id', docId)
    .eq('user_id', profile.org_id)

  if (dbError) {
    console.error('[documents DELETE] db error:', dbError.message)
    return NextResponse.json({ error: 'Failed to delete document record' }, { status: 500 })
  }

  return NextResponse.json({ success: true }, { status: 200 })
}
