import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import { normalizePhone } from '@/lib/utils/phone'
import type { ProspectExtractionResult } from '@/components/prospects/types'

/**
 * POST /api/prospects/import
 *
 * Import an extracted prospect as a new customer.
 * Takes the extracted prospect data and creates a customer record.
 *
 * Request body:
 * {
 *   first_name: ScanField
 *   last_name: ScanField
 *   phone: ScanField
 *   email: ScanField
 *   city: ScanField
 *   state: ScanField
 *   zip: ScanField
 *   property_type: ScanField
 *   property_address: ScanField
 *   prospect_intent: ScanField
 *   lead_source: ScanField
 *   notes: ScanField
 *   ... (all ProspectExtractionResult fields)
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const profile = await requireProfile()
    const supabase = await createClient()

    const result = (await req.json()) as ProspectExtractionResult

    // Build customer name from first/last name
    const firstName = result.first_name?.value?.trim() || ''
    const lastName = result.last_name?.value?.trim() || ''
    const name = [firstName, lastName].filter(Boolean).join(' ').trim()

    if (!name) {
      return NextResponse.json(
        { error: 'First name or last name required' },
        { status: 400 },
      )
    }

    // Extract contact info
    const phone = result.phone?.value
    const email = result.email?.value
    const zip = result.zip?.value

    // Normalize phone if present
    let normalizedPhone: string | null = null
    if (phone) {
      const digits = normalizePhone(phone)
      normalizedPhone = digits && digits.length === 10 ? digits : null
    }

    // Build location
    const city = result.city?.value?.trim() || ''
    const state = result.state?.value?.trim() || ''
    const location = [city, state].filter(Boolean).join(', ').trim() || null

    // Build notes
    const extractedNotes = result.notes?.value?.trim() || ''
    const intentNote = result.prospect_intent?.value
      ? `Intent: ${result.prospect_intent.value}`
      : ''
    const notes = [extractedNotes, intentNote].filter(Boolean).join('\n').trim() || null

    // Build interested_in
    const propertyInfo = result.property_address?.value?.trim() || result.property_type?.value?.trim() || ''

    // Create customer
    const { data: newCustomer, error: insertErr } = await supabase
      .from('customers')
      .insert({
        user_id: profile.org_id,
        name,
        primary_phone: normalizedPhone || null,
        email: email || null,
        zip_code: zip || null,
        city: city || null,
        state: state || null,
        lead_source: result.lead_source?.value || 'other',
        interested_in: propertyInfo || null,
        notes,
      })
      .select('id, name')
      .single()

    if (insertErr || !newCustomer) {
      console.error('[prospects/import] insert error:', insertErr?.message)
      return NextResponse.json(
        { error: 'Failed to create customer' },
        { status: 500 },
      )
    }

    return NextResponse.json(
      {
        customer_id: newCustomer.id,
        name: newCustomer.name,
      },
      { status: 201 },
    )
  } catch (err) {
    console.error('[prospects/import] error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
