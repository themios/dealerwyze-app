import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/customers/create
 * Create a new customer with org_id from authenticated profile
 */
export async function POST(req: NextRequest) {
  try {
    const profile = await requireProfile()
    const supabase = await createClient()

    const body = await req.json() as {
      name?: string
      interested_in?: string
      lead_source?: string
      primary_phone?: string
      secondary_phone?: string
      email?: string
      notes?: string
      zip_code?: string
    }

    if (!body.primary_phone?.trim() && !body.email?.trim()) {
      return NextResponse.json({ error: 'Phone or email is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('customers')
      .insert({
        user_id: profile.org_id,
        name: body.name?.trim() || 'Unknown',
        interested_in: body.interested_in || null,
        lead_source: body.lead_source || null,
        primary_phone: body.primary_phone || null,
        secondary_phone: body.secondary_phone || null,
        email: body.email || null,
        notes: body.notes || null,
        zip_code: body.zip_code || null,
      })
      .select('id')
      .single()

    if (error || !data) {
      console.error('[customers/create] insert error:', error?.message)
      return NextResponse.json(
        { error: 'Failed to create customer' },
        { status: 500 },
      )
    }

    return NextResponse.json({ id: data.id }, { status: 201 })
  } catch (err) {
    console.error('[customers/create] error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
