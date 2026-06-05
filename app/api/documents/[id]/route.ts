import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * DELETE /api/documents/[id]
 *
 * Delete a property document and its storage file.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const profile = await requireProfile()
    const { id: docId } = await params

    if (!docId) {
      return NextResponse.json(
        { error: 'Document ID is required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const service = createServiceClient()

    // Fetch document to verify ownership and get storage key
    const { data: document, error: fetchErr } = await supabase
      .from('property_documents')
      .select('id, org_id, storage_key')
      .eq('id', docId)
      .single()

    if (fetchErr || !document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      )
    }

    // Verify org ownership
    if (document.org_id !== profile.org_id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    // Delete from storage
    if (document.storage_key) {
      const { error: deleteStorageErr } = await service.storage
        .from('property-documents')
        .remove([document.storage_key])

      if (deleteStorageErr) {
        console.error('[documents/delete] storage delete error:', deleteStorageErr)
        // Continue — still delete DB record
      }
    }

    // Delete document record
    const { error: deleteErr } = await supabase
      .from('property_documents')
      .delete()
      .eq('id', docId)

    if (deleteErr) {
      console.error('[documents/delete] db delete error:', deleteErr)
      return NextResponse.json(
        { error: 'Failed to delete document' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[documents/delete] error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
