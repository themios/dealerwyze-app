import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/lib/audit/log'
import { normalizePhone } from '@/lib/utils/phone'

/**
 * PATCH /api/checklist-documents/verify
 *
 * Verify extracted document data and merge into customer profile.
 * User has reviewed and approved the extracted information.
 *
 * Request body:
 * {
 *   document_id: string (UUID)
 *   customer_id: string (UUID)
 *   verified_data: {
 *     first_name?: string
 *     last_name?: string
 *     address_line_1?: string
 *     address_line_2?: string
 *     city?: string
 *     state?: string
 *     zip?: string
 *     date_of_birth?: string
 *     phone?: string
 *   }
 *   notes?: string
 * }
 */
export async function PATCH(req: NextRequest) {
  try {
    const profile = await requireProfile()
    const supabase = await createClient()

    const body = await req.json() as {
      document_id: string
      customer_id: string
      verified_data: Record<string, unknown>
      notes?: string
    }

    const { document_id, customer_id, verified_data, notes } = body

    if (!document_id || !customer_id) {
      return NextResponse.json(
        { error: 'document_id and customer_id required' },
        { status: 400 },
      )
    }

    // Verify document exists and belongs to org
    const { data: doc } = await supabase
      .from('checklist_documents')
      .select('id, task_id, org_id')
      .eq('id', document_id)
      .eq('org_id', profile.org_id)
      .maybeSingle()

    if (!doc) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 },
      )
    }

    // Verify customer exists and belongs to org
    const { data: customer } = await supabase
      .from('customers')
      .select('id, user_id')
      .eq('id', customer_id)
      .eq('user_id', profile.org_id)
      .maybeSingle()

    if (!customer) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 },
      )
    }

    // Mark document as verified
    await supabase
      .from('checklist_documents')
      .update({
        verified: true,
        verified_by: profile.id,
        verified_at: new Date().toISOString(),
        verification_notes: notes || null,
      })
      .eq('id', document_id)

    // Merge data into customer profile
    const updates: Record<string, unknown> = {}

    if (verified_data.first_name && !verified_data.first_name) {
      updates.first_name = null
    } else if (verified_data.first_name) {
      updates.first_name = String(verified_data.first_name).trim()
    }

    if (verified_data.last_name) {
      updates.last_name = String(verified_data.last_name).trim()
    }

    if (verified_data.address_line_1) {
      updates.address = String(verified_data.address_line_1).trim()
    }

    if (verified_data.address_line_2) {
      updates.address_line_2 = String(verified_data.address_line_2).trim()
    }

    if (verified_data.city) {
      updates.city = String(verified_data.city).trim()
    }

    if (verified_data.state) {
      updates.state = String(verified_data.state).trim().toUpperCase()
    }

    if (verified_data.zip) {
      updates.zip_code = String(verified_data.zip).trim()
    }

    if (verified_data.date_of_birth) {
      updates.date_of_birth = String(verified_data.date_of_birth)
    }

    if (verified_data.phone) {
      const normalized = normalizePhone(String(verified_data.phone))
      if (normalized && normalized.length === 10) {
        updates.primary_phone = normalized
      }
    }

    // Only update if there's data to merge
    if (Object.keys(updates).length > 0) {
      await supabase
        .from('customers')
        .update(updates)
        .eq('id', customer_id)
    }

    // Log the verification
    await writeAuditLog({
      orgId: profile.org_id,
      actorId: profile.id,
      actorType: 'user',
      action: 'document_verified',
      entityType: 'checklist_document',
      entityId: document_id,
      metadata: {
        customer_id,
        fields_updated: Object.keys(updates),
        notes,
      },
    }).catch(err => console.error('[checklist-documents/verify] audit log error:', err))

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[checklist-documents/verify] error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
