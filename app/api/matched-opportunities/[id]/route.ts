import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const profile = await requireProfile()
  const client = createClient()

  try {
    const { id } = params

    // Fetch with verification of ownership
    const { data, error } = await client
      .from('matched_opportunities')
      .select(
        `
        id,
        status,
        matched_at,
        agent_notified_at,
        buyer_profile_id,
        listing_id,
        buyer_profiles!inner (
          id,
          buyer_name,
          location,
          price_min,
          price_max,
          bedrooms_min,
          bedrooms_max,
          bathrooms_min,
          bathrooms_max,
          sqft_min,
          sqft_max,
          year_built_min,
          year_built_max,
          property_type,
          hoa_allowed,
          agent_id
        ),
        vehicles!inner (
          id,
          address,
          city,
          bedrooms,
          bathrooms,
          price,
          sqft,
          year_built,
          property_type,
          mls_number,
          photos
        )
      `
      )
      .eq('id', id)
      .single()

    if (error || !data) {
      return NextResponse.json(
        { error: 'Matched opportunity not found' },
        { status: 404 }
      )
    }

    // Check ownership
    const buyerProfile = (data as any).buyer_profiles
    if (buyerProfile.agent_id !== profile.id) {
      return NextResponse.json(
        { error: 'Not authorized' },
        { status: 403 }
      )
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('Error fetching matched opportunity:', err)
    return NextResponse.json(
      { error: 'Failed to fetch matched opportunity' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const profile = await requireProfile()
  const client = createClient()

  try {
    const { id } = params
    const { status } = await request.json()

    if (!status) {
      return NextResponse.json(
        { error: 'status required' },
        { status: 400 }
      )
    }

    // Validate status
    const validStatuses = ['new', 'sent', 'reviewed', 'ignored', 'closed']
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      )
    }

    // Verify ownership
    const { data: existing, error: fetchError } = await client
      .from('matched_opportunities')
      .select(
        `
        id,
        buyer_profile_id,
        buyer_profiles!inner (
          id,
          agent_id
        )
      `
      )
      .eq('id', id)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: 'Matched opportunity not found' },
        { status: 404 }
      )
    }

    const buyerProfile = (existing as any).buyer_profiles
    if (buyerProfile.agent_id !== profile.id) {
      return NextResponse.json(
        { error: 'Not authorized' },
        { status: 403 }
      )
    }

    // Build update payload
    const updateData: Record<string, unknown> = { status }
    if (status === 'sent') {
      updateData.agent_notified_at = new Date().toISOString()
    }

    // Update
    const { data, error: updateError } = await client
      .from('matched_opportunities')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (updateError) throw updateError

    return NextResponse.json(data)
  } catch (err) {
    console.error('Error updating matched opportunity:', err)
    return NextResponse.json(
      { error: 'Failed to update matched opportunity' },
      { status: 500 }
    )
  }
}
