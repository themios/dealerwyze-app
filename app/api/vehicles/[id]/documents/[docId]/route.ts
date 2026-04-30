import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireProfile } from '@/lib/auth/profile'

const BUCKET = 'vehicle-docs'

// DELETE /api/vehicles/[id]/documents/[docId]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
): Promise<NextResponse> {
  try {
    const { id: vehicleId, docId } = await params
    const profile = await requireProfile()
    // Auth client: RLS enforces org isolation for the vehicle_documents DB delete.
    const supabase = await createClient()
    // Service client: Supabase Storage does not respect session-level RLS — service key required to remove objects.
    const storage = createServiceClient()

    // Fetch the document — must belong to caller's org
    const { data: doc, error: fetchErr } = await supabase
      .from('vehicle_documents')
      .select('id, file_key')
      .eq('id', docId)
      .eq('vehicle_id', vehicleId)
      .eq('user_id', profile.org_id)
      .maybeSingle()

    if (fetchErr) {
      console.error('[vehicle documents DELETE] fetch error:', fetchErr.message)
      return NextResponse.json({ error: 'Failed to fetch document' }, { status: 500 })
    }
    if (!doc) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // ✓ Security: Verify storage path includes org_id prefix to prevent cross-org file deletion
    const expectedPrefix = `${profile.org_id}/`
    if (!doc.file_key.startsWith(expectedPrefix)) {
      console.warn(
        '[vehicle documents DELETE] Rejected storage access: file_key does not belong to org',
        { fileKey: doc.file_key, orgId: profile.org_id }
      )
      return NextResponse.json({ error: 'Unauthorized: invalid file path' }, { status: 403 })
    }

    // Delete DB record first — if storage fails, better to orphan than to leave a dangling DB row
    const { error: dbErr } = await supabase
      .from('vehicle_documents')
      .delete()
      .eq('id', docId)
      .eq('user_id', profile.org_id)

    if (dbErr) {
      console.error('[vehicle documents DELETE] db error:', dbErr.message)
      return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 })
    }

    // Best-effort storage removal
    const { error: storageErr } = await storage.storage.from(BUCKET).remove([doc.file_key])
    if (storageErr) {
      console.error('[vehicle documents DELETE] storage remove failed (orphan):', storageErr.message, 'key:', doc.file_key)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[vehicle documents DELETE] unhandled error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
